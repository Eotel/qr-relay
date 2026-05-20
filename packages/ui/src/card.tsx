import * as React from "react";
import { cn } from "./cn";

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-[var(--radius-lg)] bg-card text-card-foreground p-5",
        // Handheld register: a 1px warm-sand hairline plus the soft
        // accent-tinted drop shadow. Border + shadow together so the
        // card edge reads on cream paper without forcing the shadow
        // darker; either alone reads as half-finished.
        // The `border-border` resolves automatically per register —
        // --border in the .dark block is already `oklch(1 0 0 / 0.1)`,
        // so the dark hairline ships without a duplicate dark: override.
        "border border-border shadow-[var(--shadow-card)]",
        // Stage register: drop the soft drop-shadow and switch the surface
        // to a translucent white panel so the main background (or the
        // token-holder primary tint) bleeds through, matching Multi Eyes'
        // .landing-role.
        "dark:bg-white/[0.04] dark:shadow-none",
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = "Card";
