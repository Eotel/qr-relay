import { Button } from "@qr-relay/ui/button";
import { Card } from "@qr-relay/ui/card";
import { cn } from "@qr-relay/ui/cn";
import { Pause, Play, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { JoinQrDisplay, joinUrlFor } from "../components/JoinQrDisplay.js";
import { MetricsPanel } from "../components/MetricsPanel.js";
import { ReadyConfigEditor } from "../components/host/ReadyConfigEditor.js";
import { pauseRoom, resetRoom, resumeRoom, startRoom } from "../lib/api.js";
import { displayMs } from "../lib/ws-store.js";
import { useWs } from "../lib/ws.js";
import { HostDashboard } from "./HostDashboard.js";
import type { RoomOutletContext } from "./RoomLayout.js";

const qrFrame =
  "relative flex aspect-square w-full max-w-[420px] items-center justify-center overflow-hidden rounded-[var(--radius-lg)] bg-white shadow-[var(--shadow-card)] dark:shadow-none";

const RESET_CONFIRM_TIMEOUT_MS = 4000;

type Pending = null | "start" | "pause" | "resume" | "reset";

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function formatStopwatch(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Host route. Routes to one of two registers based on viewport width:
 *
 * - `md+` (PC / projector / iPad landscape) → `HostDashboard`, the stage
 *   register optimized for an audience reading from across the room.
 * - `< md` (host on a phone in a pinch) → the original handheld stack,
 *   kept verbatim so the emergency case still works.
 *
 * We pick one branch and mount it — not both behind CSS — so the inactive
 * register doesn't subscribe to the store or run timers. SSR / JSDOM
 * default to handheld (matchMedia missing → false), which keeps existing
 * unit tests anchored to a single tree.
 */
export function HostRoom() {
  const { code, playerId } = useOutletContext<RoomOutletContext>();
  const isDashboard = useDashboardViewport();
  if (isDashboard) return <HostDashboard code={code} playerId={playerId} />;
  return <HostRoomHandheld code={code} playerId={playerId} />;
}

/** Matches Tailwind's `md` breakpoint (768px). */
function useDashboardViewport(): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia("(min-width: 768px)");
    setMatches(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return matches;
}

function HostRoomHandheld({ code, playerId }: { code: string; playerId: string }) {
  const players = useWs((s) => s.players);
  const metrics = useWs((s) => s.metrics);
  const phase = useWs((s) => s.phase);

  const [pending, setPending] = useState<Pending>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [resetArmed, setResetArmed] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (phase.kind !== "running") return;
    const id = window.setInterval(() => setTick((t) => t + 1), 250);
    return () => window.clearInterval(id);
  }, [phase.kind]);

  useEffect(() => {
    if (!resetArmed) return;
    const t = window.setTimeout(() => setResetArmed(false), RESET_CONFIRM_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [resetArmed]);

  void tick;
  const elapsed = displayMs(phase, Date.now());

  const run = async (kind: Exclude<Pending, null>, action: () => Promise<void>) => {
    if (pending) return;
    setActionError(null);
    setResetArmed(false);
    setPending(kind);
    try {
      await action();
    } catch (err) {
      setActionError(`${kind} できませんでした: ${describeError(err)}`);
    } finally {
      setPending(null);
    }
  };

  const onStart = () => run("start", () => startRoom(code));
  const onPause = () => run("pause", () => pauseRoom(code));
  const onResume = () => run("resume", () => resumeRoom(code));
  const onReset = () => {
    if (pending) return;
    if (phase.kind !== "ready" && !resetArmed) {
      setResetArmed(true);
      return;
    }
    void run("reset", () => resetRoom(code));
  };

  const primary = (() => {
    if (phase.kind === "running") {
      return {
        label: pending === "pause" ? "一時停止中…" : "一時停止",
        Icon: Pause,
        onClick: onPause,
        busy: pending === "pause",
      };
    }
    if (phase.kind === "paused") {
      return {
        label: pending === "resume" ? "再開中…" : "再開",
        Icon: Play,
        onClick: onResume,
        busy: pending === "resume",
      };
    }
    return {
      label: pending === "start" ? "起動中…" : "スタート",
      Icon: Play,
      onClick: onStart,
      busy: pending === "start",
    };
  })();

  const phaseLabel =
    phase.kind === "running" ? "進行中" : phase.kind === "paused" ? "一時停止中" : "待機中";

  return (
    <section className="flex flex-1 flex-col gap-4">
      <Card className="flex flex-col items-center gap-2 text-center">
        <span className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">
          STOPWATCH
        </span>
        <strong
          className="font-mono text-[64px] leading-none font-black tabular-nums tracking-tight sm:text-[88px]"
          aria-live="polite"
        >
          {formatStopwatch(elapsed)}
        </strong>
        <span
          className={cn(
            "text-[11px] font-extrabold uppercase tracking-[0.18em]",
            phase.kind === "running"
              ? "text-secondary"
              : phase.kind === "paused"
                ? "text-destructive"
                : "text-muted-foreground",
          )}
        >
          {phaseLabel}
        </span>
      </Card>

      {/* Room code stays visible at every phase so a late joiner can still
          read it across the room. The QR + URL block, however, only earns its
          screen real estate while waiting — once play starts, players hand off
          via the client-side share overlay, and the host's QR would just
          steal density from the score / participants cards. */}
      <Card className="flex flex-col items-center gap-3 text-center">
        <span className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">
          ROOM CODE
        </span>
        <strong className="text-[42px] leading-none font-black tracking-[0.18em] sm:text-[56px]">
          {code}
        </strong>
        {phase.kind === "ready" && (
          <>
            <p className="m-0 text-sm font-bold text-foreground/85">
              このQRをスキャンして参加してください
            </p>
            <div className="flex w-full justify-center">
              <div className={qrFrame}>
                <JoinQrDisplay code={code} />
              </div>
            </div>
            <p className="m-0 break-all text-[11px] font-medium text-foreground/75">
              {joinUrlFor(code)}
            </p>
          </>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="m-0 text-sm font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
            参加者
          </h2>
          <span className="text-xs font-bold text-muted-foreground">{players.length}人</span>
        </div>
        {players.length === 0 ? (
          <p className="m-0 text-sm text-foreground/85">
            まだ誰も参加していません。QR をスキャンしてもらいましょう。
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {players.map((p) => (
              <li
                key={p.id}
                className={cn(
                  "inline-flex items-center rounded-full bg-secondary/15 px-2.5 py-0.5 text-[12px] font-bold text-foreground",
                  "dark:bg-secondary/25",
                )}
              >
                {p.name}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ReadyConfigEditor code={code} playerId={playerId} />

      <Card className="flex flex-col gap-3">
        <h2 className="m-0 text-sm font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
          スコアボード
        </h2>
        {metrics.length === 0 ? (
          <p className="m-0 text-sm text-foreground/85">スタート後にメトリクスが表示されます。</p>
        ) : (
          <MetricsPanel metrics={metrics} players={players} />
        )}
      </Card>

      <div
        className={cn(
          "sticky bottom-0 z-10 mt-2 -mx-3 -mb-[calc(0.75rem+env(safe-area-inset-bottom))]",
          "border-t border-border/40 bg-background/85 px-3 pt-3",
          "pb-[calc(env(safe-area-inset-bottom)+0.75rem)]",
          "backdrop-blur supports-[backdrop-filter]:bg-background/70",
          "dark:border-white/[0.08]",
        )}
      >
        {actionError && (
          <div
            role="alert"
            className={cn(
              "mb-2 rounded-[var(--radius-md)] border border-destructive/40 bg-destructive/10",
              "px-3 py-2 text-sm font-bold text-destructive",
            )}
          >
            {actionError}
          </div>
        )}
        <div className="flex items-center gap-2 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size="submit"
            onClick={onReset}
            disabled={pending !== null}
            aria-busy={pending === "reset"}
            aria-live="polite"
            className={cn(
              "flex-1 sm:w-auto sm:flex-initial",
              resetArmed && "border-destructive text-destructive hover:bg-destructive/10",
            )}
          >
            <RefreshCw size={16} />
            <span>
              {pending === "reset"
                ? "リセット中…"
                : resetArmed
                  ? "もう一度押して初期化"
                  : "リセット"}
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
            className="flex-1 sm:w-auto sm:flex-initial"
          >
            <primary.Icon size={16} />
            <span>{primary.label}</span>
          </Button>
        </div>
      </div>
    </section>
  );
}
