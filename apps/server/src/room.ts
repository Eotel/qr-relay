import type { Player } from "@qr-relay/core";
import { type ScanPayloadV1, WsClientMsg } from "@qr-relay/core";
import "@qr-relay/handlers";
import { type Clock, systemClock } from "./ports.js";
import {
  type RoomMeta,
  type Stored,
  computeStateAndMetrics,
  reduceInit,
  reduceJoin,
  reduceScan,
  reduceStart,
} from "./room-domain.js";

export class RoomDurableObject implements DurableObject {
  private readonly state: DurableObjectState;
  private readonly clock: Clock;
  private recentNonces: Map<string, number> = new Map();

  constructor(state: DurableObjectState, _env: unknown, clock: Clock = systemClock) {
    this.state = state;
    this.clock = clock;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      return this.handleWebSocket(request, url);
    }
    if (url.pathname === "/init" && request.method === "POST") return this.handleInit(request);
    if (url.pathname === "/join" && request.method === "POST") return this.handleJoin(request);
    if (url.pathname === "/state" && request.method === "GET") return this.handleGetState();
    if (url.pathname === "/start" && request.method === "POST") return this.handleStart();
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
    const r = reduceInit(body, this.clock.now());
    if (r.kind === "error") return json(r.body, r.status);
    await this.saveStored(r.stored);
    return json({ ok: true, room: r.stored.meta });
  }

  private async handleJoin(request: Request): Promise<Response> {
    const body = (await request.json()) as { playerId: string; name: string };
    const stored = await this.loadStored();
    if (!stored) return json({ error: "room not initialized" }, 404);
    const next = reduceJoin(stored, body, this.clock.now());
    await this.saveStored(next);
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

  private async handleStart(): Promise<Response> {
    const stored = await this.loadStored();
    if (!stored) return json({ error: "room not initialized" }, 404);
    const r = reduceStart(stored, this.clock.now());
    await this.saveStored(r.stored);
    this.broadcast({
      t: "state",
      state: r.stored.state,
      metrics: r.metrics,
      players: r.stored.players,
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
    this.broadcast({
      t: "state",
      state: result.stored.state,
      metrics: result.metrics,
      players: result.stored.players,
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
