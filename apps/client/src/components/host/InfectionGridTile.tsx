import { cn } from "@qr-relay/ui/cn";
import { Flame } from "lucide-react";
import type { ValueSlot } from "@qr-relay/handlers";
import type { PlayerLite } from "../../lib/ws-store.js";

type Props = {
  players: PlayerLite[];
  /** Raw RelayState; we read `.values` defensively. */
  state: unknown;
};

type ValuesShape = { values?: Record<string, ValueSlot | undefined> | null };

/**
 * Grid of nicknames tinted by ValueSlot. The canonical use is infection
 * presets — token holders glow, non-holders stay muted, so the board
 * physically fills up as the game progresses (and pause locks the frame).
 *
 * Score presets are accommodated by tinting on `amount > 0` so the same
 * tile can be reused; intensity could be added later but plain "any value
 * yet?" is enough for the audience-reading test.
 */
export function InfectionGridTile({ players, state }: Props) {
  const values = readValues(state);
  const sorted = [...players].sort((a, b) => a.joinedAt - b.joinedAt);
  const holderCount = sorted.reduce((n, p) => (isLit(values[p.id]) ? n + 1 : n), 0);

  return (
    <section
      aria-label="保持状況グリッド"
      className={cn(
        "flex h-full min-h-0 flex-col gap-3 rounded-[var(--radius-lg)]",
        "border border-white/10 bg-white/[0.04] p-5",
      )}
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        <Flame aria-hidden size={16} />
        <span className="text-[11px] font-extrabold uppercase tracking-[0.22em]">INFECTION</span>
        {sorted.length > 0 && (
          <span className="text-[10px] font-bold tabular-nums tracking-wide opacity-60">
            {holderCount} / {sorted.length}
          </span>
        )}
      </div>

      {sorted.length === 0 ? (
        <p className="m-0 flex flex-1 items-center justify-center text-[clamp(16px,2vw,24px)] font-bold text-muted-foreground">
          参加者を待機中
        </p>
      ) : (
        <ul className="m-0 grid min-h-0 flex-1 auto-rows-fr grid-cols-2 gap-2 overflow-hidden p-0 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {sorted.map((p) => {
            const slot = values[p.id];
            const lit = isLit(slot);
            return (
              <li
                key={p.id}
                data-lit={lit ? "true" : "false"}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 rounded-[var(--radius-md)] border px-2 py-2 text-center transition-colors",
                  lit
                    ? "border-[var(--team-red)]/60 bg-[var(--team-red)]/20 text-foreground"
                    : "border-white/10 bg-white/[0.02] text-muted-foreground",
                )}
              >
                <span className="text-[clamp(14px,1.6vw,22px)] font-black leading-tight">
                  {p.name}
                </span>
                {slot?.kind === "score" && (
                  <span className="text-[clamp(11px,1vw,16px)] font-bold tabular-nums opacity-80">
                    {slot.amount}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function readValues(state: unknown): Record<string, ValueSlot> {
  if (!state || typeof state !== "object") return {};
  const values = (state as ValuesShape).values;
  if (!values || typeof values !== "object") return {};
  const out: Record<string, ValueSlot> = {};
  for (const [k, v] of Object.entries(values)) {
    if (v) out[k] = v;
  }
  return out;
}

function isLit(slot: ValueSlot | undefined): boolean {
  if (!slot) return false;
  if (slot.kind === "token") return slot.has;
  return slot.amount > 0;
}
