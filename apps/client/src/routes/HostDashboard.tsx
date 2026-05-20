import { useEffect, useState } from "react";
import { HeroTile } from "../components/host/HeroTile.js";
import { JoinQrTile } from "../components/host/JoinQrTile.js";
import { LastScanTicker } from "../components/host/LastScanTicker.js";
import { type OperatorPending, OperatorStrip } from "../components/host/OperatorStrip.js";
import { StopwatchTile } from "../components/host/StopwatchTile.js";
import { pauseRoom, resetRoom, resumeRoom, startRoom } from "../lib/api.js";
import { pickHostHeroView } from "../lib/host-view.js";
import { displayMs } from "../lib/ws-store.js";
import { useWs } from "../lib/ws.js";

const RESET_CONFIRM_TIMEOUT_MS = 4000;

type Props = { code: string };

/**
 * Stage register dashboard. Five tiles in a CSS grid: hero (preset-aware
 * dominant cell), ticker (last scan), stopwatch, QR, and the operator strip
 * at the bottom edge.
 *
 * Two layouts, picked by hero view kind: `waiting` (hero + featured QR side
 * by side, ticker/clock collapsed) and `play` (hero spans full width, with
 * ticker/clock/qr-compact in a thin bottom band). ADR-0005 supersedes
 * ADR-0004 §Decision 4 — the per-player roster grid was dropped because
 * playing the audience is physically too far to read 6m+ name cards, and
 * the room code + player-count chip already covers the "did I join?"
 * reassurance need.
 *
 * Owns all live store subscriptions, the stopwatch tick driver, and the
 * host-side action callbacks. Tiles below are pure props in / DOM out.
 */
export function HostDashboard({ code }: Props) {
  const players = useWs((s) => s.players);
  const phase = useWs((s) => s.phase);
  const state = useWs((s) => s.state);
  const room = useWs((s) => s.room);
  const lastScanEvent = useWs((s) => s.lastScanEvent);

  const [pending, setPending] = useState<OperatorPending>(null);
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

  const view = pickHostHeroView({
    phase,
    state,
    players,
    rule: room?.handlerConfig,
  });
  const layoutKind: LayoutKind = view.kind === "waiting" ? "waiting" : "play";

  const run = async (kind: Exclude<OperatorPending, null>, action: () => Promise<void>) => {
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

  return (
    <section
      data-layout={layoutKind}
      className="grid min-h-0 flex-1 gap-3"
      style={layoutStyles[layoutKind]}
    >
      <div style={areaStyle("hero")} className="min-h-0">
        <HeroTile view={view} roomCode={code} />
      </div>
      <div style={areaStyle("ticker")} className="min-h-0">
        <LastScanTicker event={lastScanEvent} players={players} />
      </div>
      <div style={areaStyle("clock")} className="min-h-0">
        <StopwatchTile phase={phase} elapsedMs={elapsed} />
      </div>
      <div style={areaStyle("qr")} className="min-h-0">
        <JoinQrTile code={code} variant={layoutKind === "waiting" ? "featured" : "compact"} />
      </div>
      <div style={areaStyle("op")} className="min-h-0">
        <OperatorStrip
          phase={phase}
          pending={pending}
          resetArmed={resetArmed}
          actionError={actionError}
          onStart={onStart}
          onPause={onPause}
          onResume={onResume}
          onReset={onReset}
        />
      </div>
    </section>
  );
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function areaStyle(name: string): React.CSSProperties {
  return { gridArea: name };
}

type LayoutKind = "waiting" | "play";

/**
 * Two grid templates only — `waiting` (QR is featured, hero shows room code +
 * 人数) and `play` (hero spans full width, supporting tiles in a thin band
 * along the bottom). Both are 12 cols × 10 rows, sized to the dashboard's
 * `h-dvh`-bounded flex container so no tile gets internal scroll.
 */
const layoutStyles: Record<LayoutKind, React.CSSProperties> = {
  waiting: {
    gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
    gridTemplateRows: "repeat(10, minmax(0, 1fr))",
    gridTemplateAreas: `
      "hero hero hero hero hero hero qr qr qr qr qr qr"
      "hero hero hero hero hero hero qr qr qr qr qr qr"
      "hero hero hero hero hero hero qr qr qr qr qr qr"
      "hero hero hero hero hero hero qr qr qr qr qr qr"
      "hero hero hero hero hero hero qr qr qr qr qr qr"
      "hero hero hero hero hero hero qr qr qr qr qr qr"
      "hero hero hero hero hero hero qr qr qr qr qr qr"
      "ticker ticker ticker clock clock clock qr qr qr qr qr qr"
      "ticker ticker ticker clock clock clock qr qr qr qr qr qr"
      "op op op op op op op op op op op op"
    `,
  },
  play: {
    gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
    gridTemplateRows: "repeat(10, minmax(0, 1fr))",
    gridTemplateAreas: `
      "hero hero hero hero hero hero hero hero hero hero hero hero"
      "hero hero hero hero hero hero hero hero hero hero hero hero"
      "hero hero hero hero hero hero hero hero hero hero hero hero"
      "hero hero hero hero hero hero hero hero hero hero hero hero"
      "hero hero hero hero hero hero hero hero hero hero hero hero"
      "hero hero hero hero hero hero hero hero hero hero hero hero"
      "hero hero hero hero hero hero hero hero hero hero hero hero"
      "ticker ticker ticker ticker ticker ticker clock clock clock clock qr qr"
      "ticker ticker ticker ticker ticker ticker clock clock clock clock qr qr"
      "op op op op op op op op op op op op"
    `,
  },
};
