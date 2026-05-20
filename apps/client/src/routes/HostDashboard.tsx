import { useMemo, useState } from "react";
import { HeroTile } from "../components/host/HeroTile.js";
import { InfectionGridTile } from "../components/host/InfectionGridTile.js";
import { JoinQrTile } from "../components/host/JoinQrTile.js";
import { LastScanTicker } from "../components/host/LastScanTicker.js";
import { ParticipantListTile } from "../components/host/ParticipantListTile.js";
import { RankingsTile } from "../components/host/RankingsTile.js";
import { ReadyConfigEditor } from "../components/host/ReadyConfigEditor.js";
import { ScanCountTile } from "../components/host/ScanCountTile.js";
import { StopwatchTileLive } from "../components/host/StopwatchTile.js";
import { TokenPathTile } from "../components/host/TokenPathTile.js";
import { type HostViewMode, ViewSwitcher } from "../components/host/ViewSwitcher.js";
import {
  type Rankings,
  type TokenPathStep,
  encounterCounts,
  inboundEncounterCounts,
  pickHostHeroView,
  rankings,
  summarizeMetricsForHost,
  tokenPathChain,
} from "../lib/host-view.js";
import { useWs } from "../lib/ws.js";

// Stable empty refs so React.memo on hidden focus tiles short-circuits
// re-rendering when their data isn't being computed (mode-gated below).
const EMPTY_RANKINGS: Rankings = { scanOut: [], scanIn: [] };
const EMPTY_ENCOUNTERS: Record<string, number> = {};
const EMPTY_CHAIN: TokenPathStep[] = [];

type Props = { code: string; playerId: string };

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
 * Owns the live store subscriptions. The stopwatch tick lives in
 * `StopwatchTileLive` instead of here so the 250 ms re-renders are
 * scoped to the clock cell and don't cascade through the sibling tiles.
 * Host operator controls (start/pause/resume/reset) live in `RoomLayout`'s
 * header, so the dashboard's vertical budget goes entirely to content.
 */
export function HostDashboard({ code, playerId }: Props) {
  const players = useWs((s) => s.players);
  const phase = useWs((s) => s.phase);
  const state = useWs((s) => s.state);
  const room = useWs((s) => s.room);
  const metrics = useWs((s) => s.metrics);
  const lastScanEvent = useWs((s) => s.lastScanEvent);

  const [mode, setMode] = useState<HostViewMode>("overview");

  const view = pickHostHeroView({
    phase,
    state,
    players,
    rule: room?.handlerConfig,
  });
  const overviewKind: OverviewKind = view.kind === "waiting" ? "waiting" : "play";
  const layoutKey: LayoutKey = mode === "overview" ? `overview-${overviewKind}` : `focus-${mode}`;

  // Heavy derivations are gated on the visible mode. A push of `state` on
  // every scan would otherwise walk `pairCounts`, sort the player list,
  // and rebuild the path chain even when the host is parked in `overview`
  // or `infection`. The hidden tiles still mount (so display:none toggles
  // are instant), but they receive stable empty refs and skip rendering
  // via React.memo on each focus tile.
  const rankingsData = useMemo(
    () => (mode === "rankings" ? rankings(state, players) : EMPTY_RANKINGS),
    [mode, state, players],
  );
  const encountersOut = useMemo(
    () => (mode === "rankings" ? encounterCounts(state, players) : EMPTY_ENCOUNTERS),
    [mode, state, players],
  );
  const encountersIn = useMemo(
    () => (mode === "rankings" ? inboundEncounterCounts(state, players) : EMPTY_ENCOUNTERS),
    [mode, state, players],
  );
  const chain = useMemo(
    () => (mode === "token-path" ? tokenPathChain(state, players) : EMPTY_CHAIN),
    [mode, state, players],
  );
  const { totalScans } = useMemo(() => summarizeMetricsForHost(metrics), [metrics]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {phase.kind === "ready" && <ReadyConfigEditor code={code} playerId={playerId} />}
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
        <RankingsTile
          rankings={rankingsData}
          encountersOut={encountersOut}
          encountersIn={encountersIn}
        />
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
      <Cell area="scans" visible={mode === "overview" && overviewKind === "play"}>
        <ScanCountTile totalScans={totalScans} />
      </Cell>
      <Cell area="clock" visible>
        <StopwatchTileLive phase={phase} />
      </Cell>
      </section>
    </div>
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
 * `scans` only appears in `overview-play` — during waiting the total is
 * always 0 (game hasn't started), and focus modes intentionally show
 * one metric at a time.
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
      "ticker ticker ticker ticker scans scans clock clock clock clock qr qr"
      "ticker ticker ticker ticker scans scans clock clock clock clock qr qr"
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
