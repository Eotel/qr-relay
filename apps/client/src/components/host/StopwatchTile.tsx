import type { Phase } from "@qr-relay/core";
import { cn } from "@qr-relay/ui/cn";

type Props = {
  phase: Phase;
  elapsedMs: number;
};

export function formatStopwatch(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const PHASE_LABEL: Record<Phase["kind"], string> = {
  ready: "待機中",
  running: "進行中",
  paused: "一時停止中",
};

/**
 * Giant clock for the stage. Parent owns the tick driver (so the rest of the
 * dashboard doesn't re-render every 250ms unnecessarily).
 */
export function StopwatchTile({ phase, elapsedMs }: Props) {
  return (
    <section
      aria-label="ストップウォッチ"
      className={cn(
        "flex h-full min-h-0 flex-col items-center justify-center gap-1 rounded-[var(--radius-lg)]",
        "border border-white/10 bg-white/[0.04] p-4",
      )}
    >
      <span className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-muted-foreground">
        STOPWATCH
      </span>
      <strong
        aria-live="polite"
        className="font-mono text-[clamp(32px,5vw,96px)] font-black leading-none tabular-nums tracking-tight"
      >
        {formatStopwatch(elapsedMs)}
      </strong>
      <span
        className={cn(
          "text-[12px] font-extrabold uppercase tracking-[0.18em]",
          phase.kind === "running"
            ? "text-secondary"
            : phase.kind === "paused"
              ? "text-destructive"
              : "text-muted-foreground",
        )}
      >
        {PHASE_LABEL[phase.kind]}
      </span>
    </section>
  );
}
