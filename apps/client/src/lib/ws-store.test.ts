import { beforeEach, describe, expect, it } from "vitest";
import type { Clock, TimerId } from "./clock.js";
import { createWsStore, displayMs } from "./ws-store.js";

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
    useWs.getState().connect("ABC", "p1", "client");
    expect(sockets).toHaveLength(1);
    expect(sockets[0]?.url).toBe("ws://test/ws/ABC?pid=p1");
  });

  it("open イベントで connected=true", () => {
    const { useWs, sockets } = setup();
    useWs.getState().connect("ABC", "p1", "client");
    expect(useWs.getState().connected).toBe(false);
    sockets[0]?.emitOpen();
    expect(useWs.getState().connected).toBe(true);
  });

  it("state メッセージで players/state/metrics を更新", () => {
    const { useWs, sockets } = setup();
    useWs.getState().connect("ABC", "p1", "client");
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
    useWs.getState().connect("ABC", "p1", "client");
    sockets[0]?.emitOpen();
    sockets[0]?.emitMessage({ t: "players", players: [{ id: "p2", name: "Bob", joinedAt: 0 }] });
    expect(useWs.getState().players[0]?.id).toBe("p2");
  });

  it("error メッセージで lastError をセット", () => {
    const { useWs, sockets } = setup();
    useWs.getState().connect("ABC", "p1", "client");
    sockets[0]?.emitOpen();
    sockets[0]?.emitMessage({ t: "error", message: "boom" });
    expect(useWs.getState().lastError).toBe("boom");
  });

  it("close 後、clock.setTimeout 経由で再接続する", () => {
    const { useWs, sockets, pending, advance } = setup();
    useWs.getState().connect("ABC", "p1", "client");
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
    useWs.getState().connect("ABC", "p1", "client");
    sockets[0]?.emit("close");
    expect(pending).toHaveLength(1);
    useWs.getState().disconnect();
    expect(pending).toHaveLength(0);
  });

  it("send: socket が OPEN のときだけ JSON を送る", () => {
    const { useWs, sockets } = setup();
    useWs.getState().connect("ABC", "p1", "client");
    useWs.getState().send({ t: "ping" });
    expect(sockets[0]?.sent).toEqual([]);
    sockets[0]?.emitOpen();
    useWs.getState().send({ t: "ping" });
    expect(sockets[0]?.sent).toEqual([JSON.stringify({ t: "ping" })]);
  });

  it("壊れた JSON メッセージは無視 (例外を投げない)", () => {
    const { useWs, sockets } = setup();
    useWs.getState().connect("ABC", "p1", "client");
    sockets[0]?.emitOpen();
    expect(() => sockets[0]?.emit("message", { data: "not json" } as unknown)).not.toThrow();
  });

  it("connect 時に渡した role を保持する", () => {
    const { useWs } = setup();
    expect(useWs.getState().role).toBeNull();
    useWs.getState().connect("ABC", "host-1", "host");
    expect(useWs.getState().role).toBe("host");
  });

  it("setRole で role を更新できる", () => {
    const { useWs } = setup();
    useWs.getState().setRole("client");
    expect(useWs.getState().role).toBe("client");
    useWs.getState().setRole(null);
    expect(useWs.getState().role).toBeNull();
  });

  it("setSnapshot で部分更新できる", () => {
    const { useWs } = setup();
    useWs.getState().setSnapshot({ players: [{ id: "x", name: "X", joinedAt: 0 }] });
    expect(useWs.getState().players[0]?.id).toBe("x");
    useWs.getState().setSnapshot({ state: { foo: 1 } });
    expect(useWs.getState().state).toEqual({ foo: 1 });
    expect(useWs.getState().players[0]?.id).toBe("x");
  });

  it("state メッセージの phase でストア phase が更新される", () => {
    const { useWs, sockets } = setup();
    useWs.getState().connect("ABC", "p1", "host");
    sockets[0]?.emitOpen();
    sockets[0]?.emitMessage({
      t: "state",
      state: null,
      metrics: [],
      players: [],
      phase: { kind: "running", startedAt: 1_000, accumulatedMs: 0 },
    });
    expect(useWs.getState().phase).toEqual({
      kind: "running",
      startedAt: 1_000,
      accumulatedMs: 0,
    });
  });

  it("displayMs: ready=0 / paused は accumulatedMs / running は accumulated + (now - startedAt)", () => {
    expect(displayMs({ kind: "ready" }, 1_234)).toBe(0);
    expect(displayMs({ kind: "paused", pausedAt: 100, accumulatedMs: 7_000 }, 9_999)).toBe(7_000);
    expect(displayMs({ kind: "running", startedAt: 1_000, accumulatedMs: 2_500 }, 4_000)).toBe(
      2_500 + 3_000,
    );
  });

  it("inactivity-warning は inactivity.closeAt を立てる", () => {
    const { useWs, sockets } = setup();
    useWs.getState().connect("ABC", "p1", "client");
    sockets[0]?.emitOpen();
    sockets[0]?.emitMessage({ t: "inactivity-warning", closeAt: 1_234_567_890 });
    expect(useWs.getState().inactivity).toEqual({ closeAt: 1_234_567_890 });
  });

  it("inactivity-cleared で inactivity が null に戻る", () => {
    const { useWs, sockets } = setup();
    useWs.getState().connect("ABC", "p1", "client");
    sockets[0]?.emitOpen();
    sockets[0]?.emitMessage({ t: "inactivity-warning", closeAt: 9_000 });
    sockets[0]?.emitMessage({ t: "inactivity-cleared" });
    expect(useWs.getState().inactivity).toBeNull();
  });

  it("closed で closed.reason を立て、自動再接続もしない", () => {
    const { useWs, sockets, pending } = setup();
    useWs.getState().connect("ABC", "p1", "client");
    sockets[0]?.emitOpen();
    sockets[0]?.emitMessage({ t: "closed", reason: "inactivity" });
    expect(useWs.getState().closed).toEqual({ reason: "inactivity" });
    // disconnect was called from the handler → reconnect timer must not be armed.
    expect(pending).toHaveLength(0);
    expect(useWs.getState().inactivity).toBeNull();
  });

  it("closed 後に socket が close しても reconnect しない", () => {
    const { useWs, sockets, pending } = setup();
    useWs.getState().connect("ABC", "p1", "client");
    sockets[0]?.emitOpen();
    sockets[0]?.emitMessage({ t: "closed", reason: "inactivity" });
    // server-side close arrives after the closed message.
    sockets[0]?.emit("close");
    expect(pending).toHaveLength(0);
    expect(sockets).toHaveLength(1);
  });

  it("event(scan) で lastScanEvent を更新する", () => {
    const { useWs, sockets } = setup();
    useWs.getState().connect("ABC", "p1", "host");
    sockets[0]?.emitOpen();
    expect(useWs.getState().lastScanEvent).toBeNull();
    sockets[0]?.emitMessage({
      t: "event",
      event: { kind: "scan", scannerId: "alice", scannedId: "bob", ts: 1_234 },
    });
    expect(useWs.getState().lastScanEvent).toEqual({
      scannerId: "alice",
      scannedId: "bob",
      ts: 1_234,
    });
  });

  it("event(scan) malformed / other kinds は無視する", () => {
    const { useWs, sockets } = setup();
    useWs.getState().connect("ABC", "p1", "host");
    sockets[0]?.emitOpen();
    sockets[0]?.emitMessage({ t: "event", event: { kind: "info", ts: 1, message: "hi" } });
    sockets[0]?.emitMessage({ t: "event", event: { kind: "scan", scannerId: 1, scannedId: 2 } });
    expect(useWs.getState().lastScanEvent).toBeNull();
  });

  it("room メッセージで store.room と phase が更新される", () => {
    const { useWs, sockets } = setup();
    useWs.getState().connect("ABC", "p1", "host");
    sockets[0]?.emitOpen();
    sockets[0]?.emitMessage({
      t: "room",
      room: {
        code: "ABC",
        handlerId: "relay",
        handlerConfig: { initial: { holders: ["p2"] } },
        createdAt: 100,
        hostId: "p1",
        phase: { kind: "ready" },
      },
    });
    const s = useWs.getState();
    expect(s.room?.code).toBe("ABC");
    expect((s.room?.handlerConfig as { initial: { holders: unknown } }).initial.holders).toEqual([
      "p2",
    ]);
    expect(s.phase).toEqual({ kind: "ready" });
  });

  it("clearClosed で closed をリセットできる", () => {
    const { useWs, sockets } = setup();
    useWs.getState().connect("ABC", "p1", "client");
    sockets[0]?.emitOpen();
    sockets[0]?.emitMessage({ t: "closed", reason: "inactivity" });
    expect(useWs.getState().closed).not.toBeNull();
    useWs.getState().clearClosed();
    expect(useWs.getState().closed).toBeNull();
  });
});
