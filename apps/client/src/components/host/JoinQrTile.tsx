import { cn } from "@qr-relay/ui/cn";
import { JoinQrDisplay, joinUrlFor } from "../JoinQrDisplay.js";

type Props = {
  code: string;
  /**
   * `featured` is the waiting layout: a large scannable square with the join
   * URL below. The room code itself is **not** rendered here — Hero owns it
   * in waiting so the audience doesn't see two giant copies of the same
   * string.
   *
   * `compact` is the play layout: a small QR for late joiners. Room code
   * lives in the header chip; this tile is just a scannable square.
   */
  variant: "compact" | "featured";
};

/**
 * QR tile for the stage dashboard. Stays present during play in the
 * compact form so a late joiner can still walk up and scan; M5 may revisit
 * whether to hide it entirely after start (see plan §Decision Log).
 */
export function JoinQrTile({ code, variant }: Props) {
  const url = joinUrlFor(code);
  return (
    <section
      aria-label="参加 QR"
      className={cn(
        "flex h-full min-h-0 flex-col items-center justify-center gap-2 overflow-hidden rounded-[var(--radius-lg)]",
        "border border-white/10 bg-white/[0.04] p-3 text-center",
        variant === "featured" && "p-5",
      )}
    >
      <span
        className={cn(
          "text-[11px] font-extrabold uppercase tracking-[0.22em] text-muted-foreground",
          variant === "featured" && "text-[clamp(14px,1.2vw,22px)] tracking-[0.26em]",
        )}
      >
        JOIN
      </span>
      <div
        className={cn(
          "relative flex aspect-square items-center justify-center overflow-hidden rounded-[var(--radius-md)] bg-white",
          variant === "featured"
            ? "h-[min(72%,640px)] w-auto max-w-full"
            : "h-[min(100%,160px)] w-auto max-w-full",
        )}
      >
        <JoinQrDisplay code={code} />
      </div>
      {variant === "featured" && (
        <p className="m-0 break-all px-2 text-[clamp(12px,1.1vw,18px)] font-medium text-muted-foreground">
          {url}
        </p>
      )}
    </section>
  );
}
