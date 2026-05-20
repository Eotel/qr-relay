import type { Phase } from "@qr-relay/core";
import { Button } from "@qr-relay/ui/button";
import { cn } from "@qr-relay/ui/cn";
import { Pause, Play, RefreshCw } from "lucide-react";

export type OperatorPending = null | "start" | "pause" | "resume" | "reset";

type Props = {
  phase: Phase;
  pending: OperatorPending;
  resetArmed: boolean;
  actionError: string | null;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
};

/**
 * Thin strip of host controls along the dashboard's bottom edge. Lives at
 * the periphery on purpose: the stage register's hero is the game state,
 * not the operator buttons.
 */
export function OperatorStrip({
  phase,
  pending,
  resetArmed,
  actionError,
  onStart,
  onPause,
  onResume,
  onReset,
}: Props) {
  const primary = primaryAction(phase, pending, { onStart, onPause, onResume });

  return (
    <div
      className={cn(
        "flex h-full min-h-0 items-center gap-2 rounded-[var(--radius-md)] border border-white/10 bg-white/[0.03] px-3",
      )}
    >
      {actionError && (
        <div
          role="alert"
          className="mr-2 truncate rounded-[var(--radius-md)] border border-destructive/40 bg-destructive/10 px-2.5 py-1 text-xs font-bold text-destructive"
        >
          {actionError}
        </div>
      )}
      <div className="ml-auto flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="submit"
          onClick={onReset}
          disabled={pending !== null}
          aria-busy={pending === "reset"}
          aria-live="polite"
          className={cn(
            "h-9 px-3 text-xs",
            resetArmed && "border-destructive text-destructive hover:bg-destructive/10",
          )}
        >
          <RefreshCw size={14} />
          <span>
            {pending === "reset" ? "リセット中…" : resetArmed ? "もう一度押して初期化" : "リセット"}
          </span>
        </Button>
        <Button
          type="button"
          variant="primary"
          size="submit"
          onClick={primary.onClick}
          disabled={pending !== null}
          aria-busy={primary.busy}
          aria-live="polite"
          className="h-9 px-3 text-xs"
        >
          <primary.Icon size={14} />
          <span>{primary.label}</span>
        </Button>
      </div>
    </div>
  );
}

function primaryAction(
  phase: Phase,
  pending: OperatorPending,
  callbacks: { onStart: () => void; onPause: () => void; onResume: () => void },
) {
  if (phase.kind === "running") {
    return {
      label: pending === "pause" ? "一時停止中…" : "一時停止",
      Icon: Pause,
      onClick: callbacks.onPause,
      busy: pending === "pause",
    };
  }
  if (phase.kind === "paused") {
    return {
      label: pending === "resume" ? "再開中…" : "再開",
      Icon: Play,
      onClick: callbacks.onResume,
      busy: pending === "resume",
    };
  }
  return {
    label: pending === "start" ? "起動中…" : "スタート",
    Icon: Play,
    onClick: callbacks.onStart,
    busy: pending === "start",
  };
}
