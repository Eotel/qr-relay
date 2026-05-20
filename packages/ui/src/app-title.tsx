import type * as React from "react";
import { cn } from "./cn";

type HeadingLevel = "h1" | "h2" | "h3";

interface AppTitleProps {
  main: string;
  sub?: React.ReactNode;
  align?: "left" | "center";
  /* Semantic level of the page title. Defaults to h1 because AppTitle is the
     top-of-page heading on Home and NewRoom; pages that put another heading
     above it can downshift. The visual styling stays identical across levels
     — the spec leans on font-weight + tracking, not type size, for hierarchy. */
  level?: HeadingLevel;
  className?: string;
}

export function AppTitle({ main, sub, align = "center", level = "h1", className }: AppTitleProps) {
  const Heading = level;
  return (
    <div
      className={cn(
        "flex flex-col leading-[1.05] gap-1",
        align === "center" ? "items-center text-center" : "items-start text-left",
        className,
      )}
    >
      <Heading className="m-0 text-[22px] font-black tracking-[0.02em] sm:text-[26px]">
        {main}
      </Heading>
      {sub && (
        /* Subtitle reads as "small spaced body": 11px, weight 500
           (the body weight from DESIGN.md's typography table), 0.06em
           tracking to sit between body (0em) and label (0.14em), and
           --muted-foreground so it recedes behind the heading without
           leaning on italic. Earlier this slot used italic + 600, which
           was the only italic and the only non-table weight in the app;
           the system already differentiates the subtitle through size,
           color, and tracking, so the italic wasn't earning its place. */
        <span className="text-[11px] font-medium tracking-[0.06em] text-muted-foreground">
          {sub}
        </span>
      )}
    </div>
  );
}
