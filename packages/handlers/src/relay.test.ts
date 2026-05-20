import type { Player } from "@qr-relay/core";
import { describe, expect, it } from "vitest";
import { presetById } from "./presets.js";
import type { RelayState, ScanRule, ValueSlot } from "./relay-rule.js";
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
