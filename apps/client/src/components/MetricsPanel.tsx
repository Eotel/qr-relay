import type { Metric } from "@qr-relay/core";
import { Badge } from "@qr-relay/ui/badge";
import { Crown } from "lucide-react";

type Props = {
  metrics: Metric[];
  players: { id: string; name: string }[];
  selfId?: string;
};

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function topScorers(byPlayer: Record<string, number>): Set<string> {
  const entries = Object.entries(byPlayer);
  if (entries.length === 0) return new Set();
  const max = Math.max(...entries.map(([, v]) => v));
  if (max <= 0) return new Set();
  return new Set(entries.filter(([, v]) => v === max).map(([pid]) => pid));
}

export function MetricsPanel({ metrics, players, selfId }: Props) {
  const byId = new Map(players.map((p) => [p.id, p.name]));
  if (metrics.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {metrics.map((m, idx) => (
        <div key={`${m.kind}-${idx}`} className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
            {m.label}:
          </span>
          {m.kind === "time" && (
            <Badge variant="neutral" size="chip" className="normal-case tracking-normal">
              {formatMs(m.ms)}
            </Badge>
          )}
          {m.kind === "count" &&
            m.byPlayer &&
            Object.entries(m.byPlayer).map(([pid, v]) => (
              <Badge
                key={pid}
                variant={pid === selfId ? "host" : "neutral"}
                size="chip"
                className="normal-case tracking-normal"
              >
                {byId.get(pid) ?? pid}
                {pid === selfId ? " (自分)" : ""}: {v}
              </Badge>
            ))}
          {m.kind === "count" && !m.byPlayer && (
            <Badge variant="neutral" size="chip" className="normal-case tracking-normal">
              {m.total}
            </Badge>
          )}
          {m.kind === "score" &&
            (() => {
              const leaders = topScorers(m.byPlayer);
              return Object.entries(m.byPlayer).map(([pid, v]) => {
                const isLeader = leaders.has(pid);
                /* Chip grammar: leader (yellow) > self (teal host pill) >
                   everyone else (neutral). Using "player" (terracotta
                   primary) for non-leader non-self chips consumed the
                   CTA color for non-CTA chrome. */
                const variant = isLeader ? "leader" : pid === selfId ? "host" : "neutral";
                return (
                  <Badge
                    key={pid}
                    variant={variant}
                    size="chip"
                    className="normal-case tracking-normal"
                  >
                    {isLeader && <Crown aria-hidden size={11} className="-ml-0.5 mr-0.5" />}
                    {byId.get(pid) ?? pid}
                    {pid === selfId ? " (自分)" : ""}: {v}
                  </Badge>
                );
              });
            })()}
        </div>
      ))}
    </div>
  );
}
