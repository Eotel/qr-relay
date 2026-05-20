import { type VariantProps, cva } from "class-variance-authority";
import type * as React from "react";
import { cn } from "./cn";

const badgeVariants = cva(
  "inline-flex items-center justify-center font-black uppercase select-none",
  {
    variants: {
      variant: {
        /* Step / role badge colors match their CTA. The host role's CTA
           is the teal secondary, so the host STEP pill is teal too; the
           player role's CTA is the terracotta primary, so the player
           STEP pill is terracotta. Pairing the pill with its button is
           the visual contract this layout depends on. */
        host: "bg-secondary text-secondary-foreground",
        player: "bg-primary text-primary-foreground",
        neutral: "bg-muted text-muted-foreground",
        /* Score leader. Team-yellow is register-agnostic gameplay data
           (same value in handheld and stage), so the dark text is hard-
           pinned to a deep amber that reads on the yellow in both modes. */
        leader:
          "bg-[var(--team-yellow)] text-[oklch(0.22_0.05_92)] [text-shadow:0_1px_0_oklch(1_0_0_/_0.25)]",
      },
      size: {
        step: "px-4 py-1 text-base tracking-[0.14em] rounded-full",
        chip: "px-2.5 py-0.5 text-[11px] tracking-[0.12em] rounded-full",
      },
    },
    defaultVariants: { variant: "neutral", size: "chip" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant, size, className }))} {...props} />;
}

export { badgeVariants };
