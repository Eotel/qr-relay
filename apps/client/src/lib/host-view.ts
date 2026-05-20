import type { Metric, Phase } from "@qr-relay/core";
import type { ValueSlot } from "@qr-relay/handlers";
import type { PlayerLite } from "./ws-store.js";

/**
 * Stage-dashboard "hero" view selection, derived from preset shape + live
 * state. Pure so the dashboard component can stay declarative and tests cover
 * the matrix of preset × player count without a renderer.
 *
 * The kind discrimination drives which giant cell the dashboard renders:
 * - `waiting`: phase=ready or no players yet → show QR + room code as the hero
 * - `token-single`: baton-style (rule.onScan.source === 'lose'), 1 holder at
 *   most → giant holder name
 * - `token-many`: infection-style (rule.onScan.source === 'keep') → X / N
 *   progress over a roster
 * - `score-leader`: any score preset → leader badge + all-player ranking
 */
export type HostHeroPlayer = { id: string; name: string };

export type HostHeroScoreEntry = HostHeroPlayer & { score: number };

export type HostHeroView =
  | { kind: "waiting"; playerCount: number }
  | { kind: "token-single"; holder: HostHeroPlayer | null }
  | {
      kind: "token-many";
      holders: HostHeroPlayer[];
      totalPlayers: number;
    }
  | {
      kind: "score-leader";
      leaders: HostHeroScoreEntry[];
    };

type RuleShape = {
  value?: { kind?: unknown } | null;
  onScan?: { source?: unknown } | null;
};

type RelayStateShape = {
  values?: Record<string, ValueSlot | undefined> | null;
};

function readRule(rule: unknown): { valueKind: "token" | "score" | null; source: string | null } {
  if (!rule || typeof rule !== "object") return { valueKind: null, source: null };
  const r = rule as RuleShape;
  const valueKindRaw = r.value?.kind;
  const valueKind =
    valueKindRaw === "token" || valueKindRaw === "score"
      ? (valueKindRaw as "token" | "score")
      : null;
  const sourceRaw = r.onScan?.source;
  const source = typeof sourceRaw === "string" ? sourceRaw : null;
  return { valueKind, source };
}

function readValues(state: unknown): Record<string, ValueSlot> {
  if (!state || typeof state !== "object") return {};
  const values = (state as RelayStateShape).values;
  if (!values || typeof values !== "object") return {};
  const out: Record<string, ValueSlot> = {};
  for (const [k, v] of Object.entries(values)) {
    if (v) out[k] = v;
  }
  return out;
}

function tokenHolders(values: Record<string, ValueSlot>, players: PlayerLite[]): HostHeroPlayer[] {
  const out: HostHeroPlayer[] = [];
  for (const p of players) {
    const slot = values[p.id];
    if (slot?.kind === "token" && slot.has) out.push({ id: p.id, name: p.name });
  }
  return out;
}

function scoreEntries(
  values: Record<string, ValueSlot>,
  players: PlayerLite[],
): HostHeroScoreEntry[] {
  return players
    .map((p) => {
      const slot = values[p.id];
      const score = slot?.kind === "score" ? slot.amount : 0;
      return { id: p.id, name: p.name, score };
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

export type PickHostHeroViewInput = {
  phase: Phase;
  state: unknown;
  players: PlayerLite[];
  rule: unknown;
};

export function pickHostHeroView({
  phase,
  state,
  players,
  rule,
}: PickHostHeroViewInput): HostHeroView {
  if (phase.kind === "ready" || players.length === 0) {
    return { kind: "waiting", playerCount: players.length };
  }

  const { valueKind, source } = readRule(rule);
  const values = readValues(state);

  if (valueKind === "token") {
    const holders = tokenHolders(values, players);
    // baton-style (`source: 'lose'`) is constrained to 1 holder. Anything else
    // (infection-style `keep`, or unknown) is treated as the multi-holder
    // roster view so X / N still reads correctly even before the first scan.
    if (source === "lose") {
      return { kind: "token-single", holder: holders[0] ?? null };
    }
    return { kind: "token-many", holders, totalPlayers: players.length };
  }

  if (valueKind === "score") {
    const entries = scoreEntries(values, players);
    const top = entries[0]?.score ?? 0;
    const leaders = top > 0 ? entries.filter((e) => e.score === top) : [];
    return { kind: "score-leader", leaders };
  }

  // Unknown / not-yet-loaded rule: fall back to waiting so the dashboard
  // doesn't flash an empty hero cell while config is in flight.
  return { kind: "waiting", playerCount: players.length };
}

/**
 * Dashboard-side aggregates derived from server Metric[]. Pure so the
 * OperatorStrip can render summary chips without subscribing to the full
 * metrics array. `totalScans` is the relay handler's "総スキャン数" total;
 * `tokenHolderCount` is the count of true tokens (only non-zero for token
 * presets — `null` for score presets).
 */
export type HostMetricSummary = {
  totalScans: number;
  tokenHolderCount: number | null;
};

export function summarizeMetricsForHost(metrics: Metric[]): HostMetricSummary {
  let totalScans = 0;
  let tokenHolderCount: number | null = null;
  for (const m of metrics) {
    if (m.kind === "count" && m.label === "総スキャン数") {
      totalScans = m.total;
    } else if (m.kind === "count" && m.label === "保持中") {
      tokenHolderCount = m.total;
    }
  }
  return { totalScans, tokenHolderCount };
}
