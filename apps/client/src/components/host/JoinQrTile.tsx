import { cn } from "@qr-relay/ui/cn";
import { JoinQrDisplay, joinUrlFor } from "../JoinQrDisplay.js";

type Props = {
  code: string;
  /**
   * When `compact`, the tile renders the QR plus the room code in a
   * dashboard cell sized for play-time. When `featured`, it occupies a
   * bigger cell (waiting state) with larger glyphs.
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
        "flex h-full min-h-0 flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)]",
        "border border-white/10 bg-white/[0.04] p-3 text-center",
      )}
    >
      <span
        className={cn(
          "text-[11px] font-extrabold uppercase tracking-[0.22em] text-muted-foreground",
          variant === "featured" && "text-[13px] tracking-[0.26em]",
        )}
      >
        JOIN
      </span>
      <strong
        className={cn(
          "font-black leading-none tracking-[0.18em]",
          variant === "featured" ? "text-[clamp(40px,6vw,96px)]" : "text-[clamp(20px,2.6vw,40px)]",
        )}
      >
        {code}
      </strong>
      <div
        className={cn(
          "relative flex aspect-square items-center justify-center overflow-hidden rounded-[var(--radius-md)] bg-white",
          variant === "featured" ? "w-[min(60vmin,520px)]" : "h-[min(100%,180px)] w-auto max-w-full",
        )}
      >
        <JoinQrDisplay code={code} />
      </div>
      {variant === "featured" && (
        <p className="m-0 break-all px-2 text-[12px] font-medium text-muted-foreground">{url}</p>
      )}
    </section>
  );
}
