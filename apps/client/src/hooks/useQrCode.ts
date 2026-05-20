import QRCode from "qrcode";
import { useEffect, useState } from "react";

export type QrGenerator = (text: string) => Promise<string>;

const defaultGenerator: QrGenerator = (text) =>
  QRCode.toString(text, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    color: { dark: "#000000", light: "#ffffff" },
  });

export type UseQrCodeResult = {
  src: string;
  error: string | null;
};

export function useQrCode(
  payload: unknown,
  generator: QrGenerator = defaultGenerator,
): UseQrCodeResult {
  const [src, setSrc] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const text = typeof payload === "string" ? payload : JSON.stringify(payload);
    generator(text)
      .then((svg) => {
        if (cancelled) return;
        setSrc(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [payload, generator]);

  return { src, error };
}
