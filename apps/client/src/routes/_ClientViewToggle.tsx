import { cn } from "@qr-relay/ui/cn";
import { Camera, LayoutGrid, QrCode } from "lucide-react";

export type ClientView = "split" | "qr" | "scan";

/**
 * Segmented control for the QR/camera split mode in ClientRoom. Hosted in the
 * RoomLayout header so the player gets a single-row chrome strip — the previous
 * design put this on its own second row inside ClientRoom, which doubled the
 * header's vertical footprint and ate into the play tiles. State lives in
 * RoomLayout and reaches ClientRoom via outlet context.
 *
 * Why aria-pressed buttons instead of a radiogroup: the radio ARIA pattern
 * promises arrow-key navigation which this control never implemented, so SR
 * users got a misleading contract. Toggle buttons announce as exactly what
 * they are — three independent press-states with a single active one.
 */
export function ClientViewToggle({
  view,
  onChange,
}: {
  view: ClientView;
  onChange: (v: ClientView) => void;
}) {
  const items: Array<{ key: ClientView; icon: React.ReactNode; label: string }> = [
    { key: "split", icon: <LayoutGrid size={14} />, label: "分割" },
    { key: "qr", icon: <QrCode size={14} />, label: "QR" },
    { key: "scan", icon: <Camera size={14} />, label: "撮影" },
  ];
  return (
    // biome-ignore lint/a11y/useSemanticElements: <fieldset> is for form-control grouping; this is a segmented toolbar of toggle buttons, so role="group" on a <div> is the correct ARIA fit.
    <div
      role="group"
      aria-label="表示モード"
      className="flex shrink-0 items-center gap-1 rounded-full bg-muted/40 p-1 dark:bg-white/[0.06]"
    >
      {items.map((it) => {
        const active = view === it.key;
        return (
          <button
            key={it.key}
            type="button"
            aria-pressed={active}
            aria-label={it.label}
            onClick={() => onChange(it.key)}
            className={cn(
              "inline-flex h-7 items-center justify-center rounded-full px-2 transition-colors duration-150 md:px-2.5",
              // PRODUCT.md sets --tap-min: 44px. Coarse pointer (phone in
              // hand, outdoor light, sweaty thumb) needs the 44 floor;
              // mouse stays denser at 28px so the segmented control doesn't
              // bloat the top bar on desktop.
              "pointer-coarse:h-11 pointer-coarse:px-3.5",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
              active
                ? "bg-primary text-primary-foreground"
                : "bg-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {it.icon}
          </button>
        );
      })}
    </div>
  );
}
