import { Badge } from "@qr-relay/ui/badge";
import { Card } from "@qr-relay/ui/card";
import { cn } from "@qr-relay/ui/cn";
import { Camera, Home as HomeIcon, Trophy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useParams } from "react-router-dom";
import { joinRoom } from "../lib/api.js";
import { ensurePlayerName, getPlayerId, getRole } from "../lib/identity.js";
import { useWs } from "../lib/ws.js";

export type RoomOutletContext = {
  playerId: string;
  code: string;
  role: "host" | "client";
};

export function RoomLayout() {
  const { code = "" } = useParams<{ code: string }>();
  const playerId = useMemo(() => getPlayerId(), []);
  const playerName = useMemo(() => ensurePlayerName(), []);
  const role = useMemo(() => getRole(code), [code]);
  const [joinError, setJoinError] = useState<string | null>(null);

  const connected = useWs((s) => s.connected);
  const lastError = useWs((s) => s.lastError);
  const setSnapshot = useWs((s) => s.setSnapshot);
  const setRoom = useWs((s) => s.setRoom);
  const connect = useWs((s) => s.connect);
  const disconnect = useWs((s) => s.disconnect);

  useEffect(() => {
    if (!role) return;
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

  if (!role) {
    // Role unresolved (direct nav to /r/CODE without joining via Home/NewRoom).
    // Send the user back to Home so they can choose host or client.
    return <Navigate to="/" replace />;
  }

  const tabClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-bold transition-colors",
      "pointer-coarse:h-11 pointer-coarse:gap-2 pointer-coarse:px-4 pointer-coarse:text-sm",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
      isActive
        ? "bg-primary text-primary-foreground shadow-[var(--shadow-cta-primary)]"
        : "bg-muted/40 text-foreground hover:bg-muted/60",
    );

  const context: RoomOutletContext = { playerId, code, role };
  const roleLabel = role === "host" ? "HOST" : "PLAYER";

  return (
    <main
      className={cn(
        "mx-auto flex min-h-dvh max-w-[720px] flex-col gap-3 px-3 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:max-w-[1200px]",
        // Host gets the "Stage" dark register by default — large, calm operator view.
        role === "host" && "dark",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link
            to="/"
            aria-label="ホームに戻る"
            className={cn(
              "inline-flex size-8 items-center justify-center rounded-full bg-muted/40 text-foreground transition-colors hover:bg-muted/60",
              "pointer-coarse:size-11",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
              "dark:bg-white/[0.06] dark:hover:bg-white/[0.12]",
            )}
          >
            <HomeIcon size={14} aria-hidden />
          </Link>
          <Badge variant={role === "host" ? "host" : "player"} size="chip">
            {roleLabel}
          </Badge>
          <strong className="text-base font-extrabold tracking-[0.18em]">{code}</strong>
          <ConnectionPill connected={connected} />
        </div>
        <nav
          className="flex items-center gap-1 rounded-full bg-muted/40 p-1 dark:bg-white/[0.06]"
          aria-label="表示切替"
        >
          <NavLink to={`/r/${code}`} end className={tabClass}>
            <Camera size={14} />
            <span>ルーム</span>
          </NavLink>
          <NavLink to={`/r/${code}/scoreboard`} className={tabClass}>
            <Trophy size={14} />
            <span>スコア</span>
          </NavLink>
        </nav>
      </div>

      {joinError && (
        <Card className="border border-destructive/40 bg-destructive/10 text-sm font-bold text-destructive">
          {joinError}
        </Card>
      )}
      {lastError && (
        <Card className="border border-destructive/40 bg-destructive/10 text-sm font-bold text-destructive">
          {lastError}
        </Card>
      )}

      <Outlet context={context} />
    </main>
  );
}

function ConnectionPill({ connected }: { connected: boolean }) {
  return (
    <span
      aria-live="polite"
      aria-atomic="true"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.12em]",
        connected
          ? "bg-secondary/15 text-secondary dark:bg-secondary/25 dark:text-foreground"
          : "bg-destructive/15 text-destructive",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          connected ? "bg-secondary" : "bg-destructive animate-pulse",
        )}
      />
      {connected ? "接続中" : "切断"}
    </span>
  );
}
