import type { ScanPayloadV1 } from "@qr-relay/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FetchLike } from "../api-client.js";
import { createBotConnection } from "./bot-connection.js";

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = 0;
  url: string;
  sent: string[] = [];
  closed = false;
  private listeners: Record<string, ((ev: unknown) => void)[]> = {};

  constructor(url: string) {
    this.url = url;
  }

  addEventListener(type: string, fn: (ev: unknown) => void): void {
    const list = this.listeners[type] ?? [];
    list.push(fn);
    this.listeners[type] = list;
  }

  send(data: string): void {
    if (this.readyState !== FakeWebSocket.OPEN) throw new Error("not open");
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
    this.readyState = FakeWebSocket.CLOSED;
    this.emit("close");
  }

  emit(type: string, ev: unknown = {}): void {
    for (const fn of this.listeners[type] ?? []) fn(ev);
  }

  emitOpen(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.emit("open");
  }

  emitMessage(data: unknown): void {
    this.emit("message", { data: JSON.stringify(data) });
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function setup() {
  const sockets: FakeWebSocket[] = [];
  const socketFactory = (url: string): FakeWebSocket => {
    const s = new FakeWebSocket(url);
    sockets.push(s);
    return s;
  };
  return { sockets, socketFactory };
}

const samplePayload: ScanPayloadV1 = {
  v: 1,
  rid: "ABC123",
  pid: "target-id",
  ts: 1_700_000_000_000,
  nonce: "nonce-1",
};

describe("createBotConnection", () => {
  beforeEach(() => {});

  it("join: POST /api/rooms/:code/join with body and role default 'client'", async () => {
    const fetchImpl: FetchLike = vi.fn().mockResolvedValueOnce(jsonResponse({ ok: true }));
    const { socketFactory } = setup();
    const bot = createBotConnection({
      code: "ABC123",
      playerId: "bot-1",
      name: "Alice",
      fetchImpl,
      socketFactory: socketFactory as unknown as (url: string) => WebSocket,
      buildUrl: (code, pid) => `ws://test/ws/${code}?pid=${pid}`,
    });

    await bot.join();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    if (!call) throw new Error("no fetch call");
    expect(call[0]).toBe("/api/rooms/ABC123/join");
    expect(call[1]?.method).toBe("POST");
    expect(JSON.parse(call[1]?.body as string)).toEqual({
      playerId: "bot-1",
      name: "Alice",
      role: "client",
    });
  });

  it("join: surfaces role 'host' when configured", async () => {
    const fetchImpl: FetchLike = vi.fn().mockResolvedValueOnce(jsonResponse({ ok: true }));
    const { socketFactory } = setup();
    const bot = createBotConnection({
      code: "ABC123",
      playerId: "bot-1",
      name: "HostBot",
      role: "host",
      fetchImpl,
      socketFactory: socketFactory as unknown as (url: string) => WebSocket,
      buildUrl: (code, pid) => `ws://test/ws/${code}?pid=${pid}`,
    });
    await bot.join();
    const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    if (!call) throw new Error("no fetch call");
    expect(JSON.parse(call[1]?.body as string).role).toBe("host");
  });

  it("join: encodes the room code", async () => {
    const fetchImpl: FetchLike = vi.fn().mockResolvedValueOnce(jsonResponse({ ok: true }));
    const { socketFactory } = setup();
    const bot = createBotConnection({
      code: "A B",
      playerId: "bot-1",
      name: "n",
      fetchImpl,
      socketFactory: socketFactory as unknown as (url: string) => WebSocket,
      buildUrl: (code, pid) => `ws://test/ws/${code}?pid=${pid}`,
    });
    await bot.join();
    const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    if (!call) throw new Error("no fetch call");
    expect(call[0]).toBe("/api/rooms/A%20B/join");
  });

  it("join: rejects on HTTP error", async () => {
    const fetchImpl: FetchLike = vi
      .fn()
      .mockResolvedValueOnce(new Response("nope", { status: 409 }));
    const { socketFactory } = setup();
    const bot = createBotConnection({
      code: "ABC",
      playerId: "bot-1",
      name: "n",
      fetchImpl,
      socketFactory: socketFactory as unknown as (url: string) => WebSocket,
      buildUrl: (code, pid) => `ws://test/ws/${code}?pid=${pid}`,
    });
    await expect(bot.join()).rejects.toThrow(/409/);
  });

  it("connect: opens a WS to /ws/:code?pid=playerId and reports readyState", () => {
    const fetchImpl: FetchLike = vi.fn();
    const { sockets, socketFactory } = setup();
    const bot = createBotConnection({
      code: "ABC",
      playerId: "bot-1",
      name: "n",
      fetchImpl,
      socketFactory: socketFactory as unknown as (url: string) => WebSocket,
      buildUrl: (code, pid) => `ws://test/ws/${code}?pid=${pid}`,
    });

    bot.connect();
    expect(sockets).toHaveLength(1);
    expect(sockets[0]?.url).toBe("ws://test/ws/ABC?pid=bot-1");
    expect(bot.getStatus().readyState).toBe(FakeWebSocket.CONNECTING);

    sockets[0]?.emitOpen();
    expect(bot.getStatus().readyState).toBe(FakeWebSocket.OPEN);
  });

  it("sendScan: serializes the WsClientMsg and increments sentCount + records target", () => {
    const fetchImpl: FetchLike = vi.fn();
    const { sockets, socketFactory } = setup();
    const bot = createBotConnection({
      code: "ABC",
      playerId: "bot-1",
      name: "n",
      fetchImpl,
      socketFactory: socketFactory as unknown as (url: string) => WebSocket,
      buildUrl: (code, pid) => `ws://test/ws/${code}?pid=${pid}`,
    });
    bot.connect();
    sockets[0]?.emitOpen();

    bot.sendScan(samplePayload);

    expect(sockets[0]?.sent).toEqual([JSON.stringify({ t: "scan", payload: samplePayload })]);
    const status = bot.getStatus();
    expect(status.sentCount).toBe(1);
    expect(status.lastTargetId).toBe("target-id");
  });

  it("sendScan: silently no-ops if not open (no throw)", () => {
    const fetchImpl: FetchLike = vi.fn();
    const { socketFactory } = setup();
    const bot = createBotConnection({
      code: "ABC",
      playerId: "bot-1",
      name: "n",
      fetchImpl,
      socketFactory: socketFactory as unknown as (url: string) => WebSocket,
      buildUrl: (code, pid) => `ws://test/ws/${code}?pid=${pid}`,
    });
    bot.connect();
    // never emitOpen
    expect(() => bot.sendScan(samplePayload)).not.toThrow();
    expect(bot.getStatus().sentCount).toBe(0);
  });

  it("sendRaw: pushes the literal string to the socket (garbage injection)", () => {
    const fetchImpl: FetchLike = vi.fn();
    const { sockets, socketFactory } = setup();
    const bot = createBotConnection({
      code: "ABC",
      playerId: "bot-1",
      name: "n",
      fetchImpl,
      socketFactory: socketFactory as unknown as (url: string) => WebSocket,
      buildUrl: (code, pid) => `ws://test/ws/${code}?pid=${pid}`,
    });
    bot.connect();
    sockets[0]?.emitOpen();
    bot.sendRaw("<not json>");
    expect(sockets[0]?.sent).toEqual(["<not json>"]);
    expect(bot.getStatus().sentCount).toBe(1);
  });

  it("onMessage: emits parsed payloads to subscribers; bumps errorCount on server error", () => {
    const fetchImpl: FetchLike = vi.fn();
    const { sockets, socketFactory } = setup();
    const bot = createBotConnection({
      code: "ABC",
      playerId: "bot-1",
      name: "n",
      fetchImpl,
      socketFactory: socketFactory as unknown as (url: string) => WebSocket,
      buildUrl: (code, pid) => `ws://test/ws/${code}?pid=${pid}`,
    });

    const got: unknown[] = [];
    bot.onMessage((m) => got.push(m));

    bot.connect();
    sockets[0]?.emitOpen();
    sockets[0]?.emitMessage({ t: "error", message: "boom" });
    sockets[0]?.emitMessage({ t: "pong" });

    expect(got).toHaveLength(2);
    expect(bot.getStatus().errorCount).toBe(1);
    expect(bot.getStatus().lastError).toBe("boom");
  });

  it("disconnect: closes the underlying socket and updates status", () => {
    const fetchImpl: FetchLike = vi.fn();
    const { sockets, socketFactory } = setup();
    const bot = createBotConnection({
      code: "ABC",
      playerId: "bot-1",
      name: "n",
      fetchImpl,
      socketFactory: socketFactory as unknown as (url: string) => WebSocket,
      buildUrl: (code, pid) => `ws://test/ws/${code}?pid=${pid}`,
    });
    bot.connect();
    sockets[0]?.emitOpen();
    bot.disconnect();
    expect(sockets[0]?.closed).toBe(true);
    expect(bot.getStatus().readyState).toBe(FakeWebSocket.CLOSED);
  });

  it("reconnect: opens a new socket without re-joining", () => {
    const fetchImpl: FetchLike = vi.fn();
    const { sockets, socketFactory } = setup();
    const bot = createBotConnection({
      code: "ABC",
      playerId: "bot-1",
      name: "n",
      fetchImpl,
      socketFactory: socketFactory as unknown as (url: string) => WebSocket,
      buildUrl: (code, pid) => `ws://test/ws/${code}?pid=${pid}`,
    });
    bot.connect();
    sockets[0]?.emitOpen();
    bot.disconnect();

    bot.connect();
    expect(sockets).toHaveLength(2);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
