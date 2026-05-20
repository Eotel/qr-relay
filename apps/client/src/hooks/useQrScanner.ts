import { type RefObject, useEffect, useRef, useState } from "react";

export type ScannerInstance = {
  start: () => Promise<void>;
  stop: () => void;
  pause: () => void;
  destroy: () => void;
};

export type ScannerFactory = (
  video: HTMLVideoElement,
  onResult: (raw: string) => void,
) => Promise<ScannerInstance>;

const DEDUP_WINDOW_MS = 1500;

const defaultFactory: ScannerFactory = async (video, onResult) => {
  const { default: QrScannerLib } = await import("qr-scanner");
  const scanner = new QrScannerLib(video, (result) => onResult(result.data), {
    highlightScanRegion: true,
    highlightCodeOutline: true,
    preferredCamera: "environment",
    maxScansPerSecond: 4,
  });
  return {
    start: () => scanner.start(),
    stop: () => scanner.stop(),
    pause: () => scanner.pause(),
    destroy: () => scanner.destroy(),
  };
};

export type UseQrScannerOptions = {
  paused?: boolean;
  factory?: ScannerFactory;
};

export type UseQrScannerResult = {
  ready: boolean;
  error: string | null;
};

export function useQrScanner(
  videoRef: RefObject<HTMLVideoElement | null>,
  onScan: (raw: string) => void,
  { paused = false, factory = defaultFactory }: UseQrScannerOptions = {},
): UseQrScannerResult {
  const scannerRef = useRef<ScannerInstance | null>(null);
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
    let local: ScannerInstance | null = null;

    (async () => {
      try {
        const scanner = await factory(video, (raw) => {
          const now = Date.now();
          const last = lastScanRef.current;
          if (last && last.raw === raw && now - last.at < DEDUP_WINDOW_MS) return;
          lastScanRef.current = { raw, at: now };
          onScanRef.current(raw);
        });
        if (cancelled) {
          scanner.destroy();
          return;
        }
        local = scanner;
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
      if (local) {
        local.stop();
        local.destroy();
      }
      scannerRef.current = null;
      setReady(false);
    };
  }, [videoRef, factory]);

  useEffect(() => {
    if (!ready) return;
    const scanner = scannerRef.current;
    if (!scanner) return;
    if (paused) scanner.pause();
    else scanner.start().catch(() => {});
  }, [paused, ready]);

  return { ready, error };
}
