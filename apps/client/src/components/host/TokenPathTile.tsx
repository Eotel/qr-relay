import { cn } from "@qr-relay/ui/cn";
import { ArrowRight, GitBranch } from "lucide-react";
import { memo } from "react";
import type { TokenPathStep } from "../../lib/host-view.js";

type Props = {
  chain: TokenPathStep[];
  /** Newest N steps kept fully visible; older ones fade. Defaults to 20. */
  visibleSteps?: number;
};

/**
 * Vertical chain of "scanner → scanned" rows in time order (oldest at top,
 * newest at bottom). Pure presentational. The plan deliberately picks plain
 * text over a graph: stage-register 6 m readability + zero library deps.
 *
 * Older rows past `visibleSteps` fade so the latest moves stay prominent —
 * the host (and the audience) cares about *what just happened* more than
 * the full history.
 */
export const TokenPathTile = memo(function TokenPathTile({ chain, visibleSteps = 20 }: Props) {
  const hiddenCount = Math.max(0, chain.length - visibleSteps);
  const visible = chain.slice(hiddenCount);

  return (
    <section
      aria-label="スキャン経路"
      className={cn(
        "flex h-full min-h-0 flex-col gap-3 overflow-hidden rounded-[var(--radius-lg)]",
        "border border-white/10 bg-white/[0.04] p-5",
      )}
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        <GitBranch aria-hidden size={16} />
        <span className="text-[11px] font-extrabold uppercase tracking-[0.22em]">PATH</span>
        {chain.length > 0 && (
          <span className="text-[10px] font-bold tabular-nums tracking-wide opacity-60">
            {chain.length} steps
          </span>
        )}
      </div>

      {chain.length === 0 ? (
        <p className="m-0 flex flex-1 items-center justify-center text-[clamp(16px,2vw,24px)] font-bold text-muted-foreground">
          まだスキャンはありません
        </p>
      ) : (
        <ol className="m-0 flex min-h-0 flex-1 flex-col gap-1 overflow-hidden p-0">
          {hiddenCount > 0 && (
            <li className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground opacity-70">
              … 過去 {hiddenCount} 件は省略
            </li>
          )}
          {visible.map((step, i) => {
            const isNewest = i === visible.length - 1;
            return (
              <li
                key={`${step.ts}-${step.scannerId}-${step.scannedId}`}
                className={cn(
                  "flex items-baseline gap-3",
                  isNewest
                    ? "text-[clamp(20px,2.8vw,40px)] font-black"
                    : "text-[clamp(14px,1.6vw,22px)] font-bold opacity-80",
                )}
              >
                <span className="min-w-0 flex-1 truncate text-right">{step.scannerName}</span>
                <ArrowRight
                  aria-hidden
                  size={isNewest ? 24 : 16}
                  className="shrink-0 text-[var(--primary)]"
                />
                <span className="min-w-0 flex-1 truncate">{step.scannedName}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
});
