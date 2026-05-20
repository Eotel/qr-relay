import { useEffect, useMemo, useRef, useState } from "react";
import { HeroTile } from "../components/host/HeroTile.js";
import { InfectionGridTile } from "../components/host/InfectionGridTile.js";
import { JoinQrTile } from "../components/host/JoinQrTile.js";
import { LastScanTicker } from "../components/host/LastScanTicker.js";
import { ParticipantListTile } from "../components/host/ParticipantListTile.js";
import { RankingsTile } from "../components/host/RankingsTile.js";
import { StopwatchTile } from "../components/host/StopwatchTile.js";
import { TokenPathTile } from "../components/host/TokenPathTile.js";
import { type HostViewMode, ViewSwitcher } from "../components/host/ViewSwitcher.js";
import {
  encounterCounts,
  pickHostHeroView,
  rankings,
  recentThroughput,
  tokenPathChain,
} from "../lib/host-view.js";
import { displayMs } from "../lib/ws-store.js";
import { useWs } from "../lib/ws.js";

const THROUGHPUT_WINDOW_MS = 60_000;

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
 * Owns the live store subscriptions and the stopwatch tick driver. Host
 * operator controls (start/pause/resume/reset) live in `RoomLayout`'s
 * header instead of a footer band, so the dashboard's vertical budget
 * goes entirely to content.
 */
export function HostDashboard({ code }: Props) {
  const players = useWs((s) => s.players);
  const phase = useWs((s) => s.phase);
  const state = useWs((s) => s.state);
  const room = useWs((s) => s.room);
  const lastScanEvent = useWs((s) => s.lastScanEvent);

  const [mode, setMode] = useState<HostViewMode>("overview");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (phase.kind !== "running") return;
    const id = window.setInterval(() => setTick((t) => t + 1), 250);
    return () => window.clearInterval(id);
  }, [phase.kind]);

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
  const encounters = useMemo(() => encounterCounts(state, players), [state, players]);
  const chain = useMemo(() => tokenPathChain(state, players), [state, players]);

  // Throughput re-computes on every tick while running; pause/ready keep the
  // last running value so the host sees what just happened, not a slow drift
  // to 0 as history ages out of the 60s window. Reset (→ ready) zeroes it.
  const lastThroughputRef = useRef(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick drives Date.now() recompute
  const throughput = useMemo<number>(() => {
    if (phase.kind === "running") {
      const v = recentThroughput(state, Date.now(), THROUGHPUT_WINDOW_MS);
      lastThroughputRef.current = v;
      return v;
    }
    if (phase.kind === "ready") {
      lastThroughputRef.current = 0;
      return 0;
    }
    return lastThroughputRef.current;
  }, [phase.kind, state, tick]);

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
        <RankingsTile rankings={rankingsData} encounters={encounters} />
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
        <StopwatchTile phase={phase} elapsedMs={elapsed} throughput={throughput} />
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
 * layout (waiting features the QR, play hands the hero full width). The
 * four focus templates give one metric tile the whole canvas. Operator
 * controls (start/pause/resume/reset) now live in the layout header, so
 * the dashboard's vertical budget belongs entirely to content.
 *
 * Overview rows: `auto repeat(9, minmax(0, 1fr))` — switcher (auto) +
 * 9 flex rows (7 hero + 2 ticker/clock).
 *
 * Focus rows: `auto repeat(8, minmax(0, 1fr)) auto` — the trailing `auto`
 * lets the stopwatch sit at its natural content height instead of being
 * crushed into a 1/9-fr sliver that clipped digits and labels.
 */
const layoutStyles: Record<LayoutKey, React.CSSProperties> = {
  "overview-waiting": {
    gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
    gridTemplateRows: "auto repeat(9, minmax(0, 1fr))",
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
    `,
  },
  "overview-play": {
    gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
    gridTemplateRows: "auto repeat(9, minmax(0, 1fr))",
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
  const switcher = Array(12).fill("switcher").join(" ");
  return {
    gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
    gridTemplateRows: "auto repeat(8, minmax(0, 1fr)) auto",
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
    `,
  };
}
