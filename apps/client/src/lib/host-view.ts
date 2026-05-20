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
 * Dashboard-side aggregates derived from server Metric[]. Pure so a header
 * chip strip can render summary numbers without subscribing to the full
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

/** One scan entry as stored in RelayState.history. */
export type ScanHistoryEntry = { scannerId: string; scannedId: string; ts: number };

type RelayStateWithHistory = RelayStateShape & {
  history?: unknown;
};

type RelayStateWithPairCounts = RelayStateShape & {
  pairCounts?: unknown;
};

function readHistory(state: unknown): ScanHistoryEntry[] {
  if (!state || typeof state !== "object") return [];
  const raw = (state as RelayStateWithHistory).history;
  if (!Array.isArray(raw)) return [];
  const out: ScanHistoryEntry[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const { scannerId, scannedId, ts } = e as Record<string, unknown>;
    if (typeof scannerId !== "string" || typeof scannedId !== "string" || typeof ts !== "number") {
      continue;
    }
    out.push({ scannerId, scannedId, ts });
  }
  return out;
}

/**
 * scan-out (the player initiated) / scan-in (the player was the target) rankings.
 * Sorted by count descending; ties broken by joinedAt ascending so the lobby
 * order is preserved (and the order is deterministic across re-renders).
 *
 * Every known player is included even with count 0 so the host can see who
 * hasn't participated yet.
 */
export type RankedEntry = { id: string; name: string; count: number };
export type Rankings = { scanOut: RankedEntry[]; scanIn: RankedEntry[] };

export function rankings(state: unknown, players: PlayerLite[]): Rankings {
  const history = readHistory(state);
  const outCounts = new Map<string, number>();
  const inCounts = new Map<string, number>();
  for (const h of history) {
    outCounts.set(h.scannerId, (outCounts.get(h.scannerId) ?? 0) + 1);
    inCounts.set(h.scannedId, (inCounts.get(h.scannedId) ?? 0) + 1);
  }
  const joinOrder = new Map(players.map((p) => [p.id, p.joinedAt]));
  const build = (counts: Map<string, number>): RankedEntry[] =>
    players
      .map((p) => ({ id: p.id, name: p.name, count: counts.get(p.id) ?? 0 }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        const ja = joinOrder.get(a.id) ?? 0;
        const jb = joinOrder.get(b.id) ?? 0;
        return ja - jb;
      });
  return { scanOut: build(outCounts), scanIn: build(inCounts) };
}

/**
 * For each player, the number of *distinct* partners they have successfully
 * scanned. Repeat scans of the same target do not inflate the count, so a
 * player who fires 10 scans at the same person still reads as `1`.
 *
 * Derived from `RelayState.pairCounts` (keys shaped `"scannerId>scannedId"`),
 * so this is scan-out-direction only. Every known player is included with a
 * count, defaulting to 0 for players with no scan-outs yet.
 */
export function encounterCounts(state: unknown, players: PlayerLite[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of players) out[p.id] = 0;
  if (!state || typeof state !== "object") return out;
  const raw = (state as RelayStateWithPairCounts).pairCounts;
  if (!raw || typeof raw !== "object") return out;
  const known = new Set(players.map((p) => p.id));
  const seen = new Map<string, Set<string>>();
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) continue;
    const idx = key.indexOf(">");
    if (idx <= 0 || idx === key.length - 1) continue;
    const scannerId = key.slice(0, idx);
    const scannedId = key.slice(idx + 1);
    if (!known.has(scannerId)) continue;
    let set = seen.get(scannerId);
    if (!set) {
      set = new Set<string>();
      seen.set(scannerId, set);
    }
    set.add(scannedId);
  }
  for (const [id, set] of seen) out[id] = set.size;
  return out;
}

/**
 * Reverse-direction encounters: per scanned player, count the number of
 * distinct scanners that have ever scanned them (regardless of how many
 * times each). Mirrors `encounterCounts` for the SCAN IN side so the
 * rankings tile can offer a "unique partner" view symmetrically.
 *
 * Derived from `RelayState.pairCounts` (keys shaped `"scannerId>scannedId"`).
 * Every known player is included, defaulting to 0 for players nobody has
 * scanned yet.
 */
export function inboundEncounterCounts(
  state: unknown,
  players: PlayerLite[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of players) out[p.id] = 0;
  if (!state || typeof state !== "object") return out;
  const raw = (state as RelayStateWithPairCounts).pairCounts;
  if (!raw || typeof raw !== "object") return out;
  const known = new Set(players.map((p) => p.id));
  const seen = new Map<string, Set<string>>();
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) continue;
    const idx = key.indexOf(">");
    if (idx <= 0 || idx === key.length - 1) continue;
    const scannerId = key.slice(0, idx);
    const scannedId = key.slice(idx + 1);
    if (!known.has(scannedId)) continue;
    let set = seen.get(scannedId);
    if (!set) {
      set = new Set<string>();
      seen.set(scannedId, set);
    }
    set.add(scannerId);
  }
  for (const [id, set] of seen) out[id] = set.size;
  return out;
}

/**
 * Scan history in time-ascending order, each entry resolved to player names so
 * the dashboard can render `Alice → Bob` rows without re-joining player data.
 * Entries referencing players no longer present in `players[]` are dropped —
 * server keeps history for attribution, but the path view stays consistent
 * with rankings/participants and never surfaces ghost `#id` rows.
 */
export type TokenPathStep = {
  scannerId: string;
  scannerName: string;
  scannedId: string;
  scannedName: string;
  ts: number;
};

/**
 * Pick a column/row count so `n` cells fill a container with the given aspect
 * ratio while staying close to square. Aspect is `width / height`; a wider
 * container yields more columns. Cells never exceed `n`, so 3 players never
 * end up in a 5-column row with two empty slots.
 *
 * Used by the INFECTION board to avoid wasted whitespace at low player counts,
 * where fixed Tailwind breakpoints (`lg:grid-cols-5`) would leave 2 players
 * pinned to the left edge.
 */
export type GridShape = { cols: number; rows: number };

export function computeGridShape(n: number, aspect: number): GridShape {
  if (n <= 1) return { cols: 1, rows: 1 };
  const safeAspect = Math.max(aspect, 0.1);
  const ideal = Math.sqrt(n * safeAspect);
  const cols = Math.min(n, Math.max(1, Math.round(ideal)));
  const rows = Math.ceil(n / cols);
  return { cols, rows };
}

export function tokenPathChain(state: unknown, players: PlayerLite[]): TokenPathStep[] {
  const history = readHistory(state);
  const nameById = new Map(players.map((p) => [p.id, p.name]));
  const out: TokenPathStep[] = [];
  for (const h of [...history].sort((a, b) => a.ts - b.ts)) {
    const scannerName = nameById.get(h.scannerId);
    const scannedName = nameById.get(h.scannedId);
    if (scannerName === undefined || scannedName === undefined) continue;
    out.push({
      scannerId: h.scannerId,
      scannerName,
      scannedId: h.scannedId,
      scannedName,
      ts: h.ts,
    });
  }
  return out;
}
