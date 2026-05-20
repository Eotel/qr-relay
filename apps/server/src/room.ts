import type { Metric, Player, ScanHandler } from "@qr-relay/core";
import { type ScanPayloadV1, WsClientMsg, requireHandler } from "@qr-relay/core";
import "@qr-relay/handlers";

type RoomMeta = {
  code: string;
  handlerId: string;
  handlerConfig: unknown;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
};

type Stored = {
  meta: RoomMeta;
  players: Player[];
  state: unknown;
};

const NONCE_TTL_MS = 5 * 60_000;
const TS_WINDOW_MS = 60_000;

export class RoomDurableObject implements DurableObject {
  private readonly state: DurableObjectState;
  private readonly recentNonces: Map<string, number> = new Map();

  constructor(state: DurableObjectState, _env: unknown) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      return this.handleWebSocket(request, url);
    }

    if (url.pathname === "/init" && request.method === "POST") {
      return this.handleInit(request);
    }
    if (url.pathname === "/join" && request.method === "POST") {
      return this.handleJoin(request);
    }
    if (url.pathname === "/state" && request.method === "GET") {
      return this.handleGetState();
    }
    if (url.pathname === "/start" && request.method === "POST") {
      return this.handleStart();
    }
    return new Response("Not found", { status: 404 });
  }

  private async loadStored(): Promise<Stored | null> {
    const meta = await this.state.storage.get<RoomMeta>("meta");
    if (!meta) return null;
    const players = (await this.state.storage.get<Player[]>("players")) ?? [];
    const state = await this.state.storage.get<unknown>("state");
    return { meta, players, state };
  }

  private async saveStored(stored: Stored): Promise<void> {
    await this.state.storage.put("meta", stored.meta);
    await this.state.storage.put("players", stored.players);
    if (stored.state !== undefined) {
      await this.state.storage.put("state", stored.state);
    }
  }

  private async handleInit(request: Request): Promise<Response> {
    const body = (await request.json()) as {
      code: string;
      handlerId: string;
      handlerConfig: unknown;
    };
    const now = Date.now();
    let handler: ScanHandler<unknown, unknown, unknown>;
    try {
      handler = requireHandler(body.handlerId);
    } catch {
      return json({ error: `unknown handler: ${body.handlerId}` }, 400);
    }
    const cfg = handler.configSchema.safeParse(body.handlerConfig);
    if (!cfg.success) {
      return json({ error: "invalid handler config", issues: cfg.error.issues }, 400);
    }
    const meta: RoomMeta = {
      code: body.code,
      handlerId: body.handlerId,
      handlerConfig: cfg.data,
      createdAt: now,
      startedAt: null,
      endedAt: null,
    };
    const stored: Stored = {
      meta,
      players: [],
      state: undefined,
    };
    await this.saveStored(stored);
    return json({ ok: true, room: meta });
  }

  private async handleJoin(request: Request): Promise<Response> {
    const body = (await request.json()) as { playerId: string; name: string };
    const stored = await this.loadStored();
    if (!stored) return json({ error: "room not initialized" }, 404);
    const existing = stored.players.find((p) => p.id === body.playerId);
    if (!existing) {
      stored.players.push({
        id: body.playerId,
        name: body.name,
        joinedAt: Date.now(),
      });
    } else if (existing.name !== body.name) {
      existing.name = body.name;
    }
    await this.saveStored(stored);
    this.broadcast({ t: "players", players: stored.players });
    return json({ ok: true, room: stored.meta, players: stored.players });
  }

  private async handleGetState(): Promise<Response> {
    const stored = await this.loadStored();
    if (!stored) return json({ error: "room not initialized" }, 404);
    const handler = requireHandler(stored.meta.handlerId);
    const state =
      stored.state ??
      handler.initialState({
        config: stored.meta.handlerConfig,
        players: stored.players,
        now: Date.now(),
      });
    const metrics = handler.metrics({
      state,
      config: stored.meta.handlerConfig,
      players: stored.players,
      now: Date.now(),
    });
    return json({
      room: stored.meta,
      players: stored.players,
      state,
      metrics,
    });
  }

  private async handleStart(): Promise<Response> {
    const stored = await this.loadStored();
    if (!stored) return json({ error: "room not initialized" }, 404);
    const handler = requireHandler(stored.meta.handlerId);
    const now = Date.now();
    stored.state = handler.initialState({
      config: stored.meta.handlerConfig,
      players: stored.players,
      now,
    });
    stored.meta.startedAt = now;
    stored.meta.endedAt = null;
    await this.saveStored(stored);
    const metrics = handler.metrics({
      state: stored.state,
      config: stored.meta.handlerConfig,
      players: stored.players,
      now,
    });
    this.broadcast({
      t: "state",
      state: stored.state,
      metrics,
      players: stored.players,
    });
    return json({ ok: true });
  }

  private handleWebSocket(_request: Request, url: URL): Response {
    const playerId = url.searchParams.get("pid");
    if (!playerId) return new Response("missing pid", { status: 400 });
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.state.acceptWebSocket(server, [playerId]);
    return new Response(null, { status: 101, webSocket: client });
  }

  // hibernation-aware WS handler
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
    if (m.t === "start") {
      await this.handleStart();
      return;
    }
    if (m.t === "scan") {
      await this.applyScan(ws, m.payload);
      return;
    }
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

  private async applyScan(ws: WebSocket, payload: typeof ScanPayloadV1._type): Promise<void> {
    const now = Date.now();
    if (Math.abs(now - payload.ts) > TS_WINDOW_MS) {
      ws.send(JSON.stringify({ t: "error", message: "timestamp out of window" }));
      return;
    }
    this.gcNonces(now);
    if (this.recentNonces.has(payload.nonce)) {
      ws.send(JSON.stringify({ t: "error", message: "duplicate nonce" }));
      return;
    }
    this.recentNonces.set(payload.nonce, now + NONCE_TTL_MS);

    const stored = await this.loadStored();
    if (!stored) {
      ws.send(JSON.stringify({ t: "error", message: "room not initialized" }));
      return;
    }

    const tags = this.state.getTags(ws);
    const scannerId = tags[0];
    if (!scannerId) {
      ws.send(JSON.stringify({ t: "error", message: "no scanner identity" }));
      return;
    }

    if (payload.pid === scannerId) {
      ws.send(JSON.stringify({ t: "error", message: "cannot scan self" }));
      return;
    }

    const scanner = stored.players.find((p) => p.id === scannerId);
    const scanned = stored.players.find((p) => p.id === payload.pid);
    if (!scanner || !scanned) {
      ws.send(JSON.stringify({ t: "error", message: "unknown player" }));
      return;
    }

    const handler = requireHandler(stored.meta.handlerId);
    if (!stored.state) {
      stored.state = handler.initialState({
        config: stored.meta.handlerConfig,
        players: stored.players,
        now,
      });
      stored.meta.startedAt = now;
    }
    const dataResult = handler.dataSchema.safeParse(payload.data ?? {});
    if (!dataResult.success) {
      ws.send(JSON.stringify({ t: "error", message: "invalid payload data" }));
      return;
    }
    const result = handler.onScan({
      state: stored.state,
      config: stored.meta.handlerConfig,
      scanner,
      scanned,
      payloadData: dataResult.data,
      now,
    });
    stored.state = result.nextState;
    if (handler.isOver?.({ state: stored.state, config: stored.meta.handlerConfig, now })) {
      stored.meta.endedAt = now;
    }
    await this.saveStored(stored);

    const metrics = handler.metrics({
      state: stored.state,
      config: stored.meta.handlerConfig,
      players: stored.players,
      now,
    });

    this.broadcast({
      t: "state",
      state: stored.state,
      metrics,
      players: stored.players,
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

  private gcNonces(now: number): void {
    for (const [k, exp] of this.recentNonces) {
      if (exp <= now) this.recentNonces.delete(k);
    }
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
