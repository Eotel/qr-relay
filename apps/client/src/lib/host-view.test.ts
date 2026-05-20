import type { Metric, Phase } from "@qr-relay/core";
import { describe, expect, it } from "vitest";
import {
  pickHostHeroView,
  rankings,
  summarizeMetricsForHost,
  tokenPathChain,
} from "./host-view.js";
import type { PlayerLite } from "./ws-store.js";

const players: PlayerLite[] = [
  { id: "alice", name: "Alice", joinedAt: 0 },
  { id: "bob", name: "Bob", joinedAt: 1 },
  { id: "carol", name: "Carol", joinedAt: 2 },
];

const running: Phase = { kind: "running", startedAt: 1_000, accumulatedMs: 0 };
const ready: Phase = { kind: "ready" };

const batonRule = { value: { kind: "token" }, onScan: { source: "lose", sink: "gain" } };
const infectionRule = { value: { kind: "token" }, onScan: { source: "keep", sink: "gain" } };
const stealRule = {
  value: { kind: "score", defaultAmount: 10 },
  onScan: { source: "decrement", sink: "increment", amount: 1 },
};
const collectionRule = {
  value: { kind: "score", defaultAmount: 0 },
  onScan: { source: "keep", sink: "increment", amount: 1 },
};
const greetingRule = {
  value: { kind: "score", defaultAmount: 0 },
  onScan: { source: "increment", sink: "increment", amount: 1 },
};

function tokenState(holders: string[]) {
  return {
    values: Object.fromEntries(
      players.map((p) => [p.id, { kind: "token", has: holders.includes(p.id) }]),
    ),
  };
}

function scoreState(byId: Record<string, number>) {
  return {
    values: Object.fromEntries(
      players.map((p) => [p.id, { kind: "score", amount: byId[p.id] ?? 0 }]),
    ),
  };
}

describe("pickHostHeroView", () => {
  it("waiting: phase=ready returns waiting regardless of players (count preserved)", () => {
    const v = pickHostHeroView({
      phase: ready,
      state: tokenState(["alice"]),
      players,
      rule: batonRule,
    });
    expect(v).toEqual({ kind: "waiting", playerCount: 3 });
  });

  it("waiting: no players returns waiting with count 0 even while running", () => {
    const v = pickHostHeroView({ phase: running, state: null, players: [], rule: batonRule });
    expect(v).toEqual({ kind: "waiting", playerCount: 0 });
  });

  it("baton (token + source=lose): single holder name", () => {
    const v = pickHostHeroView({
      phase: running,
      state: tokenState(["bob"]),
      players,
      rule: batonRule,
    });
    expect(v).toEqual({ kind: "token-single", holder: { id: "bob", name: "Bob" } });
  });

  it("baton with no holder yet: token-single with null holder", () => {
    const v = pickHostHeroView({
      phase: running,
      state: tokenState([]),
      players,
      rule: batonRule,
    });
    expect(v).toEqual({ kind: "token-single", holder: null });
  });

  it("infection (token + source=keep): token-many with growing holders", () => {
    const v = pickHostHeroView({
      phase: running,
      state: tokenState(["alice", "carol"]),
      players,
      rule: infectionRule,
    });
    expect(v.kind).toBe("token-many");
    if (v.kind !== "token-many") throw new Error("type");
    expect(v.holders.map((h) => h.id)).toEqual(["alice", "carol"]);
    expect(v.totalPlayers).toBe(3);
  });

  it("steal (score): top score wins ties", () => {
    const v = pickHostHeroView({
      phase: running,
      state: scoreState({ alice: 12, bob: 12, carol: 4 }),
      players,
      rule: stealRule,
    });
    expect(v.kind).toBe("score-leader");
    if (v.kind !== "score-leader") throw new Error("type");
    expect(v.leaders.map((e) => e.id)).toEqual(["alice", "bob"]);
  });

  it("collection (score) with all zeros: no leaders", () => {
    const v = pickHostHeroView({
      phase: running,
      state: scoreState({}),
      players,
      rule: collectionRule,
    });
    expect(v.kind).toBe("score-leader");
    if (v.kind !== "score-leader") throw new Error("type");
    expect(v.leaders).toEqual([]);
  });

  it("greeting (score): single leader after one scan", () => {
    const v = pickHostHeroView({
      phase: running,
      state: scoreState({ alice: 1 }),
      players,
      rule: greetingRule,
    });
    if (v.kind !== "score-leader") throw new Error("type");
    expect(v.leaders.map((l) => l.id)).toEqual(["alice"]);
  });

  it("malformed state (null) treats values as empty", () => {
    const v = pickHostHeroView({ phase: running, state: null, players, rule: batonRule });
    expect(v).toEqual({ kind: "token-single", holder: null });
  });

  it("unknown rule falls back to waiting (no flash of empty hero)", () => {
    const v = pickHostHeroView({ phase: running, state: null, players, rule: undefined });
    expect(v).toEqual({ kind: "waiting", playerCount: 3 });
  });
});

describe("summarizeMetricsForHost", () => {
  it("score preset: totalScans from metric, no holder count", () => {
    const metrics: Metric[] = [
      { kind: "count", label: "総スキャン数", total: 12, byPlayer: {} },
      { kind: "score", label: "スコア", byPlayer: { a: 5, b: 3 } },
    ];
    expect(summarizeMetricsForHost(metrics)).toEqual({ totalScans: 12, tokenHolderCount: null });
  });

  it("token preset: emits 保持中 → tokenHolderCount populated", () => {
    const metrics: Metric[] = [
      { kind: "count", label: "総スキャン数", total: 4, byPlayer: {} },
      { kind: "count", label: "保持中", total: 3, byPlayer: { a: 1, b: 1, c: 1 } },
    ];
    expect(summarizeMetricsForHost(metrics)).toEqual({ totalScans: 4, tokenHolderCount: 3 });
  });

  it("empty metrics: zero scans, null holder count", () => {
    expect(summarizeMetricsForHost([])).toEqual({ totalScans: 0, tokenHolderCount: null });
  });
});

function stateWithHistory(entries: { scannerId: string; scannedId: string; ts: number }[]) {
  return { history: entries };
}

describe("rankings", () => {
  it("counts scan-out / scan-in per player and sorts descending", () => {
    const state = stateWithHistory([
      { scannerId: "alice", scannedId: "bob", ts: 1 },
      { scannerId: "alice", scannedId: "carol", ts: 2 },
      { scannerId: "bob", scannedId: "alice", ts: 3 },
    ]);
    const r = rankings(state, players);
    expect(r.scanOut.map((e) => [e.id, e.count])).toEqual([
      ["alice", 2],
      ["bob", 1],
      ["carol", 0],
    ]);
    expect(r.scanIn.map((e) => [e.id, e.count])).toEqual([
      ["alice", 1],
      ["bob", 1],
      ["carol", 1],
    ]);
  });

  it("ties broken by joinedAt ascending (lobby order)", () => {
    const state = stateWithHistory([
      { scannerId: "bob", scannedId: "alice", ts: 1 },
      { scannerId: "carol", scannedId: "alice", ts: 2 },
    ]);
    const r = rankings(state, players);
    expect(r.scanOut.map((e) => e.id)).toEqual(["bob", "carol", "alice"]);
  });

  it("missing history returns zero counts for every player", () => {
    const r = rankings(null, players);
    expect(r.scanOut.every((e) => e.count === 0)).toBe(true);
    expect(r.scanIn.every((e) => e.count === 0)).toBe(true);
    expect(r.scanOut.map((e) => e.id)).toEqual(["alice", "bob", "carol"]);
  });

  it("malformed history entries are ignored", () => {
    const r = rankings({ history: [null, { scannerId: 1 }, undefined] }, players);
    expect(r.scanOut.every((e) => e.count === 0)).toBe(true);
  });
});

describe("tokenPathChain", () => {
  it("returns history in time-ascending order with resolved player names", () => {
    const state = stateWithHistory([
      { scannerId: "alice", scannedId: "bob", ts: 2 },
      { scannerId: "carol", scannedId: "alice", ts: 1 },
    ]);
    const chain = tokenPathChain(state, players);
    expect(chain.map((s) => [s.scannerName, s.scannedName, s.ts])).toEqual([
      ["Carol", "Alice", 1],
      ["Alice", "Bob", 2],
    ]);
  });

  it("unknown player IDs fall back to a short id stub", () => {
    const state = stateWithHistory([
      { scannerId: "ghost-7b9c", scannedId: "alice", ts: 1 },
    ]);
    const chain = tokenPathChain(state, players);
    expect(chain[0]).toMatchObject({ scannerName: "#ghos", scannedName: "Alice" });
  });

  it("missing history returns empty array", () => {
    expect(tokenPathChain(null, players)).toEqual([]);
    expect(tokenPathChain({}, players)).toEqual([]);
  });
});
