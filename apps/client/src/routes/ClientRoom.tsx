import { ScanPayloadV1 } from "@qr-relay/core";
import { cn } from "@qr-relay/ui/cn";
import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { QrDisplay } from "../components/QrDisplay.js";
import { QrScannerView } from "../components/QrScanner.js";
import { RoomSettingsFab, RoomSettingsOverlay } from "../components/client/RoomSettingsOverlay.js";
import { resolveNickname } from "../lib/nickname.js";
import { useWs } from "../lib/ws.js";
import type { RoomOutletContext } from "./RoomLayout.js";

const tileFrame =
  "relative flex aspect-square w-full max-h-full items-center justify-center overflow-hidden rounded-[var(--radius-lg)] shadow-[var(--shadow-card)] dark:shadow-none";

function nonce(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function ClientRoom() {
  const { playerId, code, playerName, onRename, clientView } =
    useOutletContext<RoomOutletContext>();
  const [payloadTick, setPayloadTick] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const players = useWs((s) => s.players);
  const phase = useWs((s) => s.phase);
  const send = useWs((s) => s.send);

  const handleRename = (next: string) => {
    // Collision resolution happens here, not inside the overlay, so the overlay
    // stays pure-props and the rules live next to the players selector.
    const resolved = resolveNickname({ input: next, selfId: playerId, players });
    onRename(resolved);
  };

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

  const showQr = clientView !== "scan";
  const showScanner = clientView !== "qr";

  return (
    <>
      {/* No in-route header: RoomLayout's single-row chrome already owns the
          room code, nav tabs, and the split/qr/scan toggle. Player chips moved
          to /scoreboard where the audience reads them — they didn't earn the
          vertical footprint here. */}

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

      {/* Score lives entirely on the /scoreboard tab. The play area is locked
          to the viewport (RoomLayout uses h-dvh + overflow-hidden for client
          role) so the QR and camera tiles stay visible at all times — putting
          a collapsible score panel below them would either push the play
          area off-screen on open or cramp it permanently when closed. */}

      <RoomSettingsFab onClick={() => setSettingsOpen(true)} />
      <RoomSettingsOverlay
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        code={code}
        playerName={playerName}
        onRename={handleRename}
      />
    </>
  );
}
