import { useEffect, useState } from "react";
import { HeroTile } from "../components/host/HeroTile.js";
import { JoinQrTile } from "../components/host/JoinQrTile.js";
import { LastScanTicker } from "../components/host/LastScanTicker.js";
import {
  type OperatorPending,
  OperatorStrip,
} from "../components/host/OperatorStrip.js";
import { PlayerBoardTile } from "../components/host/PlayerBoardTile.js";
import { StopwatchTile } from "../components/host/StopwatchTile.js";
import { pauseRoom, resetRoom, resumeRoom, startRoom } from "../lib/api.js";
import { type HostHeroView, pickHostHeroView } from "../lib/host-view.js";
import { displayMs } from "../lib/ws-store.js";
import { useWs } from "../lib/ws.js";

const RESET_CONFIRM_TIMEOUT_MS = 4000;

type Props = { code: string };

/**
 * Stage register dashboard. Wraps the six tile components in a CSS grid
 * whose `grid-template-areas` swaps per HostHeroView so each preset's
 * dominant signal gets the most real estate (baton = giant holder name,
 * infection = X / N + roster, score = full ranking + leader badge).
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
  const layoutKind = view.kind;

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
      <div style={areaStyle("board")} className="min-h-0">
        <PlayerBoardTile view={view} players={players} />
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

/**
 * Per-view-kind grid templates. Each is 12 cols × 10 rows, sized to the
 * dashboard's `100dvh`-bounded flex container so no tile gets internal
 * scroll. Row heights are equal fractions; column widths bias toward the
 * dominant tile of each preset.
 */
const layoutStyles: Record<HostHeroView["kind"], React.CSSProperties> = {
  "token-single": {
    gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
    gridTemplateRows: "repeat(10, minmax(0, 1fr))",
    gridTemplateAreas: `
      "hero hero hero hero hero hero hero hero board board board board"
      "hero hero hero hero hero hero hero hero board board board board"
      "hero hero hero hero hero hero hero hero board board board board"
      "hero hero hero hero hero hero hero hero board board board board"
      "hero hero hero hero hero hero hero hero board board board board"
      "hero hero hero hero hero hero hero hero board board board board"
      "ticker ticker ticker ticker ticker ticker ticker ticker board board board board"
      "clock clock clock clock qr qr qr qr board board board board"
      "clock clock clock clock qr qr qr qr board board board board"
      "op op op op op op op op op op op op"
    `,
  },
  "token-many": {
    gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
    gridTemplateRows: "repeat(10, minmax(0, 1fr))",
    gridTemplateAreas: `
      "hero hero hero hero hero hero board board board board board board"
      "hero hero hero hero hero hero board board board board board board"
      "hero hero hero hero hero hero board board board board board board"
      "hero hero hero hero hero hero board board board board board board"
      "hero hero hero hero hero hero board board board board board board"
      "hero hero hero hero hero hero board board board board board board"
      "ticker ticker ticker ticker ticker ticker ticker ticker ticker ticker ticker ticker"
      "clock clock clock qr qr qr board board board board board board"
      "clock clock clock qr qr qr board board board board board board"
      "op op op op op op op op op op op op"
    `,
  },
  "score-leader": {
    gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
    gridTemplateRows: "repeat(10, minmax(0, 1fr))",
    gridTemplateAreas: `
      "board board board board board board board board hero hero hero hero"
      "board board board board board board board board hero hero hero hero"
      "board board board board board board board board hero hero hero hero"
      "board board board board board board board board hero hero hero hero"
      "board board board board board board board board clock clock clock clock"
      "board board board board board board board board clock clock clock clock"
      "board board board board board board board board qr qr qr qr"
      "board board board board board board board board qr qr qr qr"
      "ticker ticker ticker ticker ticker ticker ticker ticker qr qr qr qr"
      "op op op op op op op op op op op op"
    `,
  },
  waiting: {
    gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
    gridTemplateRows: "repeat(10, minmax(0, 1fr))",
    gridTemplateAreas: `
      "hero hero hero hero qr qr qr qr qr qr qr qr"
      "hero hero hero hero qr qr qr qr qr qr qr qr"
      "hero hero hero hero qr qr qr qr qr qr qr qr"
      "hero hero hero hero qr qr qr qr qr qr qr qr"
      "hero hero hero hero qr qr qr qr qr qr qr qr"
      "hero hero hero hero qr qr qr qr qr qr qr qr"
      "board board board board qr qr qr qr qr qr qr qr"
      "board board board board qr qr qr qr qr qr qr qr"
      "clock clock clock clock ticker ticker ticker ticker ticker ticker ticker ticker"
      "op op op op op op op op op op op op"
    `,
  },
};
