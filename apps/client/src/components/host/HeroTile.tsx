import { cn } from "@qr-relay/ui/cn";
import { Crown, Flame, Hand } from "lucide-react";
import type { HostHeroView } from "../../lib/host-view.js";

type Props = {
  view: HostHeroView;
  /**
   * Subtitle for the waiting state — the room code rendered massive so the
   * audience has something massive to glance at while joiners arrive.
   */
  roomCode?: string;
};

/**
 * Stage-dashboard hero cell. Renders the single most-important piece of
 * information for the current preset, sized to be read from across a gym
 * (target: 100+ px glyphs on a 27" panel at 4–6 m).
 *
 * Pure: derives layout from `view` alone — no live store reads here, so the
 * dashboard composes the snapshot at one place and tests render each branch
 * in isolation.
 */
export function HeroTile({ view, roomCode }: Props) {
  return (
    <section
      aria-label="今の主役"
      className={cn(
        "flex h-full min-h-0 flex-col items-center justify-center gap-4 overflow-hidden rounded-[var(--radius-lg)]",
        "border border-white/10 bg-white/[0.04] p-6 text-center",
      )}
    >
      {view.kind === "waiting" && (
        <>
          <Label>WAITING</Label>
          <strong className="hero-room-code w-full break-words text-[clamp(56px,10vw,200px)] font-black leading-none tracking-[0.08em]">
            {withSoftBreaks(roomCode ?? "—", 3)}
          </strong>
          <p className="m-0 text-[clamp(20px,2.4vw,40px)] font-bold tabular-nums text-muted-foreground">
            <span className="text-foreground">{view.playerCount}</span>
            <span className="ml-1">人参加中</span>
          </p>
        </>
      )}

      {view.kind === "token-single" && (
        <>
          <Label icon={<Hand size={18} />}>NOW HOLDING</Label>
          <strong
            key={view.holder?.id ?? "none"}
            className="hero-pulse max-w-full whitespace-nowrap text-[clamp(40px,13vw,260px)] font-black leading-[0.95]"
          >
            {view.holder?.name ?? "—"}
          </strong>
          {!view.holder && (
            <p className="m-0 text-[clamp(18px,2vw,32px)] font-bold text-muted-foreground">
              最初の保持者を待機中
            </p>
          )}
        </>
      )}

      {view.kind === "token-many" && (
        <>
          <Label icon={<Flame size={18} />}>INFECTED</Label>
          <strong
            key={`${view.holders.length}/${view.totalPlayers}`}
            className="hero-pulse text-[clamp(72px,14vw,280px)] font-black leading-none tabular-nums"
          >
            {view.holders.length}
            <span className="text-muted-foreground"> / {view.totalPlayers}</span>
          </strong>
          <ProgressBar value={view.holders.length} max={view.totalPlayers} />
        </>
      )}

      {view.kind === "score-leader" && (
        <>
          <Label icon={<Crown size={18} />}>LEADER</Label>
          {view.leaders.length === 0 ? (
            <strong className="text-[clamp(48px,9vw,180px)] font-black leading-none text-muted-foreground">
              まだ得点なし
            </strong>
          ) : (
            <>
              <strong
                key={view.leaders.map((l) => l.id).join(",")}
                className="hero-pulse w-full break-words text-[clamp(56px,11vw,220px)] font-black leading-[0.95]"
              >
                {view.leaders.map((l) => l.name).join(" / ")}
              </strong>
              <span className="text-[clamp(40px,7vw,140px)] font-black tabular-nums text-[var(--team-yellow)]">
                {view.leaders[0]?.score ?? 0} pt
              </span>
            </>
          )}
        </>
      )}
    </section>
  );
}

function withSoftBreaks(text: string, every: number): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  for (let i = 0; i < text.length; i += every) {
    if (i > 0) out.push(<wbr key={`wbr-${i}`} />);
    out.push(text.slice(i, i + every));
  }
  return out;
}

function Label({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-[clamp(12px,1vw,18px)] font-extrabold uppercase tracking-[0.22em] text-muted-foreground">
      {icon}
      {children}
    </span>
  );
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  // Animate via transform (GPU-composited) instead of width (layout-driven) so
  // a token-many room with one scan per second doesn't run the layout pipeline
  // on the dashboard region every 150 ms. Parent has overflow-hidden +
  // rounded-full, so the inner rect doesn't need its own radius.
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div
      role="progressbar"
      tabIndex={-1}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className="h-2 w-full max-w-[560px] overflow-hidden rounded-full bg-white/10"
    >
      <div
        className="h-full w-full origin-left bg-[var(--team-red)] transition-transform duration-150 ease-out"
        style={{ transform: `scaleX(${ratio})` }}
      />
    </div>
  );
}
