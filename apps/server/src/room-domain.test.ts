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
  reduceLeave,
  reducePause,
  reduceReset,
  reduceResume,
  reduceScan,
  reduceStart,
  reduceUpdateConfig,
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

  it("途中参加: state が初期化済みなら handler.onPlayerJoin でスロットを足す", () => {
    // initial.holders=all なので、途中参加者にも初期 amount を与える設定
    const init = reduceInit(
      { code: "A", handlerId: "relay", handlerConfig: TALLY_CONFIG },
      NOW - 100,
    );
    if (init.kind !== "ok") throw new Error();
    let stored = reduceJoin(
      init.stored,
      { playerId: "p1", name: "A", role: "client" },
      NOW - 50,
    );
    const started = reduceStart(stored, NOW - 10);
    if (started.kind !== "ok") throw new Error("expected start ok");
    stored = started.stored;

    stored = reduceJoin(stored, { playerId: "p2", name: "B", role: "client" }, NOW);

    expect(stored.players.map((p) => p.id)).toEqual(["p1", "p2"]);
    const state = stored.state as { values: Record<string, { kind: string; amount?: number }> };
    expect(state.values.p2).toBeDefined();
    expect(state.values.p2?.kind).toBe("score");
  });

  it("途中参加: state が未初期化 (ready) のときは state を触らない", () => {
    const init = reduceInit(
      { code: "A", handlerId: "relay", handlerConfig: TALLY_CONFIG },
      NOW - 1,
    );
    if (init.kind !== "ok") throw new Error();
    const next = reduceJoin(init.stored, { playerId: "p1", name: "A", role: "client" }, NOW);
    expect(next.state).toBeUndefined();
  });

  it("再 join (同一 playerId) は state.values を触らない", () => {
    const init = reduceInit(
      { code: "A", handlerId: "relay", handlerConfig: TALLY_CONFIG },
      NOW - 100,
    );
    if (init.kind !== "ok") throw new Error();
    let stored = reduceJoin(
      init.stored,
      { playerId: "p1", name: "A", role: "client" },
      NOW - 50,
    );
    const started = reduceStart(stored, NOW - 10);
    if (started.kind !== "ok") throw new Error();
    stored = started.stored;
    const before = (stored.state as { values: Record<string, unknown> }).values;
    stored = reduceJoin(stored, { playerId: "p1", name: "A-renamed", role: "client" }, NOW);
    const after = (stored.state as { values: Record<string, unknown> }).values;
    expect(after).toBe(before);
    expect(stored.players[0]?.name).toBe("A-renamed");
  });
});

describe("reduceLeave", () => {
  it("既知 player を players から外す + state.values からもスロットを落とす", () => {
    const stored = makeStored(["p1", "p2", "p3"]);
    const next = reduceLeave(stored, { playerId: "p2" }, NOW);
    expect(next.players.map((p) => p.id)).toEqual(["p1", "p3"]);
    const values = (next.state as { values: Record<string, unknown> }).values;
    expect(values.p2).toBeUndefined();
    expect(values.p1).toBeDefined();
    expect(values.p3).toBeDefined();
  });

  it("未参加 ID は no-op（players も state も変わらず lastActivityAt のみ更新）", () => {
    const stored = makeStored(["p1", "p2"]);
    const next = reduceLeave(stored, { playerId: "unknown" }, NOW);
    expect(next.players).toBe(stored.players);
    expect(next.state).toBe(stored.state);
    expect(next.meta.lastActivityAt).toBe(NOW);
  });

  it("host が抜けたら hostId を null に戻す", () => {
    const init = reduceInit(
      { code: "A", handlerId: "relay", handlerConfig: TALLY_CONFIG },
      NOW - 10,
    );
    if (init.kind !== "ok") throw new Error();
    const hosted = reduceJoin(
      init.stored,
      { playerId: "host1", name: "H", role: "host" },
      NOW - 5,
    );
    expect(hosted.meta.hostId).toBe("host1");
    const left = reduceLeave(hosted, { playerId: "host1" }, NOW);
    expect(left.meta.hostId).toBeNull();
  });

  it("ready phase (state 未初期化) でも players からだけ外す", () => {
    const init = reduceInit(
      { code: "A", handlerId: "relay", handlerConfig: TALLY_CONFIG },
      NOW - 10,
    );
    if (init.kind !== "ok") throw new Error();
    let stored = reduceJoin(init.stored, { playerId: "p1", name: "A", role: "client" }, NOW - 5);
    stored = reduceJoin(stored, { playerId: "p2", name: "B", role: "client" }, NOW - 4);
    expect(stored.state).toBeUndefined();
    const next = reduceLeave(stored, { playerId: "p1" }, NOW);
    expect(next.players.map((p) => p.id)).toEqual(["p2"]);
    expect(next.state).toBeUndefined();
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

describe("reduceUpdateConfig", () => {
  const HOST_ID = "h1";

  function readyStored(): Stored {
    const init = reduceInit(
      { code: "ABC123", handlerId: "relay", handlerConfig: TALLY_CONFIG },
      NOW - 1000,
    );
    if (init.kind !== "ok") throw new Error("init failed");
    let stored = init.stored;
    stored = reduceJoin(stored, { playerId: HOST_ID, name: "Host", role: "host" }, NOW - 800);
    stored = reduceJoin(stored, { playerId: "p1", name: "P1", role: "client" }, NOW - 600);
    stored = reduceJoin(stored, { playerId: "p2", name: "P2", role: "client" }, NOW - 400);
    return stored;
  }

  it("ready phase で host が initial.holders を配列で上書きできる", () => {
    const stored = readyStored();
    const r = reduceUpdateConfig(stored, HOST_ID, { initial: { holders: ["p2"] } }, NOW);
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    const cfg = r.stored.meta.handlerConfig as { initial: { holders: unknown } };
    expect(cfg.initial.holders).toEqual(["p2"]);
    expect(r.stored.meta.lastActivityAt).toBe(NOW);
  });

  it("ready phase で initial.amount だけを変更できる", () => {
    const stored = readyStored();
    const r = reduceUpdateConfig(stored, HOST_ID, { initial: { amount: 5 } }, NOW);
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    const cfg = r.stored.meta.handlerConfig as { initial: { amount: number; holders: unknown } };
    expect(cfg.initial.amount).toBe(5);
    expect(cfg.initial.holders).toBe("all");
  });

  it("非 host (client) からの呼び出しは 403", () => {
    const stored = readyStored();
    const r = reduceUpdateConfig(stored, "p1", { initial: { amount: 5 } }, NOW);
    expect(r.kind).toBe("error");
    if (r.kind !== "error") return;
    expect(r.status).toBe(403);
    expect(r.body.error).toMatch(/host/);
  });

  it("playerId 無し (null) は 403", () => {
    const stored = readyStored();
    const r = reduceUpdateConfig(stored, null, { initial: { amount: 5 } }, NOW);
    expect(r.kind).toBe("error");
    if (r.kind !== "error") return;
    expect(r.status).toBe(403);
  });

  it("hostId が未設定 (誰も host で join していない) なら 403", () => {
    const init = reduceInit(
      { code: "ABC123", handlerId: "relay", handlerConfig: TALLY_CONFIG },
      NOW - 1000,
    );
    if (init.kind !== "ok") throw new Error("init failed");
    const r = reduceUpdateConfig(init.stored, "any", { initial: { amount: 5 } }, NOW);
    expect(r.kind).toBe("error");
    if (r.kind !== "error") return;
    expect(r.status).toBe(403);
  });

  it("running 中は phase エラーで拒否する", () => {
    const stored = readyStored();
    const started = reduceStart(stored, NOW - 100);
    if (started.kind !== "ok") throw new Error("start failed");
    const r = reduceUpdateConfig(started.stored, HOST_ID, { initial: { amount: 5 } }, NOW);
    expect(r.kind).toBe("error");
    if (r.kind !== "error") return;
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/ready/);
  });

  it("paused 中も拒否する", () => {
    const stored = readyStored();
    const started = reduceStart(stored, NOW - 200);
    if (started.kind !== "ok") throw new Error("start");
    const paused = reducePause(started.stored, NOW - 100);
    if (paused.kind !== "ok") throw new Error("pause");
    const r = reduceUpdateConfig(paused.stored, HOST_ID, { initial: { amount: 5 } }, NOW);
    expect(r.kind).toBe("error");
    if (r.kind !== "error") return;
    expect(r.status).toBe(409);
  });

  it("無効な patch は issues 付き 400", () => {
    const stored = readyStored();
    const r = reduceUpdateConfig(stored, HOST_ID, { initial: { amount: "abc" } }, NOW);
    expect(r.kind).toBe("error");
    if (r.kind !== "error") return;
    expect(r.status).toBe(400);
    expect(r.body.issues).toBeDefined();
  });

  it("relay 以外の handler は 400", () => {
    const stored = readyStored();
    const tampered: Stored = {
      ...stored,
      meta: { ...stored.meta, handlerId: "ghost" },
    };
    const r = reduceUpdateConfig(tampered, HOST_ID, {}, NOW);
    expect(r.kind).toBe("error");
    if (r.kind !== "error") return;
    expect(r.status).toBe(400);
  });

  it("reset 後 (ready に戻った) に再び更新できる", () => {
    const stored = readyStored();
    const started = reduceStart(stored, NOW - 200);
    if (started.kind !== "ok") throw new Error("start");
    const resetR = reduceReset(started.stored, NOW - 100);
    if (resetR.kind !== "ok") throw new Error("reset");
    const r = reduceUpdateConfig(resetR.stored, HOST_ID, { initial: { amount: 7 } }, NOW);
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    const cfg = r.stored.meta.handlerConfig as { initial: { amount: number } };
    expect(cfg.initial.amount).toBe(7);
  });

  it("元の stored を変更しない (immutability)", () => {
    const stored = readyStored();
    const snapshot = JSON.parse(JSON.stringify(stored.meta.handlerConfig));
    reduceUpdateConfig(stored, HOST_ID, { initial: { holders: ["p2"] } }, NOW);
    expect(stored.meta.handlerConfig).toEqual(snapshot);
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

describe("reduceScan self-heal (legacy / mid-game join)", () => {
  // Regression: previously, a player whose entry was in stored.players but
  // missing from stored.state.values silently no-op'd every scan.
  // This happened in two real flows:
  //   (a) a room created before onPlayerJoin shipped (legacy state),
  //   (b) a bot joined after `start` and reduceJoin's onPlayerJoin pass
  //       didn't fire because of an `isNewPlayer` guard regression.
  // Both manifested as "全員 未参加 / 0" on the dashboard with no errors.
  function storedWithOrphanedPlayer(): Stored {
    // Build a stored where p1 is in players AND has a value slot, but p2 is
    // in players but has NO value slot. Mirrors the "mid-game join without
    // onPlayerJoin" state.
    const init = reduceInit(
      { code: "A", handlerId: "relay", handlerConfig: TALLY_CONFIG },
      NOW - 100,
    );
    if (init.kind !== "ok") throw new Error("init failed");
    let stored = reduceJoin(
      init.stored,
      { playerId: "p1", name: "A", role: "client" },
      NOW - 50,
    );
    const started = reduceStart(stored, NOW - 10);
    if (started.kind !== "ok") throw new Error("start failed");
    stored = started.stored;
    // Append p2 directly so we simulate "in players, no slot". Do not go
    // through reduceJoin — that would call onPlayerJoin and heal it.
    stored = {
      ...stored,
      players: [...stored.players, { id: "p2", name: "B", joinedAt: NOW - 5 }],
    };
    // Confirm the orphan state we're testing against.
    const values = (stored.state as { values: Record<string, unknown> }).values;
    if ("p2" in values) throw new Error("fixture invariant: p2 should have no slot");
    return stored;
  }

  it("scanner / scanned のスロットが state に無くても scan が成立する (self-heal)", () => {
    const stored = storedWithOrphanedPlayer();
    const r = reduceScan({
      stored,
      scannerId: "p2", // orphaned scanner
      payload: payload({ pid: "p1", nonce: "heal-n1" }),
      recentNonces: new Map(),
      now: NOW,
    });
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    const nextValues = (r.stored.state as { values: Record<string, unknown> }).values;
    expect(nextValues.p2).toBeDefined();
    // greeting-shaped config (TALLY_CONFIG: sink: increment, source: keep):
    // scanner p2 should have gained 1.
    const slot = nextValues.p2 as { kind: string; amount?: number };
    expect(slot.kind).toBe("score");
    expect(slot.amount).toBe(1);
  });

  it("scanned 側のスロットが無くても scan が成立する", () => {
    const stored = storedWithOrphanedPlayer();
    const r = reduceScan({
      stored,
      scannerId: "p1",
      payload: payload({ pid: "p2", nonce: "heal-n2" }), // orphaned scanned
      recentNonces: new Map(),
      now: NOW,
    });
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    const nextValues = (r.stored.state as { values: Record<string, unknown> }).values;
    expect(nextValues.p2).toBeDefined();
  });

  it("両端 orphan でも scan が成立し、両者のスロットが生える", () => {
    // Build a stored where BOTH players are orphans from state.
    const init = reduceInit(
      { code: "A", handlerId: "relay", handlerConfig: TALLY_CONFIG },
      NOW - 100,
    );
    if (init.kind !== "ok") throw new Error();
    // Start with no players so initialState produces empty values.
    const started = reduceStart(init.stored, NOW - 10);
    if (started.kind !== "ok") throw new Error();
    const stored: Stored = {
      ...started.stored,
      players: [
        { id: "p1", name: "A", joinedAt: NOW - 5 },
        { id: "p2", name: "B", joinedAt: NOW - 5 },
      ],
    };
    const r = reduceScan({
      stored,
      scannerId: "p1",
      payload: payload({ pid: "p2", nonce: "heal-n3" }),
      recentNonces: new Map(),
      now: NOW,
    });
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    const nextValues = (r.stored.state as { values: Record<string, unknown> }).values;
    expect(nextValues.p1).toBeDefined();
    expect(nextValues.p2).toBeDefined();
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

describe("end-to-end: mid-game join + scan (regression for 'still 未参加 after fix')", () => {
  // This is the scenario the user actually hit:
  // 1. Room created, observer + 1 bot join.
  // 2. /start fires — initialState builds slots only for current 2 players.
  // 3. More bots join AFTER start (the late-joiner pattern).
  // 4. A late-joining bot scans someone.
  // Expected: scan counts.
  // Pre-fix bug: silent no-op because the late joiner had no state.values slot.
  it("late joiner scans after start → scan is counted (no silent no-op)", () => {
    const init = reduceInit(
      { code: "ABC", handlerId: "relay", handlerConfig: TALLY_CONFIG },
      NOW - 200,
    );
    if (init.kind !== "ok") throw new Error();
    let stored = reduceJoin(
      init.stored,
      { playerId: "observer", name: "obs", role: "client" },
      NOW - 150,
    );
    stored = reduceJoin(
      stored,
      { playerId: "bot-a", name: "Bot A", role: "client" },
      NOW - 140,
    );
    const started = reduceStart(stored, NOW - 100);
    if (started.kind !== "ok") throw new Error();
    stored = started.stored;

    // Late joiner — appears AFTER start.
    stored = reduceJoin(
      stored,
      { playerId: "bot-late", name: "Bot Late", role: "client" },
      NOW - 50,
    );

    const r = reduceScan({
      stored,
      scannerId: "bot-late",
      payload: payload({ pid: "bot-a", nonce: "late-n1" }),
      recentNonces: new Map(),
      now: NOW,
    });
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    const scanned = (r.stored.state as { scanCounts: Record<string, number> }).scanCounts;
    expect(scanned["bot-late"]).toBe(1);
  });

  it("legacy stored (player in players but missing from values) → next scan self-heals + counts", () => {
    // Simulate a room snapshot from BEFORE the onPlayerJoin hook shipped.
    // The DO persisted stored.players includes a player not yet in
    // state.values.
    const init = reduceInit(
      { code: "ABC", handlerId: "relay", handlerConfig: TALLY_CONFIG },
      NOW - 200,
    );
    if (init.kind !== "ok") throw new Error();
    let stored = reduceJoin(
      init.stored,
      { playerId: "p1", name: "A", role: "client" },
      NOW - 150,
    );
    const started = reduceStart(stored, NOW - 100);
    if (started.kind !== "ok") throw new Error();
    stored = {
      ...started.stored,
      // Append a legacy entry directly without going through reduceJoin.
      players: [
        ...started.stored.players,
        { id: "p-legacy", name: "Legacy", joinedAt: NOW - 90 },
      ],
    };

    const r = reduceScan({
      stored,
      scannerId: "p-legacy",
      payload: payload({ pid: "p1", nonce: "legacy-n1" }),
      recentNonces: new Map(),
      now: NOW,
    });
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    const scanned = (r.stored.state as { scanCounts: Record<string, number> }).scanCounts;
    expect(scanned["p-legacy"]).toBe(1);
  });
});
