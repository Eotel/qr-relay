import type { Player } from "@qr-relay/core";
import { JoinRequest, type ScanPayloadV1, WsClientMsg } from "@qr-relay/core";
import "@qr-relay/handlers";
import {
  type AlarmScheduler,
  type Clock,
  createDurableObjectAlarmScheduler,
  systemClock,
} from "./ports.js";
import {
  DEFAULT_CLOSE_AFTER_MS,
  DEFAULT_WARN_AFTER_MS,
  type PhaseResult,
  type RoomMeta,
  type Stored,
  computeStateAndMetrics,
  decideAlarmAction,
  reduceInit,
  reduceJoin,
  reducePause,
  reduceReset,
  reduceResume,
  reduceScan,
  reduceStart,
  touchActivity,
} from "./room-domain.js";

type PhaseAction = "start" | "pause" | "resume" | "reset";

const phaseReducers: Record<PhaseAction, (stored: Stored, now: number) => PhaseResult> = {
  start: reduceStart,
  pause: reducePause,
  resume: reduceResume,
  reset: reduceReset,
};

/** Phase actions whose success counts as room activity (extends the timer). */
const ACTIVITY_PHASE_ACTIONS: ReadonlySet<PhaseAction> = new Set(["start", "reset"]);

type RoomEnv = {
  INACTIVITY_WARN_MS?: string;
  INACTIVITY_CLOSE_MS?: string;
};

function parsePositiveInt(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

export class RoomDurableObject implements DurableObject {
  private readonly state: DurableObjectState;
  private readonly clock: Clock;
  private readonly alarms: AlarmScheduler;
  private readonly warnAfterMs: number;
  private readonly closeAfterMs: number;
  private recentNonces: Map<string, number> = new Map();
  /** null = not hydrated yet; otherwise mirrors storage `inactivityWarned`. */
  private inactivityWarned: boolean | null = null;

  constructor(
    state: DurableObjectState,
    env?: RoomEnv,
    clock: Clock = systemClock,
    alarms?: AlarmScheduler,
  ) {
    this.state = state;
    this.clock = clock;
    this.alarms = alarms ?? createDurableObjectAlarmScheduler(state.storage);
    this.warnAfterMs = parsePositiveInt(env?.INACTIVITY_WARN_MS) ?? DEFAULT_WARN_AFTER_MS;
    this.closeAfterMs = parsePositiveInt(env?.INACTIVITY_CLOSE_MS) ?? DEFAULT_CLOSE_AFTER_MS;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      return this.handleWebSocket(request, url);
    }
    if (url.pathname === "/init" && request.method === "POST") return this.handleInit(request);
    if (url.pathname === "/join" && request.method === "POST") return this.handleJoin(request);
    if (url.pathname === "/state" && request.method === "GET") return this.handleGetState();
    if (url.pathname === "/start" && request.method === "POST")
      return this.handlePhaseRest("start");
    if (url.pathname === "/pause" && request.method === "POST")
      return this.handlePhaseRest("pause");
    if (url.pathname === "/resume" && request.method === "POST")
      return this.handlePhaseRest("resume");
    if (url.pathname === "/reset" && request.method === "POST")
      return this.handlePhaseRest("reset");
    return new Response("Not found", { status: 404 });
  }

  private async loadStored(): Promise<Stored | null> {
    const meta = await this.state.storage.get<RoomMeta>("meta");
    if (!meta) return null;
    const players = (await this.state.storage.get<Player[]>("players")) ?? [];
    const state = await this.state.storage.get<unknown>("state");
    // Defensive: rooms persisted before the inactivity timer existed lack
    // lastActivityAt. Fall back to createdAt so the alarm has a starting point.
    const normalizedMeta: RoomMeta =
      meta.lastActivityAt === undefined ? { ...meta, lastActivityAt: meta.createdAt } : meta;
    return { meta: normalizedMeta, players, state };
  }

  private async getInactivityWarned(): Promise<boolean> {
    if (this.inactivityWarned === null) {
      const v = await this.state.storage.get<boolean>("inactivityWarned");
      this.inactivityWarned = v === true;
    }
    return this.inactivityWarned;
  }

  private async setInactivityWarned(v: boolean): Promise<void> {
    this.inactivityWarned = v;
    if (v) {
      await this.state.storage.put("inactivityWarned", true);
    } else {
      await this.state.storage.delete("inactivityWarned");
    }
  }

  /**
   * Side effects after any activity signal:
   * 1. Arm the next warning alarm at `lastActivityAt + warnAfterMs`.
   * 2. If we had previously broadcast a warning, send `inactivity-cleared`
   *    so the client dismisses its modal.
   */
  private async onActivity(lastActivityAt: number): Promise<void> {
    await this.alarms.setAlarm(lastActivityAt + this.warnAfterMs);
    if (await this.getInactivityWarned()) {
      await this.setInactivityWarned(false);
      this.broadcast({ t: "inactivity-cleared" });
    }
  }

  async alarm(): Promise<void> {
    const stored = await this.loadStored();
    if (!stored) {
      await this.alarms.deleteAlarm();
      return;
    }
    const decision = decideAlarmAction(
      stored.meta.lastActivityAt,
      this.clock.now(),
      this.warnAfterMs,
      this.closeAfterMs,
    );
    if (decision.kind === "reschedule") {
      await this.alarms.setAlarm(decision.at);
      return;
    }
    if (decision.kind === "warn") {
      await this.setInactivityWarned(true);
      this.broadcast({ t: "inactivity-warning", closeAt: decision.closeAt });
      await this.alarms.setAlarm(decision.rescheduleAt);
      return;
    }
    // close: notify, drop sockets, wipe storage so a future visitor with the
    // same code gets a fresh room.
    this.broadcast({ t: "closed", reason: "inactivity" });
    for (const ws of this.state.getWebSockets()) {
      try {
        ws.close(1001, "inactivity");
      } catch {
        // ignore broken sockets
      }
    }
    await this.state.storage.deleteAll();
    await this.alarms.deleteAlarm();
    this.inactivityWarned = false;
    this.recentNonces = new Map();
  }

  private async saveStored(stored: Stored): Promise<void> {
    await this.state.storage.put("meta", stored.meta);
    await this.state.storage.put("players", stored.players);
    if (stored.state === undefined) {
      await this.state.storage.delete("state");
    } else {
      await this.state.storage.put("state", stored.state);
    }
  }

  private async handleInit(request: Request): Promise<Response> {
    const body = (await request.json()) as {
      code: string;
      handlerId: string;
      handlerConfig: unknown;
    };
    const r = reduceInit(body, this.clock.now());
    if (r.kind === "error") return json(r.body, r.status);
    await this.saveStored(r.stored);
    await this.onActivity(r.stored.meta.lastActivityAt);
    return json({ ok: true, room: r.stored.meta });
  }

  private async handleJoin(request: Request): Promise<Response> {
    const raw = await request.json();
    const parsed = JoinRequest.safeParse(raw);
    if (!parsed.success) {
      return json({ error: "invalid join request", issues: parsed.error.issues }, 400);
    }
    const stored = await this.loadStored();
    if (!stored) return json({ error: "room not initialized" }, 404);
    const next = reduceJoin(stored, parsed.data, this.clock.now());
    await this.saveStored(next);
    await this.onActivity(next.meta.lastActivityAt);
    this.broadcast({ t: "players", players: next.players });
    return json({ ok: true, room: next.meta, players: next.players });
  }

  private async handleGetState(): Promise<Response> {
    const stored = await this.loadStored();
    if (!stored) return json({ error: "room not initialized" }, 404);
    const { state, metrics } = computeStateAndMetrics(stored, this.clock.now());
    return json({
      room: stored.meta,
      players: stored.players,
      state,
      metrics,
    });
  }

  private async handlePhaseRest(action: PhaseAction): Promise<Response> {
    const result = await this.applyPhase(action);
    if (result.kind === "error") {
      return json({ ok: false, error: result.message }, 409);
    }
    return json({ ok: true, room: result.stored.meta });
  }

  /**
   * Apply a phase transition, persist, and broadcast. Returns the result so
   * REST handlers can map errors to HTTP status. WS callers ignore the body
   * and surface errors over the socket instead.
   */
  private async applyPhase(action: PhaseAction): Promise<PhaseResult> {
    const stored = await this.loadStored();
    if (!stored) return { kind: "error", message: "room not initialized" };
    if (action === "reset") {
      // reset wipes nonces so re-running games don't inherit duplicate-nonce rejections.
      this.recentNonces = new Map();
    }
    const r = phaseReducers[action](stored, this.clock.now());
    if (r.kind === "error") return r;
    await this.saveStored(r.stored);
    if (ACTIVITY_PHASE_ACTIONS.has(action)) {
      await this.onActivity(r.stored.meta.lastActivityAt);
    }
    this.broadcast({
      t: "state",
      state: r.stored.state,
      metrics: r.metrics,
      players: r.stored.players,
      phase: r.stored.meta.phase,
    });
    return r;
  }

  private handleWebSocket(_request: Request, url: URL): Response {
    const playerId = url.searchParams.get("pid");
    if (!playerId) return new Response("missing pid", { status: 400 });
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.state.acceptWebSocket(server, [playerId]);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, msg: ArrayBuffer | string): Promise<void> {
    const text = typeof msg === "string" ? msg : new TextDecoder().decode(msg);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      ws.send(JSON.stringify({ t: "error", message: "invalid json" }));
      return;
    }
    const result = WsClientMsg.safeParse(parsed);
    if (!result.success) {
      ws.send(JSON.stringify({ t: "error", message: "invalid message" }));
      return;
    }
    const m = result.data;
    if (m.t === "ping") {
      ws.send(JSON.stringify({ t: "pong" }));
      return;
    }
    if (m.t === "keepalive") {
      await this.applyKeepalive();
      return;
    }
    if (m.t === "scan") {
      await this.applyScan(ws, m.payload);
      return;
    }
    if (m.t === "start" || m.t === "pause" || m.t === "resume" || m.t === "reset") {
      await this.applyPhaseWs(ws, m.t);
      return;
    }
  }

  /**
   * "Continue" button on the inactivity modal. Stamps lastActivityAt without
   * any phase transition or state mutation, then runs the activity side
   * effects (reschedule alarm, broadcast cleared if warned).
   */
  private async applyKeepalive(): Promise<void> {
    const stored = await this.loadStored();
    if (!stored) return;
    const next = touchActivity(stored, this.clock.now());
    await this.saveStored(next);
    await this.onActivity(next.meta.lastActivityAt);
  }

  webSocketClose(ws: WebSocket): void {
    try {
      ws.close();
    } catch {
      // ignore
    }
  }

  webSocketError(_ws: WebSocket, _err: unknown): void {
    // surface later
  }

  private async applyPhaseWs(ws: WebSocket, action: PhaseAction): Promise<void> {
    const tags = this.state.getTags(ws);
    const scannerId = tags[0];
    const stored = await this.loadStored();
    if (!stored) {
      ws.send(JSON.stringify({ t: "error", message: "room not initialized" }));
      return;
    }
    if (stored.meta.hostId !== null && scannerId !== stored.meta.hostId) {
      ws.send(JSON.stringify({ t: "error", message: `${action} requires host` }));
      return;
    }
    const result = await this.applyPhase(action);
    if (result.kind === "error") {
      ws.send(JSON.stringify({ t: "error", message: result.message }));
    }
  }

  private async applyScan(ws: WebSocket, payload: typeof ScanPayloadV1._type): Promise<void> {
    const tags = this.state.getTags(ws);
    const scannerId = tags[0];
    if (!scannerId) {
      ws.send(JSON.stringify({ t: "error", message: "no scanner identity" }));
      return;
    }
    const stored = await this.loadStored();
    if (!stored) {
      ws.send(JSON.stringify({ t: "error", message: "room not initialized" }));
      return;
    }

    const result = reduceScan({
      stored,
      scannerId,
      payload,
      recentNonces: this.recentNonces,
      now: this.clock.now(),
    });
    this.recentNonces = result.recentNonces;

    if (result.kind === "error") {
      ws.send(JSON.stringify({ t: "error", message: result.message }));
      return;
    }
    await this.saveStored(result.stored);
    await this.onActivity(result.stored.meta.lastActivityAt);
    this.broadcast({
      t: "state",
      state: result.stored.state,
      metrics: result.metrics,
      players: result.stored.players,
      phase: result.stored.meta.phase,
    });
    for (const ev of result.events) {
      this.broadcast({ t: "event", event: ev });
    }
  }

  private broadcast(msg: unknown): void {
    const text = JSON.stringify(msg);
    for (const ws of this.state.getWebSockets()) {
      try {
        ws.send(text);
      } catch {
        // ignore broken sockets
      }
    }
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
