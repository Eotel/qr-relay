import { cn } from "@qr-relay/ui/cn";
import { ArrowUpDown, ScanLine, Target } from "lucide-react";
import { memo, useMemo, useState } from "react";
import type { RankedEntry, Rankings } from "../../lib/host-view.js";

type SortOrder = "desc" | "asc";

/**
 * - `total`  : raw scan count (total fires for SCAN OUT, total hits for SCAN IN)
 * - `unique` : distinct partners (how many different people were on the other end)
 *
 * Selected globally for both columns from a single chip-row toggle. The
 * earlier subscript-style display (`13 ·5人`) crammed both numbers into one
 * cell and made the relationship ambiguous; an explicit toggle makes the
 * meaning of the big number unambiguous.
 */
export type RankingsMetric = "total" | "unique";

type Props = {
  rankings: Rankings;
  /**
   * Per-player unique partner counts. SCAN OUT direction: how many distinct
   * people did this player scan. SCAN IN direction: how many distinct people
   * scanned this player.
   */
  encountersOut?: Record<string, number>;
  encountersIn?: Record<string, number>;
};

/**
 * Two-column ranking board with per-column sort toggle and a global
 * metric toggle (total vs unique partners). Default order is descending by
 * the active metric; the ↕ button on each header flips to ascending.
 * Stable sort preserves the joinedAt tiebreak from the caller.
 *
 * Rows with count=0 receive a small 未参加 badge so dormant players are
 * obvious without a dedicated dormant view.
 */
export const RankingsTile = memo(function RankingsTile({
  rankings,
  encountersOut,
  encountersIn,
}: Props) {
  const [outOrder, setOutOrder] = useState<SortOrder>("desc");
  const [inOrder, setInOrder] = useState<SortOrder>("desc");
  const [metric, setMetric] = useState<RankingsMetric>("total");

  return (
    <section
      aria-label="スキャンランキング"
      className={cn(
        "flex h-full min-h-0 flex-col gap-3 overflow-hidden rounded-[var(--radius-lg)]",
        "border border-white/10 bg-white/[0.04] p-5",
      )}
    >
      <Header metric={metric} onMetricChange={setMetric} />
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 overflow-hidden">
        <Column
          title="SCAN OUT"
          subtitle={metric === "total" ? "スキャンした数" : "スキャンした人数"}
          icon={<ScanLine aria-hidden size={16} />}
          entries={rankings.scanOut}
          overrides={metric === "unique" ? encountersOut : undefined}
          order={outOrder}
          onToggleOrder={() => setOutOrder((o) => (o === "desc" ? "asc" : "desc"))}
        />
        <Column
          title="SCAN IN"
          subtitle={metric === "total" ? "スキャンされた数" : "スキャンされた人数"}
          icon={<Target aria-hidden size={16} />}
          entries={rankings.scanIn}
          overrides={metric === "unique" ? encountersIn : undefined}
          order={inOrder}
          onToggleOrder={() => setInOrder((o) => (o === "desc" ? "asc" : "desc"))}
        />
      </div>
    </section>
  );
});

function Header({
  metric,
  onMetricChange,
}: {
  metric: RankingsMetric;
  onMetricChange: (m: RankingsMetric) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-muted-foreground">
        RANKINGS
      </span>
      <div
        role="group"
        aria-label="集計方法"
        className="inline-flex rounded-md border border-white/10 bg-white/[0.04] p-0.5 text-[11px] font-bold tracking-wide"
      >
        <MetricChip active={metric === "total"} onClick={() => onMetricChange("total")}>
          総数
        </MetricChip>
        <MetricChip active={metric === "unique"} onClick={() => onMetricChange("unique")}>
          ユニーク
        </MetricChip>
      </div>
    </div>
  );
}

function MetricChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-6 items-center rounded-sm px-2.5",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-white/5",
      )}
    >
      {children}
    </button>
  );
}

type ColumnProps = {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  entries: RankedEntry[];
  /**
   * When provided, the row's displayed count and the sort key are replaced
   * by `overrides[entry.id]` (defaults to 0 for missing ids). Used to render
   * the `metric === "unique"` view without rebuilding the upstream Rankings.
   */
  overrides?: Record<string, number>;
  order: SortOrder;
  onToggleOrder: () => void;
};

function Column({ title, subtitle, icon, entries, overrides, order, onToggleOrder }: ColumnProps) {
  // When overrides are active (`unique` metric), the upstream desc-sort no
  // longer matches. Re-sort by the override value with a joinedAt-style
  // stable tiebreak (we preserve the input order which already has it).
  const sorted = useMemo(() => {
    const display = entries.map((e) => ({
      ...e,
      count: overrides ? (overrides[e.id] ?? 0) : e.count,
    }));
    if (!overrides && order === "desc") return display;
    if (order === "desc") {
      return display.sort((a, b) => b.count - a.count);
    }
    return display.sort((a, b) => a.count - b.count);
  }, [entries, overrides, order]);

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-[12px] font-extrabold uppercase tracking-[0.2em]">{title}</span>
        <span className="text-[10px] font-bold tracking-wide opacity-60">{subtitle}</span>
        <button
          type="button"
          onClick={onToggleOrder}
          aria-label={`${title} 並び順 (${order === "desc" ? "降順" : "昇順"})`}
          aria-pressed={order === "asc"}
          className={cn(
            "ml-auto inline-flex h-6 items-center gap-1 rounded-md border border-white/10 px-1.5",
            "text-[10px] font-bold tracking-wide hover:bg-white/5",
            order === "asc" ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <ArrowUpDown size={12} aria-hidden />
          <span>{order === "desc" ? "降順" : "昇順"}</span>
        </button>
      </div>
      <ol className="m-0 flex min-h-0 flex-col gap-1 overflow-hidden p-0">
        {sorted.length === 0 ? (
          <li className="text-[clamp(14px,1.6vw,20px)] font-bold text-muted-foreground">
            参加者なし
          </li>
        ) : (
          sorted.map((e, i) => <Row key={e.id} entry={e} rank={i + 1} order={order} />)
        )}
      </ol>
    </div>
  );
}

function Row({
  entry,
  rank,
  order,
}: {
  entry: RankedEntry;
  rank: number;
  order: SortOrder;
}) {
  const isTop = order === "desc" && rank <= 3 && entry.count > 0;
  const isDormant = entry.count === 0;
  return (
    <li
      className={cn(
        "flex items-baseline gap-3",
        isTop ? "text-[clamp(20px,2.6vw,38px)] font-black" : "text-[clamp(14px,1.6vw,20px)]",
      )}
    >
      <span
        className={cn(
          "w-[2ch] shrink-0 text-right tabular-nums",
          isTop ? "text-[var(--team-yellow)]" : "text-muted-foreground",
        )}
      >
        {rank}
      </span>
      <span className="min-w-0 flex-1 truncate font-bold">{entry.name}</span>
      {isDormant && (
        <span className="shrink-0 rounded-sm border border-current/40 px-1.5 py-px text-[0.55em] font-bold tracking-wide text-muted-foreground">
          未参加
        </span>
      )}
      <span className="shrink-0 tabular-nums text-[var(--primary)]">{entry.count}</span>
    </li>
  );
}
