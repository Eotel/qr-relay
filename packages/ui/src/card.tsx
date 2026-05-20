import * as React from "react";
import { cn } from "./cn";

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-[var(--radius-lg)] bg-card text-card-foreground p-5",
        "shadow-[var(--shadow-card)]",
        // Stage register: drop the soft drop-shadow and use a 1px hairline
        // on a translucent panel, matching Multi Eyes' .landing-role.
        "dark:bg-white/[0.04] dark:shadow-none dark:border dark:border-white/10",
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = "Card";
