import { Button } from "@qr-relay/ui/button";
import { useEffect, useState } from "react";
import { type Clock, type TimerId, systemClock } from "../lib/clock.js";

type Props = {
  closeAt: number;
  onContinue: () => void;
  /** Injectable for tests. Defaults to systemClock. */
  clock?: Clock;
};

function formatRemaining(ms: number): string {
  const safe = Math.max(0, Math.ceil(ms / 1_000));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Modal shown while the server has flagged the room as inactive. Counts down
 * "あと M:SS" until `closeAt`; the "継続する" button sends a `keepalive` so the
 * server resets its timer. A successful scan in another component also clears
 * the warning via `inactivity-cleared` from the server.
 */
export function InactivityOverlay({ closeAt, onContinue, clock = systemClock }: Props) {
  const [remainingMs, setRemainingMs] = useState(() => closeAt - clock.now());

  useEffect(() => {
    let cancelled = false;
    let timerId: TimerId | null = null;
    const tick = () => {
      if (cancelled) return;
      setRemainingMs(closeAt - clock.now());
      timerId = clock.setTimeout(tick, 1_000);
    };
    setRemainingMs(closeAt - clock.now());
    timerId = clock.setTimeout(tick, 1_000);
    return () => {
      cancelled = true;
      if (timerId !== null) clock.clearTimeout(timerId);
    };
  }, [closeAt, clock]);

  return (
    <div
      // biome-ignore lint/a11y/useSemanticElements: <dialog> auto-handles focus/escape but takes over
      //   the top layer and inert backdrop, which conflicts with the live game UI underneath.
      role="dialog"
      aria-modal="true"
      aria-labelledby="inactivity-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
    >
      <div className="w-full max-w-sm rounded-[var(--radius-md)] bg-card p-6 text-card-foreground shadow-[var(--shadow-cta-primary)]">
        <h2 id="inactivity-title" className="text-lg font-extrabold tracking-tight">
          ルームが無操作です
        </h2>
        <p
          className="mt-3 text-3xl font-extrabold tabular-nums"
          aria-live="polite"
          aria-atomic="true"
        >
          あと {formatRemaining(remainingMs)}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          シェイクやボタン操作でルームを維持できます
        </p>
        <Button type="button" variant="primary" size="cta" className="mt-5" onClick={onContinue}>
          継続する
        </Button>
      </div>
    </div>
  );
}
