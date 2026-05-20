import type { Player } from "@qr-relay/core";
import { describe, expect, it } from "vitest";
import { presetById } from "./presets.js";
import type { RelayState, ValueSlot } from "./relay-rule.js";
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
  config: ReturnType<typeof getRule>,
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

function getRule(presetId: string) {
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
    // baton preset: source:lose, sink:gain. requireSourceHas:true (must be holder).
    // requireSinkLacks:true (sink must not have token yet).
    const s0 = relayHandler.initialState({ config: rule, players, now: 0 });
    const s1 = scan(s0, rule, p2, p1, 1); // p2 scans p1's QR
    expect(slotOf(s1, p2.id)).toEqual({ kind: "token", has: true });
    expect(slotOf(s1, p1.id)).toEqual({ kind: "token", has: false });
  });

  it("scan: non-holder scanning non-holder is rejected", () => {
    const s0 = relayHandler.initialState({ config: rule, players, now: 0 });
    const s1 = scan(s0, rule, p2, p3, 1); // neither has token
    expect(slotOf(s1, p2.id)).toEqual({ kind: "token", has: false });
    expect(slotOf(s1, p3.id)).toEqual({ kind: "token", has: false });
  });

  it("scan: token-holder scanning non-holder is rejected (sink already has)", () => {
    // p1 has token, scans p2 (non-holder). requireSinkLacks:true means sink (p1) must lack.
    // p1 has token, so this should be rejected.
    const s0 = relayHandler.initialState({ config: rule, players, now: 0 });
    const s1 = scan(s0, rule, p1, p2, 1);
    expect(slotOf(s1, p1.id)).toEqual({ kind: "token", has: true });
    expect(slotOf(s1, p2.id)).toEqual({ kind: "token", has: false });
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
    const rule0 = getRule("steal");
    const players2 = makePlayers(2);
    let s = relayHandler.initialState({ config: rule0, players: players2, now: 0 });
    // Drain p2 to 0
    for (let i = 0; i < 15; i++) {
      s = scan(s, rule0, players2[0] as Player, players2[1] as Player, i);
    }
    const p2 = players2[1];
    if (!p2) throw new Error("expected p2");
    const slot2 = slotOf(s, p2.id);
    expect(slot2.kind === "score" && slot2.amount).toBe(0);
  });
});

describe("relay handler - tag (鬼ごっこ)", () => {
  const rule = getRule("tag");
  const players = makePlayers(3);
  const [p1, p2, p3] = players as [Player, Player, Player];

  it("first player starts as oni", () => {
    const s0 = relayHandler.initialState({ config: rule, players, now: 0 });
    const slot1 = slotOf(s0, p1.id);
    expect(slot1.kind === "status" && slot1.status).toBe("oni");
    const slot2 = slotOf(s0, p2.id);
    expect(slot2.kind === "status" && slot2.status).toBe("safe");
  });

  it("oni scans non-oni → non-oni becomes oni, original becomes safe", () => {
    const s0 = relayHandler.initialState({ config: rule, players, now: 0 });
    // requireSourceHas: "oni" means the SCANNED player must be oni.
    // Tag-out: 鬼が誰かにタッチする = 鬼が QR をスキャンする?
    // 鬼ごっこの自然な流れ: 鬼が他者を「タッチ」 = 鬼が他者の QR を読む = scanner:oni, scanned:non-oni
    // ただし rule では requireSourceHas: "oni" (scanned must be oni)
    // つまりこの仕様では「鬼の QR をスキャンした人が鬼になる」モデル
    const s1 = scan(s0, rule, p2, p1, 1); // p2 scans p1(oni)
    const slot1 = slotOf(s1, p1.id);
    expect(slot1.kind === "status" && slot1.status).toBe("safe");
    const slot2 = slotOf(s1, p2.id);
    expect(slot2.kind === "status" && slot2.status).toBe("oni");
  });

  it("non-oni cannot scan another non-oni (requireSourceHas:oni fails)", () => {
    const s0 = relayHandler.initialState({ config: rule, players, now: 0 });
    const s1 = scan(s0, rule, p2, p3, 1); // p2 scans p3, neither is oni
    expect(slotOf(s1, p2.id)).toEqual({ kind: "status", status: "safe" });
    expect(slotOf(s1, p3.id)).toEqual({ kind: "status", status: "safe" });
  });
});

describe("relay handler - infection", () => {
  const rule = getRule("infection");
  const players = makePlayers(3);
  const [p1, p2, p3] = players as [Player, Player, Player];

  it("infected spreads to scanner; original stays infected", () => {
    const s0 = relayHandler.initialState({ config: rule, players, now: 0 });
    const s1 = scan(s0, rule, p2, p1, 1); // p2 scans p1(infected)
    expect(slotOf(s1, p1.id)).toEqual({ kind: "status", status: "infected" });
    expect(slotOf(s1, p2.id)).toEqual({ kind: "status", status: "infected" });
  });

  it("isOver true when everyone infected", () => {
    let s = relayHandler.initialState({ config: rule, players, now: 0 });
    s = scan(s, rule, p2, p1, 1);
    s = scan(s, rule, p3, p1, 2);
    expect(relayHandler.isOver?.({ state: s, config: rule, now: 100 })).toBe(true);
  });
});

describe("relay handler - oni-swap", () => {
  const rule = getRule("oni-swap");
  const players = makePlayers(2);
  const [p1, p2] = players as [Player, Player];

  it("swap: scanner and scanned exchange status", () => {
    const s0 = relayHandler.initialState({ config: rule, players, now: 0 });
    expect(slotOf(s0, p1.id)).toEqual({ kind: "status", status: "oni" });
    const s1 = scan(s0, rule, p2, p1, 1); // p2 scans p1(oni)
    expect(slotOf(s1, p1.id)).toEqual({ kind: "status", status: "safe" });
    expect(slotOf(s1, p2.id)).toEqual({ kind: "status", status: "oni" });
  });
});

describe("relay handler - quota", () => {
  const rule = getRule("quota");
  const players = makePlayers(15);

  it("isOver true when someone reaches target", () => {
    const p0 = players[0] as Player;
    let s = relayHandler.initialState({ config: rule, players, now: 0 });
    for (let i = 1; i <= 10; i++) {
      s = scan(s, rule, p0, players[i] as Player, i);
    }
    expect(relayHandler.isOver?.({ state: s, config: rule, now: 100 })).toBe(true);
  });
});

describe("relay handler - hot-potato", () => {
  const rule = getRule("hot-potato");
  const players = makePlayers(2);

  it("isOver true after timer expires", () => {
    const s = relayHandler.initialState({ config: rule, players, now: 0 });
    expect(relayHandler.isOver?.({ state: s, config: rule, now: 30_000 })).toBe(false);
    expect(relayHandler.isOver?.({ state: s, config: rule, now: 61_000 })).toBe(true);
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
