import { Badge } from "@qr-relay/ui/badge";
import { Card } from "@qr-relay/ui/card";
import { cn } from "@qr-relay/ui/cn";
import { Camera, Home as HomeIcon, Trophy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import { InactivityOverlay } from "../components/InactivityOverlay.js";
import { joinRoom } from "../lib/api.js";
import {
  acceptInviteRole,
  ensurePlayerName,
  getPlayerId,
  getRole,
  setPlayerName,
} from "../lib/identity.js";
import { isTokenHolder } from "../lib/token-holder.js";
import { useWs } from "../lib/ws.js";
import { type ClientView, ClientViewToggle } from "./_ClientViewToggle.js";

export type RoomOutletContext = {
  playerId: string;
  code: string;
  role: "host" | "client";
  playerName: string;
  /**
   * Persist a new nickname and trigger a re-join. The room layout owns the
   * join/connect cycle, so a name change here drops the WS, re-POSTs join with
   * the new name, and re-opens the socket. Callers (e.g. RoomSettingsOverlay)
   * should resolve collisions before calling.
   */
  onRename: (name: string) => void;
  /**
   * QR/camera split mode for ClientRoom. Lifted to the layout so the toggle
   * can sit in the single-row header instead of duplicating a header inside
   * the route. HostRoom ignores it.
   */
  clientView: ClientView;
  setClientView: (v: ClientView) => void;
};

export function RoomLayout() {
  const { code = "" } = useParams<{ code: string }>();
  const playerId = useMemo(() => getPlayerId(), []);
  // Lift player name into state so the overlay's rename flow can trigger the
  // join effect (deps: playerName) to drop and re-open the socket with the
  // new name. The initial value is hoisted via useState's lazy initializer
  // to keep ensurePlayerName off the render path.
  const [playerName, setPlayerNameState] = useState(() => ensurePlayerName());
  // Split/QR/Scan toggle for client play view. Lives here so the header is
  // one row; HostRoom never reads it.
  const [clientView, setClientView] = useState<ClientView>("split");
  const onRename = (next: string) => {
    if (!next || next === playerName) return;
    setPlayerName(next);
    setPlayerNameState(next);
  };
  // Cold-land flow: scanning a friend's invite QR with the OS camera app
  // drops the device on /r/CODE without a prior role claim. Auto-accept as
  // client so the join completes (URL = intent, localStorage = authority).
  // The host's own device already has setRole(code, "host") from NewRoom,
  // so this never demotes a host.
  const role = useMemo(() => getRole(code) ?? acceptInviteRole(code), [code]);
  const [joinError, setJoinError] = useState<string | null>(null);

  const connected = useWs((s) => s.connected);
  const playerCount = useWs((s) => s.players.length);
  const lastError = useWs((s) => s.lastError);
  const setSnapshot = useWs((s) => s.setSnapshot);
  const setRoom = useWs((s) => s.setRoom);
  const connect = useWs((s) => s.connect);
  const disconnect = useWs((s) => s.disconnect);
  const send = useWs((s) => s.send);
  const inactivity = useWs((s) => s.inactivity);
  const closed = useWs((s) => s.closed);
  const wsState = useWs((s) => s.state);
  const navigate = useNavigate();

  // token-holder tint: only meaningful for client role + token-slot presets.
  // Detection lives in `state.values`, not the metric label, so it survives copy changes.
  const isHolding = role === "client" && isTokenHolder(wsState, playerId);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await joinRoom(code, playerId, playerName, role);
        if (cancelled) return;
        setRoom(snap.room);
        setSnapshot({ players: snap.players, state: snap.state, metrics: snap.metrics });
        connect(code, playerId, role);
      } catch (err) {
        if (!cancelled) setJoinError(String(err));
      }
    })();
    return () => {
      cancelled = true;
      disconnect();
    };
  }, [code, playerId, playerName, role, connect, disconnect, setRoom, setSnapshot]);

  useEffect(() => {
    if (!closed) return;
    // Server closed the room. Bail out to the standalone closed screen so the
    // user sees "what happened" + a path home, instead of the live room UI.
    navigate(`/r/${code}/closed`, { replace: true });
  }, [closed, code, navigate]);

  // Mobile browser chrome (status bar / address bar) follows the
  // <meta name="theme-color"> value. The host gets the dark stage register
  // via `<main class="dark">`, so without this effect the OS chrome stays
  // cream while the page goes slate-navy. Swap on enter, restore on leave.
  useEffect(() => {
    if (role !== "host") return;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    const prev = meta.getAttribute("content");
    meta.setAttribute("content", "#1e2433");
    return () => {
      if (prev !== null) meta.setAttribute("content", prev);
    };
  }, [role]);

  // Handheld is the primary register (PRODUCT.md §"Users"): the tab strip sits
  // on the same row as the room chip / connection pill, so the header collapses
  // to a single row and the play area gets the rest of the viewport. md+ keeps
  // the existing spacing — there's plenty of horizontal room to breathe.
  const tabClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "inline-flex h-8 items-center justify-center gap-1.5 rounded-full px-2.5 text-[12px] font-bold transition-colors md:h-8 md:flex-initial md:px-3 md:text-[13px]",
      "pointer-coarse:h-11 pointer-coarse:gap-2 pointer-coarse:px-3.5 pointer-coarse:text-sm",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
      isActive
        ? "bg-primary text-primary-foreground shadow-[var(--shadow-cta-primary)]"
        : "bg-muted/40 text-foreground hover:bg-muted/60",
    );

  const context: RoomOutletContext = {
    playerId,
    code,
    role,
    playerName,
    onRename,
    clientView,
    setClientView,
  };
  const roleLabel = role === "host" ? "HOST" : "PLAYER";

  return (
    <main
      data-holding={isHolding ? "true" : undefined}
      className={cn(
        "mx-auto flex h-dvh max-w-[720px] flex-col gap-2 overflow-hidden bg-background px-3 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-[calc(0.5rem+env(safe-area-inset-bottom))] text-foreground md:gap-3 md:pt-[calc(0.75rem+env(safe-area-inset-top))] md:pb-[calc(0.75rem+env(safe-area-inset-bottom))]",
        // Host gets the "Stage" dark register by default — large, calm operator view.
        // bg-background/text-foreground above must be on the same element as `dark`
        // so the dark-register variables resolve at main's own background and text.
        role === "host" && "dark",
        // Stage register fills the viewport so a projector / large display gets
        // the full pixel budget — handheld keeps the 1200px cap so a host's PC
        // at <md still reads as a comfortable column. Padding bumps to md:px-6
        // on host to give the dashboard tiles edge breathing room.
        role === "host" ? "md:max-w-none md:px-6" : "md:max-w-[1200px]",
        // Both registers now lock to the viewport (h-dvh + overflow-hidden).
        // Stage (host) needs a fixed frame so the audience reads a non-scrolling
        // dashboard. Handheld (client) needs it so the QR and camera tiles stay
        // visible at all times — they're the entire gameplay surface. Scroll is
        // delegated to inner scoreboard routes when they need it.
      )}
    >
      {/* Single-row header, modeled on Shake Counter's handheld chrome:
          one quiet strip of identity ([home] [code] [●]) on the left,
          one quiet tab strip on the right. Every pixel taken here is stolen
          from the QR / camera tiles below, so handheld gets the smallest
          legible chip sizes; md+ inflates back to comfortable spacing.
          Role badge is hidden on handheld — the player always knows they're
          a player (the device is in their hand); the badge is only useful
          on md+ where there's space and on stage where it labels the role
          for the audience. */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 md:gap-2">
          <Link
            to="/"
            aria-label="ホームに戻る"
            className={cn(
              "inline-flex size-7 items-center justify-center rounded-full bg-muted/40 text-foreground transition-colors hover:bg-muted/60 md:size-8",
              "pointer-coarse:size-11",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
              "dark:bg-white/[0.06] dark:hover:bg-white/[0.12]",
            )}
          >
            <HomeIcon size={12} aria-hidden className="md:[width:14px] md:[height:14px]" />
          </Link>
          <Badge
            variant={role === "host" ? "host" : "player"}
            size="chip"
            className="hidden md:inline-flex"
          >
            {roleLabel}
          </Badge>
          {/* Room code is the only identity bit the player needs on handheld,
              and they only need it for hand-off / debugging — never for play.
              Render it small and quiet (caps + light tracking, no bold). */}
          <strong className="truncate text-[11px] font-bold tracking-[0.16em] text-muted-foreground md:text-base md:font-extrabold md:tracking-[0.18em] md:text-foreground">
            {code}
          </strong>
          <ConnectionPill connected={connected} />
          {/* Player count chip — hidden on handheld to keep the header tight,
              visible from md+ so the audience can glance at "how many joined"
              without needing the dashboard hero to surface it. */}
          <span
            aria-live="polite"
            className="hidden items-center gap-1 rounded-full bg-muted/40 px-2 py-0.5 text-[11px] font-bold tracking-[0.04em] text-muted-foreground md:inline-flex dark:bg-white/[0.06] dark:text-foreground/85"
          >
            <span className="tabular-nums">{playerCount}</span>
            <span>人</span>
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 md:gap-2">
          {/* Client-only split/qr/scan toggle. Sitting in the header keeps
              ClientRoom's render tree to a single play section + FAB — no
              second header row stealing pixels from the play tiles. */}
          {role === "client" && <ClientViewToggle view={clientView} onChange={setClientView} />}
          {/* Host's dashboard now owns its own view switcher (see ViewSwitcher
              in HostDashboard.tsx), so the room/scoreboard tab strip up here
              would duplicate navigation. Client keeps the strip — the handheld
              still wants a way to peek at scores. */}
          {role === "client" && (
            <nav
              className="flex shrink-0 items-center gap-1 rounded-full bg-muted/40 p-1 dark:bg-white/[0.06]"
              aria-label="表示切替"
            >
              <NavLink to={`/r/${code}`} end className={tabClass} aria-label="ルーム">
                <Camera size={14} />
                <span className="hidden md:inline">ルーム</span>
              </NavLink>
              <NavLink to={`/r/${code}/scoreboard`} className={tabClass} aria-label="スコア">
                <Trophy size={14} />
                <span className="hidden md:inline">スコア</span>
              </NavLink>
            </nav>
          )}
        </div>
      </div>

      {joinError && (
        <Card
          role="alert"
          className="border border-destructive/40 bg-destructive/10 text-sm font-bold text-destructive"
        >
          {joinError}
        </Card>
      )}
      {lastError && (
        <Card
          role="alert"
          className="border border-destructive/40 bg-destructive/10 text-sm font-bold text-destructive"
        >
          {lastError}
        </Card>
      )}

      <Outlet context={context} />
      {inactivity && (
        <InactivityOverlay
          closeAt={inactivity.closeAt}
          onContinue={() => send({ t: "keepalive" })}
        />
      )}
    </main>
  );
}

function ConnectionPill({ connected }: { connected: boolean }) {
  // Mobile: bare colored dot to keep the top bar from crowding at 375px.
  // md+: full pill with the visible label. Label stays in the a11y tree at
  // every breakpoint so aria-live announces transitions.
  return (
    <span
      aria-live="polite"
      aria-atomic="true"
      className={cn(
        "inline-flex items-center text-[11px] font-bold uppercase tracking-[0.12em]",
        "md:gap-1.5 md:rounded-full md:px-2.5 md:py-0.5",
        connected
          ? "md:bg-secondary/15 md:text-secondary md:dark:bg-secondary/25 md:dark:text-foreground"
          : // Solid pill on disconnect — tinted /15 + text-destructive was ~3.5:1 in light mode, below AA.
            "md:bg-destructive md:text-destructive-foreground",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-2 rounded-full md:size-1.5",
          connected ? "bg-secondary" : "bg-destructive animate-pulse md:bg-destructive-foreground",
        )}
      />
      <span className="sr-only md:not-sr-only">{connected ? "接続中" : "切断"}</span>
    </span>
  );
}
