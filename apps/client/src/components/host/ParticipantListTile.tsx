import { cn } from "@qr-relay/ui/cn";
import { Users } from "lucide-react";
import type { PlayerLite } from "../../lib/ws-store.js";

type Props = {
  players: PlayerLite[];
};

function formatRelative(ts: number, base: number): string {
  const totalSec = Math.max(0, Math.floor((ts - base) / 1000));
  const sec = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const min = totalMin % 60;
  const hours = Math.floor(totalMin / 60);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return hours > 0 ? `+${pad(hours)}:${pad(min)}:${pad(sec)}` : `+${pad(min)}:${pad(sec)}`;
}

export function ParticipantListTile({ players }: Props) {
  const sorted = [...players].sort((a, b) => a.joinedAt - b.joinedAt);
  const firstJoinedAt = sorted[0]?.joinedAt ?? 0;

  return (
    <section
      aria-label="参加者一覧"
      className={cn(
        "flex h-full min-h-0 flex-col gap-3 overflow-hidden rounded-[var(--radius-lg)]",
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
        <ol className="m-0 flex min-h-0 flex-1 flex-col divide-y divide-white/5 overflow-y-auto p-0">
          {sorted.map((p, i) => (
            <li
              key={p.id}
              className="grid grid-cols-[3ch_minmax(0,1fr)_auto] items-center gap-3 py-2 text-[14px] font-medium"
            >
              <span className="text-right tabular-nums text-muted-foreground">{i + 1}</span>
              <span className="min-w-0 truncate">{p.name}</span>
              <span className="tabular-nums text-[12px] text-muted-foreground">
                {formatRelative(p.joinedAt, firstJoinedAt)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
