import { ScanPayloadV1 } from "@qr-relay/core";
import { Badge } from "@qr-relay/ui/badge";
import { Button } from "@qr-relay/ui/button";
import { cn } from "@qr-relay/ui/cn";
import { Camera, LayoutGrid, QrCode, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { MetricsPanel } from "../components/MetricsPanel.js";
import { QrDisplay } from "../components/QrDisplay.js";
import { QrScannerView } from "../components/QrScanner.js";
import { startRoom } from "../lib/api.js";
import { useWs } from "../lib/ws.js";
import type { RoomOutletContext } from "./RoomLayout.js";

const tileFrame =
  "relative flex aspect-square w-full max-h-full items-center justify-center overflow-hidden rounded-[var(--radius-lg)] shadow-[var(--shadow-card)] dark:shadow-none";

function nonce(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

type View = "split" | "qr" | "scan";

export function Room() {
  const { playerId, code } = useOutletContext<RoomOutletContext>();
  const [view, setView] = useState<View>("split");
  const [payloadTick, setPayloadTick] = useState(0);

  const players = useWs((s) => s.players);
  const metrics = useWs((s) => s.metrics);
  const send = useWs((s) => s.send);

  useEffect(() => {
    const id = window.setInterval(() => setPayloadTick((t) => t + 1), 5000);
    return () => window.clearInterval(id);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: payloadTick drives QR ts+nonce refresh
  const payload = useMemo(
    () => ({
      v: 1 as const,
      rid: code,
      pid: playerId,
      ts: Date.now(),
      nonce: nonce(),
    }),
    [code, playerId, payloadTick],
  );

  const onScan = (raw: string) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    const result = ScanPayloadV1.safeParse(parsed);
    if (!result.success) return;
    if (result.data.rid !== code) return;
    if (result.data.pid === playerId) return;
    send({ t: "scan", payload: result.data });
  };

  const showQr = view !== "scan";
  const showScanner = view !== "qr";

  return (
    <>
      <MetricsPanel metrics={metrics} players={players} selfId={playerId} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {players.map((p) => (
            <Badge
              key={p.id}
              variant={p.id === playerId ? "host" : "neutral"}
              size="chip"
              className="normal-case tracking-normal"
            >
              {p.name}
              {p.id === playerId ? " (自分)" : ""}
            </Badge>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="pill"
            className="w-auto"
            onClick={() => startRoom(code).catch(() => {})}
          >
            <RefreshCw size={13} />
            <span>リセット / スタート</span>
          </Button>
          <ViewToggle view={view} onChange={setView} />
        </div>
      </div>

      {/* Portrait phones stack the QR over the camera. Landscape phones
          and md+ desktops split side by side: half the screen each is
          how two players actually use this in person, kneeling
          opposite each other or holding the phone sideways. */}
      <section
        aria-label="QR と撮影"
        className="flex min-h-0 flex-1 flex-col items-stretch gap-2.5 landscape:flex-row landscape:gap-3 md:flex-row md:gap-3"
      >
        {showQr && (
          <div className="flex min-h-0 flex-1 items-center justify-center landscape:min-w-0 md:min-w-0">
            <div className={cn(tileFrame, "bg-white")}>
              <QrDisplay payload={payload} />
            </div>
          </div>
        )}
        {showScanner && (
          <div className="flex min-h-0 flex-1 items-center justify-center landscape:min-w-0 md:min-w-0">
            <div className={cn(tileFrame, "bg-black text-white")}>
              <QrScannerView onScan={onScan} />
            </div>
          </div>
        )}
      </section>
    </>
  );
}

function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const items: Array<{ key: View; icon: React.ReactNode; label: string }> = [
    { key: "split", icon: <LayoutGrid size={14} />, label: "分割" },
    { key: "qr", icon: <QrCode size={14} />, label: "QR" },
    { key: "scan", icon: <Camera size={14} />, label: "撮影" },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="表示モード"
      className="flex items-center gap-1 rounded-full bg-muted/40 p-1 dark:bg-white/[0.06]"
    >
      {items.map((it) => {
        const active = view === it.key;
        return (
          <button
            key={it.key}
            type="button"
            // biome-ignore lint/a11y/useSemanticElements: styled segmented pill is intentional; semantics carried via role+aria-checked
            role="radio"
            aria-checked={active}
            aria-label={it.label}
            onClick={() => onChange(it.key)}
            className={cn(
              "inline-flex h-7 items-center justify-center rounded-full px-2.5 transition-colors duration-150",
              "pointer-coarse:h-10 pointer-coarse:px-3.5",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
              active
                ? "bg-primary text-primary-foreground"
                : "bg-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {it.icon}
          </button>
        );
      })}
    </div>
  );
}
