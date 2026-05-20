import type * as React from "react";
import { cn } from "./cn";

interface AppTitleProps {
  main: string;
  sub?: React.ReactNode;
  align?: "left" | "center";
  className?: string;
}

export function AppTitle({ main, sub, align = "center", className }: AppTitleProps) {
  return (
    <div
      className={cn(
        "flex flex-col leading-[1.05] gap-1",
        align === "center" ? "items-center text-center" : "items-start text-left",
        className,
      )}
    >
      <span className="text-[22px] font-black tracking-[0.02em] sm:text-[26px]">{main}</span>
      {sub && (
        <span className="text-[11px] font-semibold italic tracking-[0.06em] text-muted-foreground">
          {sub}
        </span>
      )}
    </div>
  );
}
