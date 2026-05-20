import type { Phase } from "@qr-relay/core";
import { Button } from "@qr-relay/ui/button";
import { cn } from "@qr-relay/ui/cn";

type Props = {
  code: string;
  phase: Phase;
  connected: boolean;
  inactivityCloseAt: number | null;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
  onDisconnectObserver: () => void;
  onReconnectObserver: () => void;
};

const PHASE_LABEL: Record<Phase["kind"], string> = {
  ready: "READY",
  running: "RUNNING",
  paused: "PAUSED",
};

export function RoomControl({
  code,
  phase,
  connected,
  inactivityCloseAt,
  onStart,
  onPause,
  onResume,
  onReset,
  onDisconnectObserver,
  onReconnectObserver,
}: Props) {
  return (
    <section className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-border bg-card p-3">
      <header className="flex items-center justify-between gap-2">
        <h3 className="m-0 text-sm font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
          room control
        </h3>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-[12px] font-bold uppercase tracking-[0.1em]",
            phase.kind === "running"
              ? "bg-secondary/30 text-secondary-foreground"
              : phase.kind === "paused"
                ? "bg-amber-500/20 text-amber-600 dark:text-amber-200"
                : "bg-muted/40 text-foreground",
          )}
        >
          {PHASE_LABEL[phase.kind]}
        </span>
      </header>
      <div className="flex items-baseline gap-2">
        <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">code</span>
        <span className="font-mono text-base font-extrabold tracking-[0.16em]">{code}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          variant="primary"
          size="pill"
          onClick={onStart}
          disabled={phase.kind === "running"}
        >
          start
        </Button>
        <Button
          type="button"
          variant="outline"
          size="pill"
          onClick={onPause}
          disabled={phase.kind !== "running"}
        >
          pause
        </Button>
        <Button
          type="button"
          variant="outline"
          size="pill"
          onClick={onResume}
          disabled={phase.kind !== "paused"}
        >
          resume
        </Button>
        <Button type="button" variant="outline" size="pill" onClick={onReset}>
          reset
        </Button>
      </div>
      <hr className="my-1 border-border/40" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[12px]">
          <span
            className={cn(
              "size-2 rounded-full",
              connected ? "bg-secondary" : "bg-destructive animate-pulse",
            )}
            aria-hidden
          />
          <span className="font-bold">observer WS:</span>
          <span className="text-muted-foreground">{connected ? "OPEN" : "DISCONNECTED"}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button type="button" variant="outline" size="pill" onClick={onDisconnectObserver}>
            ws 切断
          </Button>
          <Button type="button" variant="outline" size="pill" onClick={onReconnectObserver}>
            ws 再接続
          </Button>
        </div>
      </div>
      {inactivityCloseAt !== null && (
        <p className="m-0 rounded bg-destructive/15 px-2 py-1 text-[12px] font-bold text-destructive">
          inactivity warning — closes at {new Date(inactivityCloseAt).toISOString().slice(11, 19)}
        </p>
      )}
    </section>
  );
}
