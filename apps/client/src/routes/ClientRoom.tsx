import { ScanPayloadV1 } from "@qr-relay/core";
import { Badge } from "@qr-relay/ui/badge";
import { cn } from "@qr-relay/ui/cn";
import { Camera, ChevronDown, LayoutGrid, QrCode } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { MetricsPanel } from "../components/MetricsPanel.js";
import { QrDisplay } from "../components/QrDisplay.js";
import { QrScannerView } from "../components/QrScanner.js";
import { useWs } from "../lib/ws.js";
import type { RoomOutletContext } from "./RoomLayout.js";

const tileFrame =
  "relative flex aspect-square w-full max-h-full items-center justify-center overflow-hidden rounded-[var(--radius-lg)] shadow-[var(--shadow-card)] dark:shadow-none";

function nonce(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

type View = "split" | "qr" | "scan";

export function ClientRoom() {
  const { playerId, code } = useOutletContext<RoomOutletContext>();
  const [view, setView] = useState<View>("split");
  const [payloadTick, setPayloadTick] = useState(0);

  const players = useWs((s) => s.players);
  const metrics = useWs((s) => s.metrics);
  const phase = useWs((s) => s.phase);
  const send = useWs((s) => s.send);

  const isRunning = phase.kind === "running";

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
    if (!isRunning) return;
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
        <ViewToggle view={view} onChange={setView} />
      </div>

      {/* Portrait phones stack the QR over the camera. Landscape phones and
          md+ desktops split side by side: half the screen each is how two
          players actually use this in person, kneeling opposite each other
          or holding the phone sideways. */}
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
              {!isRunning && (
                /* The 70% black scrim already dims the camera enough to read
                   the status text above the live video. DESIGN.md scopes
                   backdrop-blur to the sticky CTA bar; on a video tile it
                   would only be cosmetic, so it's gone. */
                <div
                  aria-live="polite"
                  className={cn(
                    "absolute inset-0 flex flex-col items-center justify-center gap-1.5",
                    "bg-black/70 text-center text-white",
                  )}
                >
                  <span className="text-[11px] font-extrabold uppercase tracking-[0.18em]">
                    {phase.kind === "paused" ? "一時停止中" : "開始待ち"}
                  </span>
                  <span className="text-xs font-medium text-white/80">
                    ホストの操作を待っています
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Score panel lives below the play area as a collapsed disclosure.
          Players spend most of the match on QR + camera; the score is glanced
          at, not stared at. Keeping it closed by default reclaims the vertical
          space the QR/camera tiles need on portrait phones. */}
      {metrics.length > 0 && (
        <details className="group rounded-[var(--radius-lg)] bg-card text-card-foreground shadow-[var(--shadow-card)] dark:border dark:border-white/10 dark:bg-white/[0.04] dark:shadow-none">
          <summary
            className={cn(
              "flex cursor-pointer list-none items-center justify-between gap-2 px-5 py-3",
              "text-sm font-extrabold uppercase tracking-[0.14em] text-muted-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
              "[&::-webkit-details-marker]:hidden",
            )}
          >
            <span>自分のスコア</span>
            <ChevronDown
              aria-hidden
              size={14}
              className="transition-transform duration-150 group-open:rotate-180"
            />
          </summary>
          <div className="px-5 pb-4">
            <MetricsPanel metrics={metrics} players={players} selfId={playerId} />
          </div>
        </details>
      )}
    </>
  );
}

function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const items: Array<{ key: View; icon: React.ReactNode; label: string }> = [
    { key: "split", icon: <LayoutGrid size={14} />, label: "分割" },
    { key: "qr", icon: <QrCode size={14} />, label: "QR" },
    { key: "scan", icon: <Camera size={14} />, label: "撮影" },
  ];
  /* Segmented control as a group of aria-pressed toggle buttons. The previous
     role="radiogroup" was a broken contract — the ARIA radio pattern expects
     arrow-key navigation and we never wired it up, so screen-reader users
     would land in a radiogroup whose interaction model was tab-and-Enter,
     not arrow-keys. aria-pressed buttons announce as toggle buttons whose
     state changes on activation, which matches what actually happens here. */
  return (
    // biome-ignore lint/a11y/useSemanticElements: <fieldset> is for form-control grouping; this is a segmented toolbar of toggle buttons, so role="group" on a <div> is the correct ARIA fit.
    <div
      role="group"
      aria-label="表示モード"
      className="flex items-center gap-1 rounded-full bg-muted/40 p-1 dark:bg-white/[0.06]"
    >
      {items.map((it) => {
        const active = view === it.key;
        return (
          <button
            key={it.key}
            type="button"
            aria-pressed={active}
            aria-label={it.label}
            onClick={() => onChange(it.key)}
            className={cn(
              "inline-flex h-7 items-center justify-center rounded-full px-2.5 transition-colors duration-150",
              /* PRODUCT.md sets --tap-min: 44px. Coarse pointer (phone in
                 hand, outdoor light, sweaty thumb) needs the 44 floor; mouse
                 stays denser at 28px so the segmented control doesn't bloat
                 the top bar on desktop. */
              "pointer-coarse:h-11 pointer-coarse:px-4",
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
