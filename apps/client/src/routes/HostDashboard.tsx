import { useEffect, useMemo, useState } from "react";
import { HeroTile } from "../components/host/HeroTile.js";
import { InfectionGridTile } from "../components/host/InfectionGridTile.js";
import { JoinQrTile } from "../components/host/JoinQrTile.js";
import { LastScanTicker } from "../components/host/LastScanTicker.js";
import { type OperatorPending, OperatorStrip } from "../components/host/OperatorStrip.js";
import { ParticipantListTile } from "../components/host/ParticipantListTile.js";
import { RankingsTile } from "../components/host/RankingsTile.js";
import { StopwatchTile } from "../components/host/StopwatchTile.js";
import { TokenPathTile } from "../components/host/TokenPathTile.js";
import { type HostViewMode, ViewSwitcher } from "../components/host/ViewSwitcher.js";
import { pauseRoom, resetRoom, resumeRoom, startRoom } from "../lib/api.js";
import { pickHostHeroView, rankings, tokenPathChain } from "../lib/host-view.js";
import { displayMs } from "../lib/ws-store.js";
import { useWs } from "../lib/ws.js";

const RESET_CONFIRM_TIMEOUT_MS = 4000;

type Props = { code: string };

/**
 * Stage register dashboard with a top view switcher. Five modes share the
 * same shell: `overview` mirrors the original waiting/play composite, and
 * the four focus modes (rankings / token-path / infection / participants)
 * give one metric the whole canvas. Pause just freezes data — modes never
 * auto-swap; that stays a host decision.
 *
 * Every tile is mounted on every mode (hidden via `display: none` when
 * inactive) so switching is purely a CSS template change. That keeps the
 * LastScanTicker pulse and the QR canvas alive across switches and avoids
 * the flash you'd get from a remount.
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

  const [mode, setMode] = useState<HostViewMode>("overview");
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
  const overviewKind: OverviewKind = view.kind === "waiting" ? "waiting" : "play";
  const layoutKey: LayoutKey = mode === "overview" ? `overview-${overviewKind}` : `focus-${mode}`;

  const rankingsData = useMemo(() => rankings(state, players), [state, players]);
  const chain = useMemo(() => tokenPathChain(state, players), [state, players]);

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
      data-mode={mode}
      data-layout={layoutKey}
      className="grid min-h-0 flex-1 gap-3"
      style={layoutStyles[layoutKey]}
    >
      <Cell area="switcher" visible>
        <ViewSwitcher mode={mode} onChange={setMode} />
      </Cell>
      <Cell area="hero" visible={mode === "overview"}>
        <HeroTile view={view} roomCode={code} />
      </Cell>
      <Cell area="ticker" visible={mode === "overview"}>
        <LastScanTicker event={lastScanEvent} players={players} />
      </Cell>
      <Cell area="qr" visible={mode === "overview"}>
        <JoinQrTile code={code} variant={overviewKind === "waiting" ? "featured" : "compact"} />
      </Cell>
      <Cell area="rankings" visible={mode === "rankings"}>
        <RankingsTile rankings={rankingsData} />
      </Cell>
      <Cell area="path" visible={mode === "token-path"}>
        <TokenPathTile chain={chain} />
      </Cell>
      <Cell area="infection" visible={mode === "infection"}>
        <InfectionGridTile players={players} state={state} />
      </Cell>
      <Cell area="participants" visible={mode === "participants"}>
        <ParticipantListTile players={players} />
      </Cell>
      <Cell area="clock" visible>
        <StopwatchTile phase={phase} elapsedMs={elapsed} />
      </Cell>
      <Cell area="op" visible>
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
      </Cell>
    </section>
  );
}

function Cell({
  area,
  visible,
  children,
}: { area: string; visible: boolean; children: React.ReactNode }) {
  return (
    <div
      id={`host-view-${area}`}
      style={visible ? { gridArea: area } : { display: "none" }}
      className="min-h-0"
      aria-hidden={!visible}
    >
      {children}
    </div>
  );
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

type OverviewKind = "waiting" | "play";
type LayoutKey =
  | "overview-waiting"
  | "overview-play"
  | "focus-rankings"
  | "focus-token-path"
  | "focus-infection"
  | "focus-participants";

/**
 * Six grid templates. The two overview variants mirror the pre-switcher
 * layout (waiting features the QR, play hands the hero full width). The four
 * focus templates give one metric tile the whole canvas, with switcher at
 * the top and stopwatch + operator strip pinned to the bottom band so the
 * host never loses access to start/pause/reset regardless of mode.
 *
 * `auto repeat(10, minmax(0, 1fr))` keeps the switcher row compact while the
 * remaining 10 rows stay flex-equal under the dashboard's `h-dvh` container.
 */
const layoutStyles: Record<LayoutKey, React.CSSProperties> = {
  "overview-waiting": {
    gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
    gridTemplateRows: "auto repeat(10, minmax(0, 1fr))",
    gridTemplateAreas: `
      "switcher switcher switcher switcher switcher switcher switcher switcher switcher switcher switcher switcher"
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
  "overview-play": {
    gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
    gridTemplateRows: "auto repeat(10, minmax(0, 1fr))",
    gridTemplateAreas: `
      "switcher switcher switcher switcher switcher switcher switcher switcher switcher switcher switcher switcher"
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
  "focus-rankings": focusLayout("rankings"),
  "focus-token-path": focusLayout("path"),
  "focus-infection": focusLayout("infection"),
  "focus-participants": focusLayout("participants"),
};

function focusLayout(area: string): React.CSSProperties {
  const main = Array(12).fill(area).join(" ");
  const clock = Array(12).fill("clock").join(" ");
  const op = Array(12).fill("op").join(" ");
  const switcher = Array(12).fill("switcher").join(" ");
  return {
    gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
    gridTemplateRows: "auto repeat(10, minmax(0, 1fr))",
    gridTemplateAreas: `
      "${switcher}"
      "${main}"
      "${main}"
      "${main}"
      "${main}"
      "${main}"
      "${main}"
      "${main}"
      "${main}"
      "${clock}"
      "${op}"
    `,
  };
}
