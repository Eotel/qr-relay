import { useQrCode } from "../hooks/useQrCode.js";

type Props = {
  payload: unknown;
};

export function QrDisplay({ payload }: Props) {
  const { src, error } = useQrCode(payload);

  if (error) {
    return (
      <div
        role="alert"
        className="m-4 max-w-[80%] rounded-[var(--radius-md)] border border-destructive/40 bg-destructive/10 p-3 text-center text-sm font-bold text-destructive"
      >
        QR を生成できませんでした: {error}
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
