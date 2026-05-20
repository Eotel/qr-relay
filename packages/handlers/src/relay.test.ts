import type { Player } from "@qr-relay/core";
import { describe, expect, it } from "vitest";
import { presetById } from "./presets.js";
import { mergeScanRule, type RelayState, type ScanRule, type ValueSlot } from "./relay-rule.js";
import { relayHandler } from "./relay.js";

function makePlayers(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    name: `P${i + 1}`,
    joinedAt: 0,
  }));
}

function scan(
  state: RelayState,
  config: ScanRule,
  scanner: Player,
  scanned: Player,
  now: number,
): RelayState {
  return relayHandler.onScan({
    state,
    config,
    scanner,
    scanned,
    payloadData: {},
    now,
  }).nextState;
}

function getRule(presetId: string): ScanRule {
  const rule = presetById[presetId]?.rule;
  if (!rule) throw new Error(`Unknown preset: ${presetId}`);
  return rule;
}

function slotOf(state: RelayState, playerId: string): ValueSlot {
  const s = state.values[playerId];
  if (!s) throw new Error(`No slot for ${playerId}`);
  return s;
}

describe("relay handler - baton", () => {
  const rule = getRule("baton");
  const players = makePlayers(3);
  const [p1, p2, p3] = players as [Player, Player, Player];

  it("initial state gives token to first player only", () => {
    const state = relayHandler.initialState({ config: rule, players, now: 0 });
    expect(slotOf(state, p1.id)).toEqual({ kind: "token", has: true });
    expect(slotOf(state, p2.id)).toEqual({ kind: "token", has: false });
  });

  it("scan: p2 scans p1(holder) → token moves to p2", () => {
    const s0 = relayHandler.initialState({ config: rule, players, now: 0 });
    const s1 = scan(s0, rule, p2, p1, 1);
    expect(slotOf(s1, p2.id)).toEqual({ kind: "token", has: true });
    expect(slotOf(s1, p1.id)).toEqual({ kind: "token", has: false });
  });

  it("scan: non-holder scanning non-holder is rejected", () => {
    const s0 = relayHandler.initialState({ config: rule, players, now: 0 });
    const s1 = scan(s0, rule, p2, p3, 1);
    expect(slotOf(s1, p2.id)).toEqual({ kind: "token", has: false });
    expect(slotOf(s1, p3.id)).toEqual({ kind: "token", has: false });
  });

  it("scan: token-holder scanning non-holder is rejected (sink already has)", () => {
    const s0 = relayHandler.initialState({ config: rule, players, now: 0 });
    const s1 = scan(s0, rule, p1, p2, 1);
    expect(slotOf(s1, p1.id)).toEqual({ kind: "token", has: true });
    expect(slotOf(s1, p2.id)).toEqual({ kind: "token", has: false });
  });
});

describe("relay handler - infection (token-based)", () => {
  const rule = getRule("infection");
  const players = makePlayers(3);
  const [p1, p2, p3] = players as [Player, Player, Player];

  it("first player starts infected, others healthy", () => {
    const s0 = relayHandler.initialState({ config: rule, players, now: 0 });
    expect(slotOf(s0, p1.id)).toEqual({ kind: "token", has: true });
    expect(slotOf(s0, p2.id)).toEqual({ kind: "token", has: false });
  });

  it("scanning an infected spreads (source keeps, sink gains)", () => {
    const s0 = relayHandler.initialState({ config: rule, players, now: 0 });
    const s1 = scan(s0, rule, p2, p1, 1); // p2 scans p1 (infected)
    expect(slotOf(s1, p1.id)).toEqual({ kind: "token", has: true });
    expect(slotOf(s1, p2.id)).toEqual({ kind: "token", has: true });
  });

  it("scanning a non-infected is rejected (requireSourceHas)", () => {
    const s0 = relayHandler.initialState({ config: rule, players, now: 0 });
    const s1 = scan(s0, rule, p2, p3, 1); // p3 not infected
    expect(slotOf(s1, p2.id)).toEqual({ kind: "token", has: false });
    expect(slotOf(s1, p3.id)).toEqual({ kind: "token", has: false });
  });
});

describe("relay handler - collection", () => {
  const rule = getRule("collection");
  const players = makePlayers(3);
  const [p1, p2, p3] = players as [Player, Player, Player];

  it("scan increments scanner score", () => {
    let s = relayHandler.initialState({ config: rule, players, now: 0 });
    s = scan(s, rule, p1, p2, 1);
    s = scan(s, rule, p1, p3, 2);
    expect(slotOf(s, p1.id)).toEqual({ kind: "score", amount: 2 });
    expect(slotOf(s, p2.id)).toEqual({ kind: "score", amount: 0 });
  });

  it("uniquePerPair prevents double counting", () => {
    let s = relayHandler.initialState({ config: rule, players, now: 0 });
    s = scan(s, rule, p1, p2, 1);
    s = scan(s, rule, p1, p2, 2); // same pair again
    expect(slotOf(s, p1.id)).toEqual({ kind: "score", amount: 1 });
  });
});

describe("relay handler - greeting", () => {
  const rule = getRule("greeting");
  const players = makePlayers(2);
  const [p1, p2] = players as [Player, Player];

  it("both players gain a point on scan", () => {
    const s0 = relayHandler.initialState({ config: rule, players, now: 0 });
    const s1 = scan(s0, rule, p1, p2, 1);
    expect(slotOf(s1, p1.id)).toEqual({ kind: "score", amount: 1 });
    expect(slotOf(s1, p2.id)).toEqual({ kind: "score", amount: 1 });
  });
});

describe("relay handler - steal", () => {
  const rule = getRule("steal");
  const players = makePlayers(2);
  const [p1, p2] = players as [Player, Player];

  it("each player starts with 10 points", () => {
    const s0 = relayHandler.initialState({ config: rule, players, now: 0 });
    expect(slotOf(s0, p1.id)).toEqual({ kind: "score", amount: 10 });
    expect(slotOf(s0, p2.id)).toEqual({ kind: "score", amount: 10 });
  });

  it("scanner steals 1 from scanned", () => {
    let s = relayHandler.initialState({ config: rule, players, now: 0 });
    s = scan(s, rule, p1, p2, 1);
    expect(slotOf(s, p1.id)).toEqual({ kind: "score", amount: 11 });
    expect(slotOf(s, p2.id)).toEqual({ kind: "score", amount: 9 });
  });

  it("cannot go below minValue: 0", () => {
    const players2 = makePlayers(2);
    let s = relayHandler.initialState({ config: rule, players: players2, now: 0 });
    for (let i = 0; i < 15; i++) {
      s = scan(s, rule, players2[0] as Player, players2[1] as Player, i);
    }
    const p2 = players2[1];
    if (!p2) throw new Error("expected p2");
    const slot2 = slotOf(s, p2.id);
    expect(slot2.kind === "score" && slot2.amount).toBe(0);
  });
});

describe("relay handler - onPlayerJoin (mid-game join)", () => {
  function makeLatePlayer(id: string): Player {
    return { id, name: id.toUpperCase(), joinedAt: 1_000 };
  }

  it("baton: late joiner is created without the token", () => {
    const rule = getRule("baton");
    const players = makePlayers(2);
    const s0 = relayHandler.initialState({ config: rule, players, now: 0 });
    const late = makeLatePlayer("p3");
    const s1 = relayHandler.onPlayerJoin?.({
      state: s0,
      config: rule,
      player: late,
      now: 1_000,
    });
    if (!s1) throw new Error("onPlayerJoin missing");
    const slot = slotOf(s1, "p3");
    expect(slot.kind === "token" && slot.has).toBe(false);
  });

  it("baton: late joiner can scan a holder and take the token", () => {
    const rule = getRule("baton");
    const players = makePlayers(2);
    const [p1] = players as [Player, Player];
    const s0 = relayHandler.initialState({ config: rule, players, now: 0 });
    const late = makeLatePlayer("p3");
    const s1 = relayHandler.onPlayerJoin?.({
      state: s0,
      config: rule,
      player: late,
      now: 1_000,
    });
    if (!s1) throw new Error("onPlayerJoin missing");
    const s2 = scan(s1, rule, late, p1, 2_000);
    const lateSlot = slotOf(s2, "p3");
    const p1Slot = slotOf(s2, p1.id);
    expect(lateSlot.kind === "token" && lateSlot.has).toBe(true);
    expect(p1Slot.kind === "token" && p1Slot.has).toBe(false);
  });

  it("steal: late joiner starts at initial.amount (10) because initial.holders === 'all'", () => {
    const rule = getRule("steal");
    const players = makePlayers(2);
    const s0 = relayHandler.initialState({ config: rule, players, now: 0 });
    const late = makeLatePlayer("p3");
    const s1 = relayHandler.onPlayerJoin?.({
      state: s0,
      config: rule,
      player: late,
      now: 1_000,
    });
    if (!s1) throw new Error("onPlayerJoin missing");
    const slot = slotOf(s1, "p3");
    expect(slot.kind === "score" && slot.amount).toBe(10);
  });

  it("collection: late joiner starts at 0", () => {
    const rule = getRule("collection");
    const players = makePlayers(2);
    const s0 = relayHandler.initialState({ config: rule, players, now: 0 });
    const late = makeLatePlayer("p3");
    const s1 = relayHandler.onPlayerJoin?.({
      state: s0,
      config: rule,
      player: late,
      now: 1_000,
    });
    if (!s1) throw new Error("onPlayerJoin missing");
    const slot = slotOf(s1, "p3");
    expect(slot.kind === "score" && slot.amount).toBe(0);
  });

  it("idempotent: if the slot already exists, state is returned unchanged", () => {
    const rule = getRule("collection");
    const players = makePlayers(2);
    const [p1] = players as [Player, Player];
    const s0 = relayHandler.initialState({ config: rule, players, now: 0 });
    const s1 = relayHandler.onPlayerJoin?.({
      state: s0,
      config: rule,
      player: p1,
      now: 999,
    });
    expect(s1).toBe(s0);
  });
});

describe("mergeScanRule", () => {
  const baton = getRule("baton");
  const steal = getRule("steal");

  it("returns current unchanged when patch is empty", () => {
    const r = mergeScanRule(baton, {});
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.merged).toEqual(baton);
  });

  it("overrides initial.holders with an explicit array", () => {
    const r = mergeScanRule(baton, { initial: { holders: ["p2"] } });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.merged.initial.holders).toEqual(["p2"]);
      expect(r.merged.initial.amount).toBe(baton.initial.amount);
    }
  });

  it("changes initial.amount without disturbing initial.holders", () => {
    const r = mergeScanRule(steal, { initial: { amount: 5 } });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.merged.initial.amount).toBe(5);
      expect(r.merged.initial.holders).toBe("all");
    }
  });

  it("can revert initial.holders back to 'one' literal", () => {
    const arrayHolders: ScanRule = {
      ...baton,
      initial: { ...baton.initial, holders: ["p2"] },
    };
    const r = mergeScanRule(arrayHolders, { initial: { holders: "one" } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.merged.initial.holders).toBe("one");
  });

  it("rejects invalid patch with zod issues", () => {
    const r = mergeScanRule(baton, { initial: { amount: "abc" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.length).toBeGreaterThan(0);
  });

  it("preserves nested onScan / constraints when not specified", () => {
    const r = mergeScanRule(baton, { initial: { holders: ["p2"] } });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.merged.onScan).toEqual(baton.onScan);
      expect(r.merged.constraints).toEqual(baton.constraints);
    }
  });

  it("does not mutate the current rule", () => {
    const snapshot = JSON.parse(JSON.stringify(baton));
    mergeScanRule(baton, { initial: { holders: ["p2"] } });
    expect(baton).toEqual(snapshot);
  });

  it("rejects out-of-scope sections (value / onScan / constraints)", () => {
    const cases: unknown[] = [
      { value: { kind: "score", defaultAmount: 3 } },
      { onScan: { source: "lose", sink: "gain" } },
      { constraints: { uniquePerPair: true } },
    ];
    for (const patch of cases) {
      const r = mergeScanRule(baton, patch);
      expect(r.ok).toBe(false);
    }
  });

  it("rejects unknown top-level keys", () => {
    const r = mergeScanRule(baton, { foo: "bar" });
    expect(r.ok).toBe(false);
  });

  it("rejects unknown keys inside initial", () => {
    const r = mergeScanRule(baton, { initial: { holdersTypo: ["p2"] } });
    expect(r.ok).toBe(false);
  });
});

describe("relay handler - metrics", () => {
  it("collection metrics report scanner scores", () => {
    const rule = getRule("collection");
    const players = makePlayers(3);
    const [p1, p2, p3] = players as [Player, Player, Player];
    let s = relayHandler.initialState({ config: rule, players, now: 0 });
    s = scan(s, rule, p1, p2, 1);
    s = scan(s, rule, p1, p3, 2);
    const metrics = relayHandler.metrics({ state: s, config: rule, players, now: 100 });
    const scoreMetric = metrics.find((m) => m.kind === "score");
    expect(scoreMetric).toBeDefined();
    if (scoreMetric && scoreMetric.kind === "score") {
      expect(scoreMetric.byPlayer[p1.id]).toBe(2);
    }
  });
});
