import { Button } from "@qr-relay/ui/button";
import { Card } from "@qr-relay/ui/card";
import { cn } from "@qr-relay/ui/cn";
import { Play, RefreshCw } from "lucide-react";
import { useOutletContext } from "react-router-dom";
import { JoinQrDisplay, joinUrlFor } from "../components/JoinQrDisplay.js";
import { MetricsPanel } from "../components/MetricsPanel.js";
import { startRoom } from "../lib/api.js";
import { useWs } from "../lib/ws.js";
import type { RoomOutletContext } from "./RoomLayout.js";

const qrFrame =
  "relative flex aspect-square w-full max-w-[420px] items-center justify-center overflow-hidden rounded-[var(--radius-lg)] bg-white shadow-[var(--shadow-card)] dark:shadow-none";

export function HostRoom() {
  const { code } = useOutletContext<RoomOutletContext>();
  const players = useWs((s) => s.players);
  const metrics = useWs((s) => s.metrics);

  const onStart = () => {
    startRoom(code).catch(() => {});
  };

  return (
    <section className="flex flex-1 flex-col gap-4">
      <Card className="flex flex-col items-center gap-3 text-center">
        <span className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">
          ROOM CODE
        </span>
        <strong className="text-[42px] leading-none font-black tracking-[0.18em] sm:text-[56px]">
          {code}
        </strong>
        <p className="m-0 text-sm font-bold text-muted-foreground">
          このQRをスキャンして参加してください
        </p>
        <div className="flex w-full justify-center">
          <div className={qrFrame}>
            <JoinQrDisplay code={code} />
          </div>
        </div>
        <p className="m-0 break-all text-[11px] text-muted-foreground">{joinUrlFor(code)}</p>
      </Card>

      <Card className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="m-0 text-sm font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
            参加者
          </h2>
          <span className="text-xs font-bold text-muted-foreground">{players.length}人</span>
        </div>
        {players.length === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">
            まだ誰も参加していません。QR をスキャンしてもらいましょう。
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {players.map((p) => (
              <li
                key={p.id}
                className={cn(
                  "inline-flex items-center rounded-full bg-secondary/15 px-2.5 py-0.5 text-[12px] font-bold text-foreground",
                  "dark:bg-secondary/25",
                )}
              >
                {p.name}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="m-0 text-sm font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
          スコアボード
        </h2>
        {metrics.length === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">スタート後にメトリクスが表示されます。</p>
        ) : (
          <MetricsPanel metrics={metrics} players={players} />
        )}
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" size="submit" onClick={onStart} className="w-auto">
          <RefreshCw size={16} />
          <span>リセット</span>
        </Button>
        <Button type="button" variant="primary" size="submit" onClick={onStart} className="w-auto">
          <Play size={16} />
          <span>スタート</span>
        </Button>
      </div>
    </section>
  );
}
