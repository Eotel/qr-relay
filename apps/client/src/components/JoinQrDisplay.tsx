import { useQrCode } from "../hooks/useQrCode.js";

type Props = {
  code: string;
};

export function joinUrlFor(code: string, origin?: string): string {
  const base =
    origin ?? (typeof window !== "undefined" ? window.location.origin : "https://qr-relay.local");
  return new URL(`/r/${encodeURIComponent(code)}`, base).toString();
}

export function JoinQrDisplay({ code }: Props) {
  const url = joinUrlFor(code);
  const { src, error } = useQrCode(url);

  if (error) {
    return (
      <div
        role="alert"
        className="m-4 max-w-[80%] rounded-[var(--radius-md)] border border-destructive/40 bg-destructive/10 p-3 text-center text-sm font-bold text-destructive"
      >
        参加用 QR を生成できませんでした: {error}
      </div>
    );
  }

  if (!src) return null;
  return (
    <img
      src={src}
      alt="参加用 QR コード"
      data-testid="join-qr"
      data-join-url={url}
      className="block aspect-square h-[90%] max-h-[90%] max-w-[90%]"
    />
  );
}
