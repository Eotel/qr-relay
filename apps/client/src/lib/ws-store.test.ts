import { beforeEach, describe, expect, it } from "vitest";
import type { Clock, TimerId } from "./clock.js";
import { createWsStore } from "./ws-store.js";

class FakeWebSocket {
  static OPEN = 1;
  readyState = 0;
  url: string;
  sent: string[] = [];
  private listeners: Record<string, ((ev: unknown) => void)[]> = {};
  closed = false;

  constructor(url: string) {
    this.url = url;
  }

  addEventListener(type: string, fn: (ev: unknown) => void): void {
    const list = this.listeners[type] ?? [];
    list.push(fn);
    this.listeners[type] = list;
  }

  removeEventListener(type: string, fn: (ev: unknown) => void): void {
    this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== fn);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
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

type ScheduledTimer = { id: TimerId; fn: () => void; ms: number };

function fakeClock() {
  let nowMs = 0;
  let nextId = 1 as TimerId;
  const pending: ScheduledTimer[] = [];
  const clock: Clock = {
    now: () => nowMs,
    setTimeout: (fn, ms) => {
      const id = nextId++ as TimerId;
      pending.push({ id, fn, ms });
      return id;
    },
    clearTimeout: (id) => {
      const idx = pending.findIndex((t) => t.id === id);
      if (idx >= 0) pending.splice(idx, 1);
    },
  };
  return {
    clock,
    pending,
    advance(ms: number) {
      nowMs += ms;
      const due = pending.splice(0);
      for (const t of due) t.fn();
    },
  };
}

function setup() {
  const sockets: FakeWebSocket[] = [];
  const socketFactory = (url: string): FakeWebSocket => {
    const s = new FakeWebSocket(url);
    sockets.push(s);
    return s;
  };
  const { clock, pending, advance } = fakeClock();
  const useWs = createWsStore({
    socketFactory: socketFactory as unknown as (url: string) => WebSocket,
    clock,
    buildUrl: (code, pid) => `ws://test/ws/${code}?pid=${pid}`,
  });
  return { useWs, sockets, clock, pending, advance };
}

describe("createWsStore", () => {
  beforeEach(() => {
    // 各テストは独立した store を使う
  });

  it("connect: socketFactory を呼んで URL を組み立てる", () => {
    const { useWs, sockets } = setup();
    useWs.getState().connect("ABC", "p1");
    expect(sockets).toHaveLength(1);
    expect(sockets[0]?.url).toBe("ws://test/ws/ABC?pid=p1");
  });

  it("open イベントで connected=true", () => {
    const { useWs, sockets } = setup();
    useWs.getState().connect("ABC", "p1");
    expect(useWs.getState().connected).toBe(false);
    sockets[0]?.emitOpen();
    expect(useWs.getState().connected).toBe(true);
  });

  it("state メッセージで players/state/metrics を更新", () => {
    const { useWs, sockets } = setup();
    useWs.getState().connect("ABC", "p1");
    sockets[0]?.emitOpen();
    sockets[0]?.emitMessage({
      t: "state",
      state: { tick: 1 },
      metrics: [{ kind: "count", label: "scans", total: 3 }],
      players: [{ id: "p1", name: "Alice", joinedAt: 0 }],
    });
    const s = useWs.getState();
    expect(s.state).toEqual({ tick: 1 });
    expect(s.players).toHaveLength(1);
    expect(s.metrics).toHaveLength(1);
  });

  it("players メッセージは players だけ更新", () => {
    const { useWs, sockets } = setup();
    useWs.getState().connect("ABC", "p1");
    sockets[0]?.emitOpen();
    sockets[0]?.emitMessage({ t: "players", players: [{ id: "p2", name: "Bob", joinedAt: 0 }] });
    expect(useWs.getState().players[0]?.id).toBe("p2");
  });

  it("error メッセージで lastError をセット", () => {
    const { useWs, sockets } = setup();
    useWs.getState().connect("ABC", "p1");
    sockets[0]?.emitOpen();
    sockets[0]?.emitMessage({ t: "error", message: "boom" });
    expect(useWs.getState().lastError).toBe("boom");
  });

  it("close 後、clock.setTimeout 経由で再接続する", () => {
    const { useWs, sockets, pending, advance } = setup();
    useWs.getState().connect("ABC", "p1");
    sockets[0]?.emitOpen();
    sockets[0]?.emit("close");
    expect(useWs.getState().connected).toBe(false);
    expect(pending).toHaveLength(1);
    advance(2000);
    expect(sockets).toHaveLength(2);
    expect(sockets[1]?.url).toBe("ws://test/ws/ABC?pid=p1");
  });

  it("disconnect: 予約済みの再接続タイマーをキャンセル", () => {
    const { useWs, sockets, pending } = setup();
    useWs.getState().connect("ABC", "p1");
    sockets[0]?.emit("close");
    expect(pending).toHaveLength(1);
    useWs.getState().disconnect();
    expect(pending).toHaveLength(0);
  });

  it("send: socket が OPEN のときだけ JSON を送る", () => {
    const { useWs, sockets } = setup();
    useWs.getState().connect("ABC", "p1");
    useWs.getState().send({ t: "ping" });
    expect(sockets[0]?.sent).toEqual([]);
    sockets[0]?.emitOpen();
    useWs.getState().send({ t: "ping" });
    expect(sockets[0]?.sent).toEqual([JSON.stringify({ t: "ping" })]);
  });

  it("壊れた JSON メッセージは無視 (例外を投げない)", () => {
    const { useWs, sockets } = setup();
    useWs.getState().connect("ABC", "p1");
    sockets[0]?.emitOpen();
    expect(() => sockets[0]?.emit("message", { data: "not json" } as unknown)).not.toThrow();
  });

  it("setSnapshot で部分更新できる", () => {
    const { useWs } = setup();
    useWs.getState().setSnapshot({ players: [{ id: "x", name: "X", joinedAt: 0 }] });
    expect(useWs.getState().players[0]?.id).toBe("x");
    useWs.getState().setSnapshot({ state: { foo: 1 } });
    expect(useWs.getState().state).toEqual({ foo: 1 });
    expect(useWs.getState().players[0]?.id).toBe("x");
  });
});
