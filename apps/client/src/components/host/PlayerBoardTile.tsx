import { cn } from "@qr-relay/ui/cn";
import { Crown } from "lucide-react";
import type { HostHeroView } from "../../lib/host-view.js";
import type { PlayerLite } from "../../lib/ws-store.js";

type Props = {
  view: HostHeroView;
  players: PlayerLite[];
};

/**
 * The "everyone finds themselves" board. Renders every player as a sizable
 * card so an audience member 6 m away can spot their own name in ~1 second.
 *
 * Sizing strategy: name 24px floor, value 40–64 px; we tighten the grid
 * (`auto-fill, minmax`) instead of shrinking glyphs so the floor is honored.
 * The dashboard caps internal scroll via `min-h-0 + overflow-hidden`; if too
 * many players overflow, M4 will swap to font-fit. For the M2 pass we let
 * the grid trim columns first.
 */
export function PlayerBoardTile({ view, players }: Props) {
  if (view.kind === "waiting") {
    return (
      <section
        aria-label="参加者"
        className="flex h-full min-h-0 flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] border border-white/10 bg-white/[0.04] p-6 text-center"
      >
        <span className="text-[12px] font-extrabold uppercase tracking-[0.22em] text-muted-foreground">
          PLAYERS
        </span>
        <strong className="text-[clamp(64px,10vw,160px)] font-black leading-none tabular-nums">
          {players.length}
        </strong>
        <span className="text-base font-bold text-muted-foreground">人参加中</span>
      </section>
    );
  }

  if (view.kind === "score-leader") {
    return (
      <Frame label="SCORES">
        <Grid>
          {view.entries.map((e, i) => (
            <PlayerCell
              key={e.id}
              name={e.name}
              value={String(e.score)}
              isLeader={view.leaders.some((l) => l.id === e.id) && e.score > 0}
              rank={i + 1}
            />
          ))}
        </Grid>
      </Frame>
    );
  }

  // token-single / token-many: highlight current holders.
  const holderIds = new Set(view.kind === "token-single" ? [view.holder?.id ?? ""] : view.holders.map((h) => h.id));
  return (
    <Frame label={view.kind === "token-single" ? "ROSTER" : "INFECTED ROSTER"}>
      <Grid>
        {players.map((p) => (
          <PlayerCell
            key={p.id}
            name={p.name}
            isHolder={holderIds.has(p.id)}
            holderTone={view.kind === "token-single" ? "baton" : "infection"}
          />
        ))}
      </Grid>
    </Frame>
  );
}

function Frame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section
      aria-label={label}
      className="flex h-full min-h-0 flex-col gap-3 rounded-[var(--radius-lg)] border border-white/10 bg-white/[0.04] p-4"
    >
      <span className="text-[12px] font-extrabold uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </span>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "grid h-full gap-2 content-start",
        "grid-cols-[repeat(auto-fill,minmax(200px,1fr))]",
        "auto-rows-min",
      )}
    >
      {children}
    </div>
  );
}

type CellProps = {
  name: string;
  value?: string;
  rank?: number;
  isLeader?: boolean;
  isHolder?: boolean;
  holderTone?: "baton" | "infection";
};

function PlayerCell({ name, value, rank, isLeader, isHolder, holderTone }: CellProps) {
  // Pulse only the value/holder badge by re-keying that inner element when
  // the value changes — the surrounding cell stays mounted so grid order
  // doesn't shift mid-animation.
  const pulseKey = value ?? (isHolder ? `h-${holderTone}` : "n");
  return (
    <div
      className={cn(
        "flex min-h-[96px] flex-col justify-between rounded-[var(--radius-md)] border px-3 py-2 transition-colors duration-150 ease-out",
        "border-white/10 bg-white/[0.03]",
        isLeader && "border-[var(--team-yellow)]/60 bg-[var(--team-yellow)]/15",
        isHolder &&
          holderTone === "baton" &&
          "border-[var(--primary)]/50 bg-[var(--primary)]/20",
        isHolder &&
          holderTone === "infection" &&
          "border-[var(--team-red)]/50 bg-[var(--team-red)]/15",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={cn(
            "min-w-0 truncate text-[clamp(20px,2.2vw,30px)] font-black leading-tight",
            isLeader && "text-[var(--team-yellow)]",
          )}
        >
          {name}
        </span>
        {isLeader && <Crown aria-hidden size={18} className="shrink-0 text-[var(--team-yellow)]" />}
      </div>
      <div key={pulseKey} className="hero-pulse flex items-baseline justify-between gap-2">
        {rank !== undefined && (
          <span className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">
            #{rank}
          </span>
        )}
        {value !== undefined && (
          <strong
            className={cn(
              "ml-auto text-[clamp(28px,4vw,56px)] font-black leading-none tabular-nums",
              isLeader && "text-[var(--team-yellow)]",
            )}
          >
            {value}
          </strong>
        )}
        {isHolder && value === undefined && (
          <strong
            className={cn(
              "ml-auto text-[clamp(20px,2.4vw,32px)] font-extrabold uppercase tracking-[0.18em]",
              holderTone === "baton" && "text-[var(--primary)]",
              holderTone === "infection" && "text-[var(--team-red)]",
            )}
          >
            {holderTone === "baton" ? "持っている" : "感染"}
          </strong>
        )}
      </div>
    </div>
  );
}
