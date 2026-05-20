import type { ScanPayloadV1 } from "@qr-relay/core";
import "@qr-relay/handlers";
import { describe, expect, it } from "vitest";
import {
  NONCE_TTL_MS,
  type Stored,
  TS_WINDOW_MS,
  gcNonces,
  reduceInit,
  reduceJoin,
  reduceScan,
  reduceStart,
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
    stored = reduceJoin(stored, { playerId: id, name: id }, NOW - 500);
  }
  const started = reduceStart(stored, NOW - 100);
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
  it("既知 handler + 有効 config で stored を返す", () => {
    const r = reduceInit({ code: "ABC123", handlerId: "relay", handlerConfig: TALLY_CONFIG }, NOW);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.stored.meta.code).toBe("ABC123");
      expect(r.stored.meta.createdAt).toBe(NOW);
      expect(r.stored.meta.startedAt).toBeNull();
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

  it("元の stored を変更しない (純粋)", () => {
    const r1 = reduceInit({ code: "A", handlerId: "relay", handlerConfig: TALLY_CONFIG }, NOW);
    const r2 = reduceInit({ code: "B", handlerId: "relay", handlerConfig: TALLY_CONFIG }, NOW + 1);
    if (r1.kind !== "ok" || r2.kind !== "ok") throw new Error();
    expect(r1.stored.meta.code).toBe("A");
    expect(r2.stored.meta.code).toBe("B");
  });
});

describe("reduceJoin", () => {
  it("新規プレイヤーを追加する (immutable)", () => {
    const stored = makeStored([]);
    const before = stored.players.length;
    const next = reduceJoin(stored, { playerId: "p1", name: "Alice" }, NOW);
    expect(next.players).toHaveLength(before + 1);
    expect(next.players[before]).toMatchObject({ id: "p1", name: "Alice", joinedAt: NOW });
    expect(stored.players).toHaveLength(before); // 元は変わらない
  });

  it("既存プレイヤーの name 変更で同 id のレコードを差し替え", () => {
    let stored = makeStored([]);
    stored = reduceJoin(stored, { playerId: "p1", name: "Alice" }, NOW);
    const updated = reduceJoin(stored, { playerId: "p1", name: "Alice2" }, NOW + 1);
    expect(updated.players).toHaveLength(1);
    expect(updated.players[0]?.name).toBe("Alice2");
  });

  it("既存プレイヤー同 name なら no-op", () => {
    let stored = makeStored([]);
    stored = reduceJoin(stored, { playerId: "p1", name: "Alice" }, NOW);
    const before = stored.players;
    const next = reduceJoin(stored, { playerId: "p1", name: "Alice" }, NOW + 1);
    expect(next.players).toEqual(before);
  });
});

describe("reduceStart", () => {
  it("startedAt と initialState をセットし、metrics を返す", () => {
    let stored = makeStored([]);
    stored = reduceJoin(stored, { playerId: "p1", name: "A" }, NOW - 10);
    stored = reduceJoin(stored, { playerId: "p2", name: "B" }, NOW - 5);
    const r = reduceStart(stored, NOW);
    expect(r.stored.meta.startedAt).toBe(NOW);
    expect(r.stored.meta.endedAt).toBeNull();
    expect(r.stored.state).toBeDefined();
    expect(Array.isArray(r.metrics)).toBe(true);
  });

  it("元の stored を変更しない", () => {
    const stored = makeStored();
    const meta0 = { ...stored.meta };
    reduceStart(stored, NOW + 999);
    expect(stored.meta).toEqual(meta0);
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

  it("成功時に元の recentNonces / stored を変更しない", () => {
    const stored = makeStored();
    const baseNonces = new Map<string, number>();
    const r = reduceScan({
      stored,
      scannerId: "p1",
      payload: payload({ pid: "p2", nonce: "fresh" }),
      recentNonces: baseNonces,
      now: NOW,
    });
    expect(r.kind).toBe("ok");
    expect(baseNonces.size).toBe(0);
    expect(stored.meta.startedAt).not.toBeNull(); // fixture が start 済みであることの担保
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
    // GC で "old" は捨てられ、現スキャンが新たに登録される
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.recentNonces.get("old")).toBe(NOW + NONCE_TTL_MS);
    }
  });
});
