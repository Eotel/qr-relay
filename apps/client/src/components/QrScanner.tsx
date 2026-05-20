import type QrScannerLib from "qr-scanner";
import { useEffect, useRef, useState } from "react";

type Props = {
  onScan: (raw: string) => void;
  paused?: boolean;
};

export function QrScannerView({ onScan, paused = false }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<QrScannerLib | null>(null);
  const lastScanRef = useRef<{ raw: string; at: number } | null>(null);
  const onScanRef = useRef(onScan);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;
    let localScanner: QrScannerLib | null = null;

    (async () => {
      try {
        const { default: QrScannerLib } = await import("qr-scanner");
        if (cancelled) return;
        const scanner = new QrScannerLib(
          video,
          (result) => {
            const now = Date.now();
            const raw = result.data;
            const last = lastScanRef.current;
            if (last && last.raw === raw && now - last.at < 1500) {
              return;
            }
            lastScanRef.current = { raw, at: now };
            onScanRef.current(raw);
          },
          {
            highlightScanRegion: true,
            highlightCodeOutline: true,
            preferredCamera: "environment",
            maxScansPerSecond: 4,
          },
        );
        localScanner = scanner;
        scannerRef.current = scanner;
        await scanner.start();
        if (cancelled) {
          scanner.stop();
          return;
        }
        setReady(true);
      } catch (err) {
        if (cancelled) return;
        setError(
          `カメラを起動できませんでした: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    })();

    return () => {
      cancelled = true;
      if (localScanner) {
        localScanner.stop();
        localScanner.destroy();
      }
      scannerRef.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const scanner = scannerRef.current;
    if (!scanner) return;
    if (paused) scanner.pause();
    else scanner.start().catch(() => {});
  }, [paused, ready]);

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
