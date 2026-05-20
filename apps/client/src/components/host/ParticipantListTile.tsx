import { cn } from "@qr-relay/ui/cn";
import { Users } from "lucide-react";
import type { PlayerLite } from "../../lib/ws-store.js";

type Props = {
  players: PlayerLite[];
};

/**
 * Simplest possible host view: everyone in lobby order (joinedAt ascending).
 * Useful when the host just wants to confirm "did everyone join" without
 * worrying about live state.
 */
export function ParticipantListTile({ players }: Props) {
  const sorted = [...players].sort((a, b) => a.joinedAt - b.joinedAt);

  return (
    <section
      aria-label="参加者一覧"
      className={cn(
        "flex h-full min-h-0 flex-col gap-3 rounded-[var(--radius-lg)]",
        "border border-white/10 bg-white/[0.04] p-5",
      )}
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        <Users aria-hidden size={16} />
        <span className="text-[11px] font-extrabold uppercase tracking-[0.22em]">PARTICIPANTS</span>
        <span className="text-[10px] font-bold tabular-nums tracking-wide opacity-60">
          {sorted.length} 人
        </span>
      </div>

      {sorted.length === 0 ? (
        <p className="m-0 flex flex-1 items-center justify-center text-[clamp(16px,2vw,24px)] font-bold text-muted-foreground">
          参加者を待機中
        </p>
      ) : (
        <ol className="m-0 grid min-h-0 flex-1 grid-cols-2 gap-x-4 gap-y-1 overflow-hidden p-0 md:grid-cols-3 lg:grid-cols-4">
          {sorted.map((p, i) => (
            <li
              key={p.id}
              className="flex items-baseline gap-3 text-[clamp(18px,2.2vw,30px)] font-bold"
            >
              <span className="w-[2ch] shrink-0 text-right tabular-nums text-muted-foreground">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
