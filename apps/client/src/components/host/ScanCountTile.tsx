import { cn } from "@qr-relay/ui/cn";

type Props = {
  totalScans: number;
};

/**
 * Cumulative scan counter (server-pushed `総スキャン数` metric). Stage-side
 * "how much has happened so far" reading; orthogonal to the StopwatchTile
 * (elapsed time) and the LastScanTicker (most recent event).
 */
export function ScanCountTile({ totalScans }: Props) {
  return (
    <section
      aria-label="総スキャン数"
      className={cn(
        "flex h-full min-h-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-[var(--radius-lg)]",
        "border border-white/10 bg-white/[0.04] p-4",
      )}
    >
      <span className="text-[11px] font-extrabold tracking-[0.18em] text-muted-foreground">
        総スキャン数
      </span>
      <strong
        aria-live="polite"
        className="font-mono text-[clamp(28px,min(4vw,10vh),88px)] font-black leading-none tabular-nums tracking-tight"
      >
        {totalScans}
      </strong>
    </section>
  );
}
