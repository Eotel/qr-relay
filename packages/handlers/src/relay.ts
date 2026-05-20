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
    case "status": {
      const def = rule.value.defaultStatus ?? "none";
      const initialStatus = rule.initial.status ?? def;
      return { kind: "status", status: has ? initialStatus : def };
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

function slotHasStatus(slot: ValueSlot, expected: boolean | string): boolean {
  if (typeof expected === "boolean") {
    switch (slot.kind) {
      case "token":
        return slot.has === expected;
      case "score":
        return expected ? slot.amount > 0 : slot.amount <= 0;
      case "status":
        return expected ? slot.status !== "none" : slot.status === "none";
    }
  }
  return slot.kind === "status" && slot.status === expected;
}

function slotLacksStatus(slot: ValueSlot, expected: boolean | string): boolean {
  return !slotHasStatus(slot, expected);
}

function applyChange(
  slot: ValueSlot,
  change: ScanRule["onScan"]["source"] | ScanRule["onScan"]["sink"],
  amount: number,
  newStatus: string | undefined,
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
      case "set-status":
        return slot;
    }
  }
  if (slot.kind === "score") {
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
      case "set-status":
        return slot;
    }
  }
  if (slot.kind === "status") {
    switch (change) {
      case "keep":
        return slot;
      case "set-status":
        return { kind: "status", status: newStatus ?? slot.status };
      case "lose":
        return { kind: "status", status: "none" };
      case "gain":
        return { kind: "status", status: newStatus ?? "active" };
      case "increment":
      case "decrement":
        return slot;
    }
  }
  return slot;
}

export const relayHandler: ScanHandler<ScanRule, RelayState, unknown> = {
  id: "relay",
  name: "Relay Engine",
  description:
    "汎用スキャン交換エンジン。プリセット (バトン / 奪い合い / 鬼ごっこ など) を ScanRule として渡す",
  configSchema: ScanRule,
  dataSchema: ScanRuleData,

  initialState({ config, players, now }) {
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
      startedAt: now,
      endedAt: null,
      history: [],
    };
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

    // uniquePerPair
    const pairKey = `${scanner.id}>${scanned.id}`;
    if (constraints.uniquePerPair && (state.pairCounts[pairKey] ?? 0) > 0) {
      return { nextState: state, events };
    }

    const scannerSlot = state.values[scanner.id];
    const scannedSlot = state.values[scanned.id];
    if (!scannerSlot || !scannedSlot) {
      return { nextState: state, events };
    }

    if (
      constraints.requireSourceHas !== undefined &&
      !slotHasStatus(scannedSlot, constraints.requireSourceHas)
    ) {
      return { nextState: state, events };
    }
    if (
      constraints.requireSinkLacks !== undefined &&
      !slotLacksStatus(scannerSlot, constraints.requireSinkLacks)
    ) {
      return { nextState: state, events };
    }

    let nextScanner: ValueSlot = scannerSlot;
    let nextScanned: ValueSlot = scannedSlot;

    if (rule.onScan.swap) {
      nextScanner = scannedSlot;
      nextScanned = scannerSlot;
    } else {
      nextScanned = applyChange(
        scannedSlot,
        rule.onScan.source,
        amount,
        rule.onScan.sourceStatus,
        rule,
      );
      nextScanner = applyChange(
        scannerSlot,
        rule.onScan.sink,
        amount,
        rule.onScan.sinkStatus,
        rule,
      );
    }

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

  metrics({ state, config, players, now }) {
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

    if (rule.value.kind === "status") {
      const byStatus: Record<string, number> = {};
      for (const p of players) {
        const slot = state.values[p.id];
        if (slot && slot.kind === "status") {
          byStatus[slot.status] = (byStatus[slot.status] ?? 0) + 1;
        }
      }
      for (const [status, count] of Object.entries(byStatus)) {
        metrics.push({ kind: "count", label: `${status}`, total: count });
      }
    }

    const elapsed = (state.endedAt ?? now) - state.startedAt;
    metrics.push({ kind: "time", label: "経過時間", ms: elapsed });

    return metrics;
  },

  isOver({ state, config, now }) {
    if (state.endedAt !== null) return true;
    const end = config.end;
    if (!end || end.kind === "manual") return false;

    switch (end.kind) {
      case "target": {
        if (config.value.kind === "score") {
          return Object.values(state.values).some(
            (slot) => slot.kind === "score" && slot.amount >= end.value,
          );
        }
        return Object.values(state.scanCounts).some((c) => c >= end.value);
      }
      case "all-have-status":
        return Object.values(state.values).every(
          (slot) => slot.kind === "status" && slot.status === end.status,
        );
      case "only-one-left": {
        const matching = Object.values(state.values).filter(
          (slot) => slot.kind === "status" && slot.status === end.status,
        );
        return matching.length <= 1;
      }
      case "timer-ms":
        return now - state.startedAt >= end.ms;
      default:
        return false;
    }
  },
};
