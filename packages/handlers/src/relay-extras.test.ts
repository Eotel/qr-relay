import type { Player } from "@qr-relay/core";
import { describe, expect, it } from "vitest";
import type { RelayState, ScanRule } from "./relay-rule.js";
import { relayHandler } from "./relay.js";

function players(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    name: `P${i + 1}`,
    joinedAt: 0,
  }));
}

function step(state: RelayState, config: ScanRule, scanner: Player, scanned: Player, now: number) {
  return relayHandler.onScan({ state, config, scanner, scanned, payloadData: {}, now });
}

describe("initialState — holders modes", () => {
  it("'all' gives the token to every player", () => {
    const rule: ScanRule = {
      value: { kind: "token" },
      initial: { holders: "all" },
      onScan: { source: "lose", sink: "gain" },
    };
    const state = relayHandler.initialState({ config: rule, players: players(3), now: 0 });
    for (const slot of Object.values(state.values)) {
      expect(slot).toEqual({ kind: "token", has: true });
    }
  });

  it("explicit holder array seeds only those ids", () => {
    const rule: ScanRule = {
      value: { kind: "token" },
      initial: { holders: ["p2"] },
      onScan: { source: "lose", sink: "gain" },
    };
    const state = relayHandler.initialState({ config: rule, players: players(3), now: 0 });
    expect(state.values.p1).toEqual({ kind: "token", has: false });
    expect(state.values.p2).toEqual({ kind: "token", has: true });
    expect(state.values.p3).toEqual({ kind: "token", has: false });
  });

  it("'one' with empty player list yields no holders (no throw)", () => {
    const rule: ScanRule = {
      value: { kind: "token" },
      initial: { holders: "one" },
      onScan: { source: "lose", sink: "gain" },
    };
    const state = relayHandler.initialState({ config: rule, players: [], now: 0 });
    expect(state.values).toEqual({});
    expect(state.history).toEqual([]);
  });
});

describe("score clamping", () => {
  it("clamps scanner increment at maxValue", () => {
    const rule: ScanRule = {
      value: { kind: "score", defaultAmount: 0 },
      initial: { holders: "none" },
      onScan: { source: "keep", sink: "increment", amount: 5 },
      constraints: { maxValue: 7 },
    };
    const [p1, p2] = players(2) as [Player, Player];
    let s = relayHandler.initialState({ config: rule, players: [p1, p2], now: 0 });
    s = step(s, rule, p1, p2, 1).nextState;
    s = step(s, rule, p1, p2, 2).nextState;
    expect(s.values.p1).toEqual({ kind: "score", amount: 7 });
  });
});

describe("onScan — guards and counters", () => {
  const rule: ScanRule = {
    value: { kind: "score", defaultAmount: 0 },
    initial: { holders: "none" },
    onScan: { source: "keep", sink: "increment", amount: 1 },
  };
  const [p1, p2] = players(2) as [Player, Player];

  it("skips scan when scanner slot is missing", () => {
    const ghost: Player = { id: "ghost", name: "G", joinedAt: 0 };
    const s0 = relayHandler.initialState({ config: rule, players: [p1, p2], now: 0 });
    const { nextState, events } = step(s0, rule, ghost, p1, 1);
    expect(nextState).toBe(s0);
    expect(events).toEqual([]);
  });

  it("records history, scanCounts, and pairCounts on accepted scan", () => {
    const s0 = relayHandler.initialState({ config: rule, players: [p1, p2], now: 0 });
    const s1 = step(s0, rule, p1, p2, 10).nextState;
    expect(s1.scanCounts.p1).toBe(1);
    expect(s1.pairCounts["p1>p2"]).toBe(1);
    expect(s1.history).toEqual([{ scannerId: "p1", scannedId: "p2", ts: 10 }]);
  });

  it("emits exactly one scan event per accepted scan", () => {
    const s0 = relayHandler.initialState({ config: rule, players: [p1, p2], now: 0 });
    const { events } = step(s0, rule, p1, p2, 1);
    expect(events).toEqual([{ kind: "scan", scannerId: "p1", scannedId: "p2", ts: 1 }]);
  });
});

describe("metrics", () => {
  it("token mode reports a '保持中' count metric", () => {
    const rule: ScanRule = {
      value: { kind: "token" },
      initial: { holders: "one" },
      onScan: { source: "lose", sink: "gain" },
    };
    const ps = players(3);
    const s = relayHandler.initialState({ config: rule, players: ps, now: 0 });
    const metrics = relayHandler.metrics({ state: s, config: rule, players: ps, now: 0 });
    const holding = metrics.find((m) => m.kind === "count" && m.label === "保持中");
    expect(holding).toBeDefined();
    if (holding && holding.kind === "count") {
      expect(holding.total).toBe(1);
    }
  });

  it("score mode reports a 'スコア' score metric with every player", () => {
    const rule: ScanRule = {
      value: { kind: "score", defaultAmount: 0 },
      initial: { holders: "none" },
      onScan: { source: "keep", sink: "increment", amount: 1 },
    };
    const ps = players(3);
    const s = relayHandler.initialState({ config: rule, players: ps, now: 0 });
    const metrics = relayHandler.metrics({ state: s, config: rule, players: ps, now: 0 });
    const score = metrics.find((m) => m.kind === "score");
    expect(score?.kind === "score" && Object.keys(score.byPlayer).sort()).toEqual(
      ["p1", "p2", "p3"].sort(),
    );
  });

  it("no time metric is emitted (phase lives outside engine)", () => {
    const rule: ScanRule = {
      value: { kind: "token" },
      initial: { holders: "one" },
      onScan: { source: "lose", sink: "gain" },
    };
    const ps = players(2);
    const s = relayHandler.initialState({ config: rule, players: ps, now: 0 });
    const metrics = relayHandler.metrics({ state: s, config: rule, players: ps, now: 100 });
    expect(metrics.find((m) => m.kind === "time")).toBeUndefined();
  });
});
