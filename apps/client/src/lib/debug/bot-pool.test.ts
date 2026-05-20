import type { ScanPayloadV1 } from "@qr-relay/core";
import { describe, expect, it, vi } from "vitest";
import type { FetchLike } from "../api-client.js";
import { createBotPool } from "./bot-pool.js";

class FakeWebSocket {
  static OPEN = 1;
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
    for (const fn of this.listeners.close ?? []) fn({});
  }
  emitOpen(): void {
    this.readyState = FakeWebSocket.OPEN;
    for (const fn of this.listeners.open ?? []) fn({});
  }
  emitMessage(data: unknown): void {
    for (const fn of this.listeners.message ?? []) fn({ data: JSON.stringify(data) });
  }
}

function okResponse(): Response {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function setup() {
  const sockets: FakeWebSocket[] = [];
  const socketFactory = (url: string): WebSocket => {
    const s = new FakeWebSocket(url);
    sockets.push(s);
    return s as unknown as WebSocket;
  };
  const fetchCalls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl: FetchLike = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    fetchCalls.push({ url, init });
    return Promise.resolve(okResponse());
  });
  const pool = createBotPool({
    code: "ABC123",
    fetchImpl,
    socketFactory,
    buildUrl: (code, pid) => `ws://test/ws/${code}?pid=${pid}`,
    nameFor: (i) => `bot-${i + 1}`,
    playerIdFor: (i) => `pid-${i + 1}`,
  });
  return { pool, sockets, fetchCalls, fetchImpl };
}

const payloadFor = (pid: string): ScanPayloadV1 => ({
  v: 1,
  rid: "ABC123",
  pid,
  ts: 1_700_000_000_000,
  nonce: "nonce-x",
});

describe("createBotPool", () => {
  it("addBot: joins via HTTP, opens a WS, exposes the bot", async () => {
    const { pool, sockets, fetchCalls } = setup();
    const id = await pool.addBot();
    expect(id).toBe("pid-1");
    expect(fetchCalls[0]?.url).toBe("/api/rooms/ABC123/join");
    expect(sockets).toHaveLength(1);
    sockets[0]?.emitOpen();
    expect(pool.list()).toHaveLength(1);
    expect(pool.get(id)?.name).toBe("bot-1");
  });

  it("addBots(n): joins n bots and returns their ids", async () => {
    const { pool, sockets } = setup();
    const ids = await pool.addBots(3);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(sockets).toHaveLength(3);
  });

  it("removeBot: disconnects and removes from the pool", async () => {
    const { pool, sockets } = setup();
    const id = await pool.addBot();
    sockets[0]?.emitOpen();
    pool.removeBot(id);
    expect(sockets[0]?.closed).toBe(true);
    expect(pool.list()).toHaveLength(0);
  });

  it("clear: disconnects everything", async () => {
    const { pool, sockets } = setup();
    await pool.addBots(2);
    sockets.forEach((s) => s.emitOpen());
    pool.clear();
    expect(sockets.every((s) => s.closed)).toBe(true);
    expect(pool.list()).toHaveLength(0);
  });

  it("disconnectAll / reconnectAll: closes then reopens fresh sockets without re-joining", async () => {
    const { pool, sockets, fetchImpl } = setup();
    await pool.addBots(2);
    sockets.forEach((s) => s.emitOpen());
    pool.disconnectAll();
    expect(sockets.every((s) => s.closed)).toBe(true);
    (fetchImpl as unknown as ReturnType<typeof vi.fn>).mockClear();
    pool.reconnectAll();
    expect(sockets).toHaveLength(4);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("lastSuccessNonce: updated when a bot sends a scan whose server response confirms it", async () => {
    const { pool, sockets } = setup();
    const id = await pool.addBot();
    sockets[0]?.emitOpen();
    pool.sendScan(id, payloadFor("target"));
    // server confirms scan via event broadcast
    sockets[0]?.emitMessage({
      t: "event",
      event: { kind: "scan", scannerId: "pid-1", scannedId: "target", ts: 1 },
    });
    expect(pool.lastSuccessNonce()).toBe("nonce-x");
  });

  it("lastSuccessNonce: NOT updated when server responds with error after a send", async () => {
    const { pool, sockets } = setup();
    const id = await pool.addBot();
    sockets[0]?.emitOpen();
    pool.sendScan(id, payloadFor("target"));
    sockets[0]?.emitMessage({ t: "error", message: "duplicate nonce" });
    expect(pool.lastSuccessNonce()).toBeNull();
  });

  it("renameBot: updates the bot's display name in place", async () => {
    const { pool } = setup();
    const id = await pool.addBot();
    pool.renameBot(id, "captain-bot");
    expect(pool.get(id)?.name).toBe("captain-bot");
  });

  it("subscribe: notifies on add / remove / clear / status change", async () => {
    const { pool, sockets } = setup();
    const events: number[] = [];
    pool.subscribe(() => events.push(pool.list().length));
    await pool.addBot();
    sockets[0]?.emitOpen();
    await pool.addBot();
    pool.clear();
    expect(events).toContain(1);
    expect(events).toContain(2);
    expect(events[events.length - 1]).toBe(0);
  });
});
