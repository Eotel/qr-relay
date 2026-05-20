import { Badge } from "@qr-relay/ui/badge";
import { Card } from "@qr-relay/ui/card";
import { useOutletContext } from "react-router-dom";
import { MetricsPanel } from "../components/MetricsPanel.js";
import { useWs } from "../lib/ws.js";
import type { RoomOutletContext } from "./RoomLayout.js";

export function Scoreboard() {
  const { playerId } = useOutletContext<RoomOutletContext>();
  const players = useWs((s) => s.players);
  const metrics = useWs((s) => s.metrics);

  return (
    <>
      <Card className="flex flex-col gap-3">
        <h2 className="m-0 text-sm font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
          参加者
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {players.map((p) => (
            <Badge
              key={p.id}
              /* Chip grammar: teal "host" pill marks self, neutral marks
                 everyone else. Using "player" (terracotta primary) for
                 non-self players consumed the CTA color for non-CTA chrome
                 and made the participant list shout. Matches ClientRoom. */
              variant={p.id === playerId ? "host" : "neutral"}
              size="chip"
              className="normal-case tracking-normal"
            >
              {p.name}
              {p.id === playerId ? " (自分)" : ""}
            </Badge>
          ))}
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="m-0 text-sm font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
          メトリクス
        </h2>
        {metrics.length === 0 ? (
          <p className="m-0 text-sm text-foreground/85">スタート後にメトリクスが表示されます。</p>
        ) : (
          <MetricsPanel metrics={metrics} players={players} selfId={playerId} />
        )}
      </Card>
    </>
  );
}
