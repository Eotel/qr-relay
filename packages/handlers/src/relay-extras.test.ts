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
    expect(state.startedAt).toBe(0);
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

describe("isOver — end conditions", () => {
  const ps = players(2);
  const [p1, p2] = ps as [Player, Player];

  it("manual end never auto-finishes", () => {
    const rule: ScanRule = {
      value: { kind: "token" },
      initial: { holders: "one" },
      onScan: { source: "lose", sink: "gain" },
      end: { kind: "manual" },
    };
    const s = relayHandler.initialState({ config: rule, players: ps, now: 0 });
    expect(relayHandler.isOver?.({ state: s, config: rule, now: 9_999_999 })).toBe(false);
  });

  it("returns true once endedAt is set", () => {
    const rule: ScanRule = {
      value: { kind: "token" },
      initial: { holders: "one" },
      onScan: { source: "lose", sink: "gain" },
      end: { kind: "manual" },
    };
    const s0 = relayHandler.initialState({ config: rule, players: ps, now: 0 });
    const s1: RelayState = { ...s0, endedAt: 100 };
    expect(relayHandler.isOver?.({ state: s1, config: rule, now: 0 })).toBe(true);
  });

  it("target on score: triggers when any player reaches threshold", () => {
    const rule: ScanRule = {
      value: { kind: "score", defaultAmount: 0 },
      initial: { holders: "none" },
      onScan: { source: "keep", sink: "increment", amount: 1 },
      end: { kind: "target", value: 3 },
    };
    let s = relayHandler.initialState({ config: rule, players: ps, now: 0 });
    expect(relayHandler.isOver?.({ state: s, config: rule, now: 1 })).toBe(false);
    for (let i = 0; i < 3; i++) {
      s = step(s, rule, p1, p2, i).nextState;
    }
    expect(relayHandler.isOver?.({ state: s, config: rule, now: 10 })).toBe(true);
  });

  it("only-one-left: true when at most one player still has the status", () => {
    const rule: ScanRule = {
      value: { kind: "status", defaultStatus: "safe" },
      initial: { holders: "all", status: "alive" },
      onScan: { source: "set-status", sink: "keep", sourceStatus: "out" },
      end: { kind: "only-one-left", status: "alive" },
    };
    const s0 = relayHandler.initialState({ config: rule, players: ps, now: 0 });
    expect(relayHandler.isOver?.({ state: s0, config: rule, now: 1 })).toBe(false);
    const s1 = step(s0, rule, p1, p2, 1).nextState;
    expect(relayHandler.isOver?.({ state: s1, config: rule, now: 2 })).toBe(true);
  });

  it("timer-ms: false before elapsed, true after", () => {
    const rule: ScanRule = {
      value: { kind: "token" },
      initial: { holders: "one" },
      onScan: { source: "lose", sink: "gain" },
      end: { kind: "timer-ms", ms: 5_000 },
    };
    const s = relayHandler.initialState({ config: rule, players: ps, now: 1_000 });
    expect(relayHandler.isOver?.({ state: s, config: rule, now: 5_999 })).toBe(false);
    expect(relayHandler.isOver?.({ state: s, config: rule, now: 6_000 })).toBe(true);
  });

  it("no end config → never over (until endedAt is set explicitly)", () => {
    const rule: ScanRule = {
      value: { kind: "token" },
      initial: { holders: "one" },
      onScan: { source: "lose", sink: "gain" },
    };
    const s = relayHandler.initialState({ config: rule, players: ps, now: 0 });
    expect(relayHandler.isOver?.({ state: s, config: rule, now: Number.MAX_SAFE_INTEGER })).toBe(
      false,
    );
  });
});

describe("metrics", () => {
  it("emits a status count per distinct status value", () => {
    const rule: ScanRule = {
      value: { kind: "status", defaultStatus: "safe" },
      initial: { holders: "one", status: "oni" },
      onScan: { source: "keep", sink: "keep" },
    };
    const ps = players(3);
    const s = relayHandler.initialState({ config: rule, players: ps, now: 0 });
    const metrics = relayHandler.metrics({ state: s, config: rule, players: ps, now: 1_000 });
    const counts = metrics.filter((m) => m.kind === "count");
    const labels = counts.map((m) => m.label);
    expect(labels).toContain("oni");
    expect(labels).toContain("safe");
    const time = metrics.find((m) => m.kind === "time");
    expect(time?.kind === "time" && time.ms).toBe(1_000);
  });

  it("token mode reports a 'holding' count metric", () => {
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
});
