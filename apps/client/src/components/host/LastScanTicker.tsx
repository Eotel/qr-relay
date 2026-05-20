import { cn } from "@qr-relay/ui/cn";
import { ArrowRight, ScanLine } from "lucide-react";
import type { PlayerLite, ScanEvent } from "../../lib/ws-store.js";

type Props = {
  event: ScanEvent | null;
  players: PlayerLite[];
};

/**
 * Horizontal "X scanned Y" banner. Drives audience reaction when something
 * actually happens. Pure: the dashboard owns subscription; this just renders.
 *
 * The pulse key (`data-pulse-key`) is the event timestamp so the parent's
 * shared `.hero-pulse` style scales up briefly only when a new event lands.
 * Reduced-motion users get a static last-row read (CSS handles the gate).
 */
export function LastScanTicker({ event, players }: Props) {
  const lookup = (id: string) => players.find((p) => p.id === id)?.name ?? id;

  return (
    <section
      aria-label="直前のスキャン"
      aria-live="polite"
      className={cn(
        "flex h-full min-h-0 items-center gap-3 rounded-[var(--radius-lg)]",
        "border border-white/10 bg-white/[0.04] px-5 py-3",
      )}
    >
      <ScanLine aria-hidden size={20} className="shrink-0 text-muted-foreground" />
      {event ? (
        <div
          key={event.ts}
          className="hero-pulse flex min-w-0 flex-1 items-center gap-3 text-[clamp(20px,2.6vw,36px)] font-black leading-none"
        >
          <span className="min-w-0 truncate">{lookup(event.scannerId)}</span>
          <ArrowRight aria-hidden size={28} className="shrink-0 text-[var(--primary)]" />
          <span className="min-w-0 truncate">{lookup(event.scannedId)}</span>
        </div>
      ) : (
        <span className="text-[clamp(16px,1.8vw,22px)] font-bold text-muted-foreground">
          まだスキャンはありません
        </span>
      )}
    </section>
  );
}
