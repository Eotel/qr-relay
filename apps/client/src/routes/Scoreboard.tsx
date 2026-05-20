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
              variant={p.id === playerId ? "host" : "player"}
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
        <MetricsPanel metrics={metrics} players={players} selfId={playerId} />
      </Card>
    </>
  );
}
