import QRCode from "qrcode";
import { useEffect, useState } from "react";

type Props = {
  payload: unknown;
};

export function QrDisplay({ payload }: Props) {
  const [src, setSrc] = useState<string>("");
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const text = typeof payload === "string" ? payload : JSON.stringify(payload);
    QRCode.toString(text, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 1,
      /* QR contrast is a functional constraint of the decoder, not a
         theming choice. Pure black/white is correct here. */
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then((svg) => {
        if (cancelled) return;
        setSrc(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
        setRenderError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setRenderError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [payload]);

  if (renderError) {
    return (
      <div
        role="alert"
        className="m-4 max-w-[80%] rounded-[var(--radius-md)] border border-destructive/40 bg-destructive/10 p-3 text-center text-sm font-bold text-destructive"
      >
        QR を生成できませんでした: {renderError}
      </div>
    );
  }

  if (!src) return null;
  return (
    <img
      src={src}
      alt="自分の QR コード"
      className="block aspect-square h-[90%] max-h-[90%] max-w-[90%]"
    />
  );
}
