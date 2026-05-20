import type { ScanPayloadV1 } from "@qr-relay/core";
import "@qr-relay/handlers";
import { describe, expect, it } from "vitest";
import {
  NONCE_TTL_MS,
  type Stored,
  TS_WINDOW_MS,
  decideAlarmAction,
  gcNonces,
  reduceInit,
  reduceJoin,
  reducePause,
  reduceReset,
  reduceResume,
  reduceScan,
  reduceStart,
  touchActivity,
} from "./room-domain.js";

const NOW = 1_700_000_000_000;

const TALLY_CONFIG = {
  value: { kind: "score" as const, defaultAmount: 0 },
  initial: { holders: "all" as const, amount: 0 },
  onScan: { source: "keep" as const, sink: "increment" as const, amount: 1 },
};

function makeStored(playerIds: string[] = ["p1", "p2"]): Stored {
  const init = reduceInit(
    { code: "ABC123", handlerId: "relay", handlerConfig: TALLY_CONFIG },
    NOW - 1000,
  );
  if (init.kind !== "ok") throw new Error(`init failed in fixture: ${JSON.stringify(init.body)}`);
  let stored = init.stored;
  for (const id of playerIds) {
    stored = reduceJoin(stored, { playerId: id, name: id, role: "client" }, NOW - 500);
  }
  const started = reduceStart(stored, NOW - 100);
  if (started.kind !== "ok") throw new Error("fixture start failed");
  return started.stored;
}

function payload(overrides: Partial<ScanPayloadV1> & { pid: string }): ScanPayloadV1 {
  return {
    v: 1,
    rid: "ABC123",
    pid: overrides.pid,
    ts: overrides.ts ?? NOW,
    nonce: overrides.nonce ?? "nonce-default",
    data: overrides.data,
  };
}

describe("reduceInit", () => {
  it("既知 handler + 有効 config で stored を返す (phase=ready)", () => {
    const r = reduceInit({ code: "ABC123", handlerId: "relay", handlerConfig: TALLY_CONFIG }, NOW);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.stored.meta.code).toBe("ABC123");
      expect(r.stored.meta.createdAt).toBe(NOW);
      expect(r.stored.meta.phase).toEqual({ kind: "ready" });
      expect(r.stored.meta.hostId).toBeNull();
      expect(r.stored.players).toEqual([]);
    }
  });

  it("未知 handler は 400 エラー", () => {
    const r = reduceInit({ code: "X", handlerId: "nope", handlerConfig: {} }, NOW);
    expect(r.kind).toBe("error");
    if (r.kind === "error") {
      expect(r.status).toBe(400);
      expect(r.body.error).toMatch(/unknown handler/);
    }
  });

  it("無効な config は issues 付きで 400", () => {
    const r = reduceInit({ code: "X", handlerId: "relay", handlerConfig: {} }, NOW);
    expect(r.kind).toBe("error");
    if (r.kind === "error") {
      expect(r.status).toBe(400);
      expect(r.body.error).toBe("invalid handler config");
      expect(r.body.issues).toBeDefined();
    }
  });
});

describe("reduceJoin", () => {
  it("新規プレイヤーを追加する (immutable)", () => {
    const init = reduceInit(
      { code: "A", handlerId: "relay", handlerConfig: TALLY_CONFIG },
      NOW - 1,
    );
    if (init.kind !== "ok") throw new Error();
    const before = init.stored.players.length;
    const next = reduceJoin(init.stored, { playerId: "p1", name: "Alice", role: "client" }, NOW);
    expect(next.players).toHaveLength(before + 1);
    expect(next.players[before]).toMatchObject({ id: "p1", name: "Alice", joinedAt: NOW });
    expect(init.stored.players).toHaveLength(before);
  });

  it("既存プレイヤーの name 変更で同 id のレコードを差し替え", () => {
    const init = reduceInit(
      { code: "A", handlerId: "relay", handlerConfig: TALLY_CONFIG },
      NOW - 1,
    );
    if (init.kind !== "ok") throw new Error();
    let stored = reduceJoin(init.stored, { playerId: "p1", name: "Alice", role: "client" }, NOW);
    stored = reduceJoin(stored, { playerId: "p1", name: "Alice2", role: "client" }, NOW + 1);
    expect(stored.players).toHaveLength(1);
    expect(stored.players[0]?.name).toBe("Alice2");
  });

  it("role=host は players に追加せず hostId を確定する", () => {
    const init = reduceInit(
      { code: "A", handlerId: "relay", handlerConfig: TALLY_CONFIG },
      NOW - 1,
    );
    if (init.kind !== "ok") throw new Error();
    const next = reduceJoin(init.stored, { playerId: "h1", name: "Host", role: "host" }, NOW);
    expect(next.players).toHaveLength(0);
    expect(next.meta.hostId).toBe("h1");
  });

  it("role=host を 2 回呼んでも最初の hostId を維持", () => {
    const init = reduceInit(
      { code: "A", handlerId: "relay", handlerConfig: TALLY_CONFIG },
      NOW - 1,
    );
    if (init.kind !== "ok") throw new Error();
    let stored = reduceJoin(init.stored, { playerId: "h1", name: "Host", role: "host" }, NOW);
    stored = reduceJoin(stored, { playerId: "h2", name: "Host2", role: "host" }, NOW + 1);
    expect(stored.meta.hostId).toBe("h1");
  });
});

describe("reduceStart (ready → running)", () => {
  it("ready から running へ遷移し initialState を作る", () => {
    const init = reduceInit(
      { code: "A", handlerId: "relay", handlerConfig: TALLY_CONFIG },
      NOW - 10,
    );
    if (init.kind !== "ok") throw new Error();
    const stored = reduceJoin(init.stored, { playerId: "p1", name: "A", role: "client" }, NOW - 5);
    const r = reduceStart(stored, NOW);
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.stored.meta.phase).toEqual({ kind: "running", startedAt: NOW, accumulatedMs: 0 });
    expect(r.stored.state).toBeDefined();
    expect(Array.isArray(r.metrics)).toBe(true);
  });

  it("running から呼ぶと error (二重 start 防止)", () => {
    const stored = makeStored([]);
    const r = reduceStart(stored, NOW);
    expect(r.kind).toBe("error");
    if (r.kind === "error") expect(r.message).toMatch(/running/);
  });

  it("元の stored を変更しない (純粋)", () => {
    const init = reduceInit(
      { code: "A", handlerId: "relay", handlerConfig: TALLY_CONFIG },
      NOW - 1,
    );
    if (init.kind !== "ok") throw new Error();
    const phase0 = init.stored.meta.phase;
    reduceStart(init.stored, NOW + 999);
    expect(init.stored.meta.phase).toEqual(phase0);
  });
});

describe("reducePause / reduceResume", () => {
  it("running → paused で accumulatedMs が積み上がる", () => {
    const stored = makeStored([]);
    // fixture started at NOW-100, so after NOW the running has been 100ms
    const r = reducePause(stored, NOW);
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.stored.meta.phase).toMatchObject({ kind: "paused", accumulatedMs: 100 });
  });

  it("paused → running で accumulatedMs を保ち startedAt を更新", () => {
    const stored = makeStored([]);
    const paused = reducePause(stored, NOW);
    if (paused.kind !== "ok") throw new Error();
    const resumed = reduceResume(paused.stored, NOW + 50);
    expect(resumed.kind).toBe("ok");
    if (resumed.kind !== "ok") return;
    expect(resumed.stored.meta.phase).toEqual({
      kind: "running",
      startedAt: NOW + 50,
      accumulatedMs: 100,
    });
  });

  it("ready からの pause / resume はどちらも error", () => {
    const init = reduceInit(
      { code: "A", handlerId: "relay", handlerConfig: TALLY_CONFIG },
      NOW - 1,
    );
    if (init.kind !== "ok") throw new Error();
    expect(reducePause(init.stored, NOW).kind).toBe("error");
    expect(reduceResume(init.stored, NOW).kind).toBe("error");
  });

  it("running からの resume / paused からの pause は error", () => {
    const stored = makeStored([]);
    expect(reduceResume(stored, NOW).kind).toBe("error");
    const paused = reducePause(stored, NOW);
    if (paused.kind !== "ok") throw new Error();
    expect(reducePause(paused.stored, NOW + 1).kind).toBe("error");
  });
});

describe("reduceReset", () => {
  it("running から ready へ戻し state を消す", () => {
    const stored = makeStored(["p1", "p2"]);
    const r = reduceReset(stored, NOW + 50);
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.stored.meta.phase).toEqual({ kind: "ready" });
    expect(r.stored.state).toBeUndefined();
  });

  it("paused からの reset も ready へ", () => {
    const stored = makeStored([]);
    const paused = reducePause(stored, NOW);
    if (paused.kind !== "ok") throw new Error();
    const r = reduceReset(paused.stored, NOW + 10);
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.stored.meta.phase).toEqual({ kind: "ready" });
  });

  it("players と meta.code / hostId / handlerId は保持する", () => {
    const init = reduceInit(
      { code: "A", handlerId: "relay", handlerConfig: TALLY_CONFIG },
      NOW - 20,
    );
    if (init.kind !== "ok") throw new Error();
    let stored = reduceJoin(init.stored, { playerId: "h1", name: "Host", role: "host" }, NOW - 15);
    stored = reduceJoin(stored, { playerId: "p1", name: "A", role: "client" }, NOW - 10);
    const started = reduceStart(stored, NOW);
    if (started.kind !== "ok") throw new Error();

    const r = reduceReset(started.stored, NOW + 50);
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.stored.players).toEqual(started.stored.players);
    expect(r.stored.meta.code).toBe(started.stored.meta.code);
    expect(r.stored.meta.hostId).toBe(started.stored.meta.hostId);
    expect(r.stored.meta.handlerId).toBe(started.stored.meta.handlerId);
  });
});

describe("gcNonces", () => {
  it("期限切れだけ捨てる", () => {
    const m = new Map([
      ["a", 100],
      ["b", 200],
      ["c", 300],
    ]);
    const g = gcNonces(m, 200);
    expect([...g.keys()].sort()).toEqual(["c"]);
  });

  it("空 map はそのまま空", () => {
    expect([...gcNonces(new Map(), 0).keys()]).toEqual([]);
  });

  it("元の map を変更しない", () => {
    const m = new Map([["a", 50]]);
    gcNonces(m, 100);
    expect(m.has("a")).toBe(true);
  });
});

describe("reduceScan", () => {
  it("phase != running なら error (ready)", () => {
    const init = reduceInit(
      { code: "ABC123", handlerId: "relay", handlerConfig: TALLY_CONFIG },
      NOW - 1,
    );
    if (init.kind !== "ok") throw new Error();
    let stored = reduceJoin(init.stored, { playerId: "p1", name: "A", role: "client" }, NOW - 1);
    stored = reduceJoin(stored, { playerId: "p2", name: "B", role: "client" }, NOW - 1);
    // start していない (= ready) で scan
    const r = reduceScan({
      stored,
      scannerId: "p1",
      payload: payload({ pid: "p2", nonce: "n0" }),
      recentNonces: new Map(),
      now: NOW,
    });
    expect(r.kind).toBe("error");
    if (r.kind === "error") expect(r.message).toMatch(/not running/);
  });

  it("paused 中の scan は error (no-op)", () => {
    const stored = makeStored();
    const paused = reducePause(stored, NOW);
    if (paused.kind !== "ok") throw new Error();
    const r = reduceScan({
      stored: paused.stored,
      scannerId: "p1",
      payload: payload({ pid: "p2", nonce: "n1" }),
      recentNonces: new Map(),
      now: NOW + 1,
    });
    expect(r.kind).toBe("error");
    if (r.kind === "error") expect(r.message).toMatch(/not running/);
  });

  it("TS が窓外なら error/timestamp out of window", () => {
    const stored = makeStored();
    const r = reduceScan({
      stored,
      scannerId: "p1",
      payload: payload({ pid: "p2", ts: NOW - TS_WINDOW_MS - 1 }),
      recentNonces: new Map(),
      now: NOW,
    });
    expect(r.kind).toBe("error");
    if (r.kind === "error") expect(r.message).toMatch(/timestamp/);
  });

  it("重複 nonce は error", () => {
    const stored = makeStored();
    const r = reduceScan({
      stored,
      scannerId: "p1",
      payload: payload({ pid: "p2", nonce: "dup" }),
      recentNonces: new Map([["dup", NOW + NONCE_TTL_MS]]),
      now: NOW,
    });
    expect(r.kind).toBe("error");
    if (r.kind === "error") expect(r.message).toMatch(/duplicate/);
  });

  it("自分自身のスキャンは error/cannot scan self", () => {
    const stored = makeStored();
    const r = reduceScan({
      stored,
      scannerId: "p1",
      payload: payload({ pid: "p1" }),
      recentNonces: new Map(),
      now: NOW,
    });
    expect(r.kind).toBe("error");
    if (r.kind === "error") expect(r.message).toMatch(/self/);
  });

  it("未登録プレイヤーは error/unknown player", () => {
    const stored = makeStored(["p1"]);
    const r = reduceScan({
      stored,
      scannerId: "p1",
      payload: payload({ pid: "ghost" }),
      recentNonces: new Map(),
      now: NOW,
    });
    expect(r.kind).toBe("error");
    if (r.kind === "error") expect(r.message).toMatch(/unknown/);
  });

  it("成功時に stored / metrics / events / recentNonces を返す", () => {
    const stored = makeStored();
    const r = reduceScan({
      stored,
      scannerId: "p1",
      payload: payload({ pid: "p2", nonce: "fresh" }),
      recentNonces: new Map(),
      now: NOW,
    });
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.recentNonces.has("fresh")).toBe(true);
      expect(r.recentNonces.get("fresh")).toBe(NOW + NONCE_TTL_MS);
      expect(Array.isArray(r.metrics)).toBe(true);
      expect(Array.isArray(r.events)).toBe(true);
    }
  });

  it("ホストが scan を発行しようとすると error/host cannot scan", () => {
    let stored = makeStored(["p1", "p2"]);
    stored = {
      ...stored,
      meta: { ...stored.meta, hostId: "host-1" },
    };
    const r = reduceScan({
      stored,
      scannerId: "host-1",
      payload: payload({ pid: "p1", nonce: "n1" }),
      recentNonces: new Map(),
      now: NOW,
    });
    expect(r.kind).toBe("error");
    if (r.kind === "error") expect(r.message).toMatch(/host cannot scan/);
  });

  it("ホストの QR (pid=hostId) をスキャンしようとすると error/cannot scan host", () => {
    let stored = makeStored(["p1", "p2"]);
    stored = {
      ...stored,
      meta: { ...stored.meta, hostId: "host-1" },
    };
    const r = reduceScan({
      stored,
      scannerId: "p1",
      payload: payload({ pid: "host-1", nonce: "n2" }),
      recentNonces: new Map(),
      now: NOW,
    });
    expect(r.kind).toBe("error");
    if (r.kind === "error") expect(r.message).toMatch(/cannot scan host/);
  });

  it("期限切れ nonce は GC され同 nonce が再利用可能になる", () => {
    const stored = makeStored();
    const nonces = new Map([["old", NOW - 1]]);
    const r = reduceScan({
      stored,
      scannerId: "p1",
      payload: payload({ pid: "p2", nonce: "old" }),
      recentNonces: nonces,
      now: NOW,
    });
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.recentNonces.get("old")).toBe(NOW + NONCE_TTL_MS);
    }
  });
});

describe("touchActivity / lastActivityAt", () => {
  it("touchActivity は meta.lastActivityAt を now にし元を変更しない (純粋)", () => {
    const stored = makeStored([]);
    const before = stored.meta.lastActivityAt;
    const next = touchActivity(stored, NOW + 5_000);
    expect(next.meta.lastActivityAt).toBe(NOW + 5_000);
    expect(stored.meta.lastActivityAt).toBe(before);
  });

  it("reduceInit は lastActivityAt = createdAt = now", () => {
    const r = reduceInit({ code: "X", handlerId: "relay", handlerConfig: TALLY_CONFIG }, NOW);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.stored.meta.lastActivityAt).toBe(NOW);
      expect(r.stored.meta.createdAt).toBe(NOW);
    }
  });

  it("reduceJoin (client 新規) は lastActivityAt を now に更新", () => {
    const init = reduceInit(
      { code: "A", handlerId: "relay", handlerConfig: TALLY_CONFIG },
      NOW - 1_000,
    );
    if (init.kind !== "ok") throw new Error();
    const next = reduceJoin(init.stored, { playerId: "p1", name: "A", role: "client" }, NOW);
    expect(next.meta.lastActivityAt).toBe(NOW);
  });

  it("reduceJoin (host 初回) は lastActivityAt を now に更新", () => {
    const init = reduceInit(
      { code: "A", handlerId: "relay", handlerConfig: TALLY_CONFIG },
      NOW - 1_000,
    );
    if (init.kind !== "ok") throw new Error();
    const next = reduceJoin(init.stored, { playerId: "h1", name: "Host", role: "host" }, NOW);
    expect(next.meta.hostId).toBe("h1");
    expect(next.meta.lastActivityAt).toBe(NOW);
  });

  it("reduceJoin (host 二回目) でも lastActivityAt は更新する", () => {
    const init = reduceInit(
      { code: "A", handlerId: "relay", handlerConfig: TALLY_CONFIG },
      NOW - 1_000,
    );
    if (init.kind !== "ok") throw new Error();
    const first = reduceJoin(init.stored, { playerId: "h1", name: "Host", role: "host" }, NOW);
    const second = reduceJoin(first, { playerId: "h2", name: "Host2", role: "host" }, NOW + 500);
    expect(second.meta.hostId).toBe("h1");
    expect(second.meta.lastActivityAt).toBe(NOW + 500);
  });

  it("reduceStart 成功時に lastActivityAt を now に更新", () => {
    const init = reduceInit(
      { code: "A", handlerId: "relay", handlerConfig: TALLY_CONFIG },
      NOW - 1_000,
    );
    if (init.kind !== "ok") throw new Error();
    const joined = reduceJoin(
      init.stored,
      { playerId: "p1", name: "A", role: "client" },
      NOW - 500,
    );
    const r = reduceStart(joined, NOW);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.stored.meta.lastActivityAt).toBe(NOW);
  });

  it("reduceReset 成功時に lastActivityAt を now に更新", () => {
    const stored = makeStored(["p1"]);
    const r = reduceReset(stored, NOW + 200);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.stored.meta.lastActivityAt).toBe(NOW + 200);
  });

  it("reduceScan 成功時に lastActivityAt を now に更新", () => {
    const stored = makeStored();
    const r = reduceScan({
      stored,
      scannerId: "p1",
      payload: payload({ pid: "p2", nonce: "fresh-lat" }),
      recentNonces: new Map(),
      now: NOW + 1_000,
    });
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.stored.meta.lastActivityAt).toBe(NOW + 1_000);
  });

  it("reduceScan エラー時は lastActivityAt を更新しない (元の stored は不変)", () => {
    const stored = makeStored();
    const before = stored.meta.lastActivityAt;
    reduceScan({
      stored,
      scannerId: "p1",
      payload: payload({ pid: "p1", nonce: "self" }),
      recentNonces: new Map(),
      now: NOW + 1_000,
    });
    expect(stored.meta.lastActivityAt).toBe(before);
  });

  it("reducePause / reduceResume は lastActivityAt を変更しない (plan 仕様)", () => {
    const stored = makeStored([]);
    const before = stored.meta.lastActivityAt;
    const paused = reducePause(stored, NOW + 1_000);
    expect(paused.kind).toBe("ok");
    if (paused.kind !== "ok") return;
    expect(paused.stored.meta.lastActivityAt).toBe(before);
    const resumed = reduceResume(paused.stored, NOW + 2_000);
    expect(resumed.kind).toBe("ok");
    if (resumed.kind !== "ok") return;
    expect(resumed.stored.meta.lastActivityAt).toBe(before);
  });
});

describe("decideAlarmAction", () => {
  const WARN = 10 * 60_000;
  const CLOSE = 15 * 60_000;

  it("idle < warn: reschedule to lastActivityAt + warn (no broadcast)", () => {
    const d = decideAlarmAction(NOW, NOW + 1_000, WARN, CLOSE);
    expect(d).toEqual({ kind: "reschedule", at: NOW + WARN });
  });

  it("idle == warn: warn with closeAt at lastActivityAt + close", () => {
    const d = decideAlarmAction(NOW, NOW + WARN, WARN, CLOSE);
    expect(d).toEqual({ kind: "warn", closeAt: NOW + CLOSE, rescheduleAt: NOW + CLOSE });
  });

  it("warn ≤ idle < close: warn", () => {
    const d = decideAlarmAction(NOW, NOW + WARN + 1, WARN, CLOSE);
    expect(d.kind).toBe("warn");
    if (d.kind === "warn") {
      expect(d.closeAt).toBe(NOW + CLOSE);
      expect(d.rescheduleAt).toBe(NOW + CLOSE);
    }
  });

  it("idle == close: close", () => {
    const d = decideAlarmAction(NOW, NOW + CLOSE, WARN, CLOSE);
    expect(d).toEqual({ kind: "close" });
  });

  it("idle > close: close", () => {
    const d = decideAlarmAction(NOW, NOW + CLOSE + 100_000, WARN, CLOSE);
    expect(d).toEqual({ kind: "close" });
  });

  it("dev override (短い閾値) でも整合する", () => {
    // dev: warn after 30s, close after 60s
    const d1 = decideAlarmAction(NOW, NOW + 5_000, 30_000, 60_000);
    expect(d1).toEqual({ kind: "reschedule", at: NOW + 30_000 });
    const d2 = decideAlarmAction(NOW, NOW + 40_000, 30_000, 60_000);
    expect(d2.kind).toBe("warn");
    const d3 = decideAlarmAction(NOW, NOW + 60_000, 30_000, 60_000);
    expect(d3).toEqual({ kind: "close" });
  });
});
