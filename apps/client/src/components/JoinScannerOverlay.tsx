import { Button } from "@qr-relay/ui/button";
import { X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { parseJoinPayload } from "../lib/join-url.js";
import { useQrScanner } from "../hooks/useQrScanner.js";

type Props = {
  open: boolean;
  onClose: () => void;
  onJoin: (code: string) => void;
};

export function JoinScannerOverlay({ open, onClose, onJoin }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const handleScan = useCallback(
    (raw: string) => {
      const code = parseJoinPayload(raw);
      if (!code) {
        setLastError("参加用 QR ではないようです。もう一度ホスト画面の QR を読み取ってください。");
        return;
      }
      setLastError(null);
      onJoin(code);
    },
    [onJoin],
  );

  const { error: cameraError } = useQrScanner(videoRef, handleScan, { paused: !open });

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="参加用 QR をスキャン"
      className="fixed inset-0 z-50 flex flex-col bg-black/95 text-white"
    >
      <div className="flex items-center justify-between gap-2 px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-2">
        <h2 className="text-base font-extrabold tracking-tight">参加用 QR をスキャン</h2>
        <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="閉じる">
          <X size={20} />
        </Button>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-cover"
        />
        {cameraError && (
          <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-[var(--radius-md)] bg-destructive/90 p-3 text-center text-sm font-bold text-destructive-foreground">
            {cameraError} 下の入力欄からコードを入力して参加してください。
          </div>
        )}
        {lastError && !cameraError && (
          <div className="absolute inset-x-4 bottom-6 rounded-[var(--radius-md)] bg-white/95 p-3 text-center text-sm font-bold text-foreground">
            {lastError}
          </div>
        )}
      </div>
    </div>
  );
}
