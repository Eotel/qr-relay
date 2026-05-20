import type { GameEvent, Metric, Player, ScanHandler } from "@qr-relay/core";
import { type RelayState, ScanRule, ScanRuleData, type ValueSlot } from "./relay-rule.js";

function makeSlot(rule: ScanRule, holders: Set<string>, playerId: string): ValueSlot {
  const has = holders.has(playerId);
  switch (rule.value.kind) {
    case "token":
      return { kind: "token", has };
    case "score": {
      const def = rule.value.defaultAmount ?? 0;
      const initialAmount = rule.initial.amount ?? def;
      return { kind: "score", amount: has ? initialAmount : def };
    }
  }
}

function resolveInitialHolders(rule: ScanRule, players: Player[]): Set<string> {
  switch (rule.initial.holders) {
    case "all":
      return new Set(players.map((p) => p.id));
    case "none":
      return new Set();
    case "one":
      return new Set(players[0]?.id ? [players[0].id] : []);
    default:
      return new Set(rule.initial.holders);
  }
}

function clamp(n: number, min: number | undefined, max: number | undefined): number {
  let v = n;
  if (min !== undefined) v = Math.max(min, v);
  if (max !== undefined) v = Math.min(max, v);
  return v;
}

function slotHas(slot: ValueSlot): boolean {
  switch (slot.kind) {
    case "token":
      return slot.has;
    case "score":
      return slot.amount > 0;
  }
}

function slotLacks(slot: ValueSlot): boolean {
  return !slotHas(slot);
}

function applyChange(
  slot: ValueSlot,
  change: ScanRule["onScan"]["source"] | ScanRule["onScan"]["sink"],
  amount: number,
  rule: ScanRule,
): ValueSlot {
  if (slot.kind === "token") {
    switch (change) {
      case "keep":
        return slot;
      case "lose":
        return { kind: "token", has: false };
      case "gain":
        return { kind: "token", has: true };
      case "increment":
      case "decrement":
        return slot;
    }
  }
  const max = rule.constraints?.maxValue;
  const min = rule.constraints?.minValue ?? 0;
  switch (change) {
    case "keep":
      return slot;
    case "increment":
    case "gain":
      return { kind: "score", amount: clamp(slot.amount + amount, min, max) };
    case "decrement":
    case "lose":
      return { kind: "score", amount: clamp(slot.amount - amount, min, max) };
  }
}

export const relayHandler: ScanHandler<ScanRule, RelayState, unknown> = {
  id: "relay",
  name: "Relay Engine",
  description:
    "汎用スキャン交換エンジン。プリセット (バトン / 感染 / 奪い合い など) を ScanRule として渡す",
  configSchema: ScanRule,
  dataSchema: ScanRuleData,

  initialState({ config, players }) {
    const rule = config;
    const holders = resolveInitialHolders(rule, players);
    const values: Record<string, ValueSlot> = {};
    for (const p of players) {
      values[p.id] = makeSlot(rule, holders, p.id);
    }
    return {
      values,
      scanCounts: {},
      pairCounts: {},
      history: [],
    };
  },

  /**
   * Mid-game join: materialize a slot for the new player so they can scan and
   * be scanned right away. Treat the new player as a holder iff the rule's
   * `initial.holders` is "all" — i.e., the rule says "everyone starts with
   * the value". For "one" / "none" / pre-listed sets, late joiners always
   * start without the value (the existing holders keep theirs).
   *
   * Existing slot is preserved (rejoin / rename leaves state untouched).
   */
  onPlayerJoin({ state, config, player }) {
    if (state.values[player.id]) return state;
    const rule = config;
    const isLateHolder = rule.initial.holders === "all";
    const fakeHolders = new Set<string>(isLateHolder ? [player.id] : []);
    const slot = makeSlot(rule, fakeHolders, player.id);
    return {
      ...state,
      values: { ...state.values, [player.id]: slot },
    };
  },

  /**
   * Player leave hook: drop their slot, scan counts, and pair counts so
   * metrics no longer surface stale rows. History entries are kept so the
   * token-path / ranking views can still attribute past scans.
   */
  onPlayerLeave({ state, player }) {
    if (!state.values[player.id]) return state;
    const { [player.id]: _removed, ...values } = state.values;
    const { [player.id]: _count, ...scanCounts } = state.scanCounts;
    const pairCounts: Record<string, number> = {};
    for (const [k, v] of Object.entries(state.pairCounts)) {
      const [a, b] = k.split(">");
      if (a === player.id || b === player.id) continue;
      pairCounts[k] = v;
    }
    return { ...state, values, scanCounts, pairCounts };
  },

  payloadFor() {
    // relay 単体では現状 QR には何も特別な data は不要 (識別子のみで十分)
    return {};
  },

  onScan({ state, config, scanner, scanned, now }) {
    const rule = config;
    const events: GameEvent[] = [];
    const amount = rule.onScan.amount ?? 1;
    const constraints = rule.constraints ?? {};

    const pairKey = `${scanner.id}>${scanned.id}`;
    if (constraints.uniquePerPair && (state.pairCounts[pairKey] ?? 0) > 0) {
      return { nextState: state, events };
    }

    const scannerSlot = state.values[scanner.id];
    const scannedSlot = state.values[scanned.id];
    if (!scannerSlot || !scannedSlot) {
      return { nextState: state, events };
    }

    if (constraints.requireSourceHas === true && !slotHas(scannedSlot)) {
      return { nextState: state, events };
    }
    if (constraints.requireSourceHas === false && slotHas(scannedSlot)) {
      return { nextState: state, events };
    }
    if (constraints.requireSinkLacks === true && !slotLacks(scannerSlot)) {
      return { nextState: state, events };
    }
    if (constraints.requireSinkLacks === false && slotLacks(scannerSlot)) {
      return { nextState: state, events };
    }

    const nextScanned = applyChange(scannedSlot, rule.onScan.source, amount, rule);
    const nextScanner = applyChange(scannerSlot, rule.onScan.sink, amount, rule);

    const nextValues = {
      ...state.values,
      [scanner.id]: nextScanner,
      [scanned.id]: nextScanned,
    };

    const nextState: RelayState = {
      ...state,
      values: nextValues,
      scanCounts: {
        ...state.scanCounts,
        [scanner.id]: (state.scanCounts[scanner.id] ?? 0) + 1,
      },
      pairCounts: {
        ...state.pairCounts,
        [pairKey]: (state.pairCounts[pairKey] ?? 0) + 1,
      },
      history: [...state.history, { scannerId: scanner.id, scannedId: scanned.id, ts: now }],
    };

    events.push({ kind: "scan", scannerId: scanner.id, scannedId: scanned.id, ts: now });
    return { nextState, events };
  },

  metrics({ state, config, players }) {
    const metrics: Metric[] = [];
    const rule = config;

    const totalScans = Object.values(state.scanCounts).reduce((s, v) => s + v, 0);
    metrics.push({
      kind: "count",
      label: "総スキャン数",
      total: totalScans,
      byPlayer: { ...state.scanCounts },
    });

    if (rule.value.kind === "score") {
      const byPlayer: Record<string, number> = {};
      for (const p of players) {
        const slot = state.values[p.id];
        byPlayer[p.id] = slot && slot.kind === "score" ? slot.amount : 0;
      }
      metrics.push({ kind: "score", label: "スコア", byPlayer });
    }

    if (rule.value.kind === "token") {
      const holders: Record<string, number> = {};
      for (const p of players) {
        const slot = state.values[p.id];
        holders[p.id] = slot && slot.kind === "token" && slot.has ? 1 : 0;
      }
      metrics.push({
        kind: "count",
        label: "保持中",
        total: Object.values(holders).reduce((s, v) => s + v, 0),
        byPlayer: holders,
      });
    }

    return metrics;
  },
};
