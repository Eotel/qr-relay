import { cn } from "@qr-relay/ui/cn";
import { ArrowUpDown, ScanLine, Target } from "lucide-react";
import { useMemo, useState } from "react";
import type { RankedEntry, Rankings } from "../../lib/host-view.js";

type SortOrder = "desc" | "asc";

type Props = {
  rankings: Rankings;
  /**
   * Optional per-player encounters (unique scanned partners). When provided
   * and > 0 it renders as a small subscript next to the SCAN OUT count.
   * SCAN IN is left as-is — encounters is a scanner-direction signal.
   */
  encounters?: Record<string, number>;
};

/**
 * Two-column ranking board with per-column sort toggle. Default order is
 * descending by count (input from `rankings()`); the ↕ button on each header
 * flips to ascending. Stable sort preserves the joinedAt tiebreak from the
 * caller, so equal-count rows stay in lobby order regardless of direction.
 *
 * Rows with count=0 receive a small 未参加 badge so dormant players are
 * obvious without a dedicated dormant view.
 */
export function RankingsTile({ rankings, encounters }: Props) {
  const [outOrder, setOutOrder] = useState<SortOrder>("desc");
  const [inOrder, setInOrder] = useState<SortOrder>("desc");

  return (
    <section
      aria-label="スキャンランキング"
      className={cn(
        "flex h-full min-h-0 flex-col gap-3 overflow-hidden rounded-[var(--radius-lg)]",
        "border border-white/10 bg-white/[0.04] p-5",
      )}
    >
      <Header />
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 overflow-hidden">
        <Column
          title="SCAN OUT"
          subtitle="スキャンした数"
          icon={<ScanLine aria-hidden size={16} />}
          entries={rankings.scanOut}
          encounters={encounters}
          order={outOrder}
          onToggleOrder={() => setOutOrder((o) => (o === "desc" ? "asc" : "desc"))}
        />
        <Column
          title="SCAN IN"
          subtitle="スキャンされた数"
          icon={<Target aria-hidden size={16} />}
          entries={rankings.scanIn}
          order={inOrder}
          onToggleOrder={() => setInOrder((o) => (o === "desc" ? "asc" : "desc"))}
        />
      </div>
    </section>
  );
}

function Header() {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-muted-foreground">
        RANKINGS
      </span>
    </div>
  );
}

type ColumnProps = {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  entries: RankedEntry[];
  encounters?: Record<string, number>;
  order: SortOrder;
  onToggleOrder: () => void;
};

function Column({ title, subtitle, icon, entries, encounters, order, onToggleOrder }: ColumnProps) {
  // Input is already desc-sorted with joinedAt-asc tiebreak. For asc we
  // re-sort stably so same-count rows preserve the lobby-order tiebreak.
  const sorted = useMemo(() => {
    if (order === "desc") return entries;
    return [...entries].sort((a, b) => a.count - b.count);
  }, [entries, order]);

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
          sorted.map((e, i) => (
            <Row key={e.id} entry={e} rank={i + 1} order={order} encounters={encounters?.[e.id]} />
          ))
        )}
      </ol>
    </div>
  );
}

function Row({
  entry,
  rank,
  order,
  encounters,
}: {
  entry: RankedEntry;
  rank: number;
  order: SortOrder;
  encounters: number | undefined;
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
      <span className="shrink-0 tabular-nums text-[var(--primary)]">
        {entry.count}
        {encounters !== undefined && encounters > 0 && (
          <span className="ml-1 text-[0.55em] font-bold tracking-wide text-muted-foreground">
            ·{encounters}人
          </span>
        )}
      </span>
    </li>
  );
}
