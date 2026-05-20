import { cn } from "@qr-relay/ui/cn";
import { ScanLine, Target } from "lucide-react";
import type { RankedEntry, Rankings } from "../../lib/host-view.js";

type Props = {
  rankings: Rankings;
};

/**
 * Two-column ranking board: scan-out (how many scans each player initiated)
 * and scan-in (how many times each player was the target). Pure presentational;
 * counts come from `rankings()` in host-view.ts.
 *
 * Lists are intentionally exhaustive — every player is shown, even with count
 * zero, so the host can see who hasn't engaged. Top N are visually highlighted
 * by font size; the tail compresses.
 */
export function RankingsTile({ rankings }: Props) {
  return (
    <section
      aria-label="スキャンランキング"
      className={cn(
        "flex h-full min-h-0 flex-col gap-3 rounded-[var(--radius-lg)]",
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
        />
        <Column
          title="SCAN IN"
          subtitle="スキャンされた数"
          icon={<Target aria-hidden size={16} />}
          entries={rankings.scanIn}
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
};

function Column({ title, subtitle, icon, entries }: ColumnProps) {
  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-[12px] font-extrabold uppercase tracking-[0.2em]">{title}</span>
        <span className="text-[10px] font-bold tracking-wide opacity-60">{subtitle}</span>
      </div>
      <ol className="m-0 flex min-h-0 flex-col gap-1 overflow-hidden p-0">
        {entries.length === 0 ? (
          <li className="text-[clamp(14px,1.6vw,20px)] font-bold text-muted-foreground">
            参加者なし
          </li>
        ) : (
          entries.map((e, i) => <Row key={e.id} entry={e} rank={i + 1} />)
        )}
      </ol>
    </div>
  );
}

function Row({ entry, rank }: { entry: RankedEntry; rank: number }) {
  const isTop = rank <= 3 && entry.count > 0;
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
      <span className="shrink-0 tabular-nums text-[var(--primary)]">{entry.count}</span>
    </li>
  );
}
