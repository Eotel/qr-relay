import { cn } from "@qr-relay/ui/cn";
import { ArrowDown, ScanLine } from "lucide-react";
import type { PlayerLite, ScanEvent } from "../../lib/ws-store.js";

type Props = {
  event: ScanEvent | null;
  players: PlayerLite[];
};

/**
 * Vertical "from → to" banner. Stacks the scanner and the scanned name on
 * separate rows so long Japanese names never get truncated. Pure: the
 * dashboard owns subscription; this just renders.
 */
export function LastScanTicker({ event, players }: Props) {
  const lookup = (id: string) => players.find((p) => p.id === id)?.name ?? id;

  return (
    <section
      aria-label="直前のスキャン"
      aria-live="polite"
      className={cn(
        "flex h-full min-h-0 items-center gap-2 overflow-hidden rounded-[var(--radius-lg)]",
        "border border-white/10 bg-white/[0.04] px-3 py-2",
      )}
    >
      <ScanLine aria-hidden size={18} className="shrink-0 self-start text-muted-foreground" />
      {event ? (
        <div
          key={event.ts}
          className="hero-pulse flex min-w-0 flex-1 flex-col items-start gap-1 text-[clamp(18px,2.2vw,32px)] font-black leading-tight"
        >
          <span className="min-w-0 max-w-full break-words">{lookup(event.scannerId)}</span>
          <ArrowDown aria-hidden size={20} className="shrink-0 text-[var(--primary)]" />
          <span className="min-w-0 max-w-full break-words">{lookup(event.scannedId)}</span>
        </div>
      ) : (
        <span className="text-[clamp(16px,1.8vw,22px)] font-bold text-muted-foreground">
          まだスキャンはありません
        </span>
      )}
    </section>
  );
}
