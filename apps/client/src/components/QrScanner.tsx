import { useRef } from "react";
import { useQrScanner } from "../hooks/useQrScanner.js";

type Props = {
  onScan: (raw: string) => void;
  paused?: boolean;
};

export function QrScannerView({ onScan, paused = false }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const { error } = useQrScanner(videoRef, onScan, { paused });

  return (
    <>
      <video ref={videoRef} playsInline muted className="h-full w-full object-contain" />
      {error && (
        <div className="absolute inset-3 flex items-center justify-center rounded-[var(--radius-md)] border border-destructive/60 bg-destructive/20 p-3 text-center text-sm font-bold text-destructive-foreground">
          {error}
        </div>
      )}
    </>
  );
}
