import * as React from "react";
import { cn } from "./cn";

interface CoffeeBlockProps {
  href?: string;
  title?: string;
  subtitle?: string;
  className?: string;
}

/**
 * The Buy-Me-a-Coffee block from the UDK sister apps. The honey
 * palette is the brand-mark moment in the handheld (light) register
 * and ships verbatim there. In the stage (dark) register we tone the
 * surface down to a deep amber tint so it reads as the same artifact
 * without burning a yellow hole into slate-navy.
 */
export function CoffeeBlock({
  href = "https://buymeacoffee.com/inukai",
  title = "コーヒー1杯で開発者を応援する",
  subtitle = "Buy Me a Coffee へ ↗",
  className,
}: CoffeeBlockProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={cn(
        "flex items-center gap-3.5 mt-1 p-4 rounded-[14px] no-underline",
        "text-[#5a4b1a] dark:text-[oklch(0.92_0.08_92)]",
        "bg-[linear-gradient(135deg,#fffbe6_0%,#ffefa8_100%)]",
        "dark:bg-[linear-gradient(135deg,oklch(0.32_0.04_92)_0%,oklch(0.36_0.07_85)_100%)]",
        "border-[1.5px] border-[#f0d96b] dark:border-[oklch(0.55_0.13_90_/_0.5)]",
        "shadow-[0_4px_14px_rgba(240,217,107,0.25)]",
        "dark:shadow-[0_0_0_1px_oklch(1_0_0_/_0.04),0_8px_20px_oklch(0_0_0_/_0.35)]",
        "transition-transform duration-[80ms] ease-out active:scale-[0.98]",
        "hover:shadow-[0_6px_20px_rgba(240,217,107,0.4)]",
        "dark:hover:shadow-[0_0_0_1px_oklch(1_0_0_/_0.06),0_10px_24px_oklch(0_0_0_/_0.45)]",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "shrink-0 size-10 rounded-full inline-flex items-center justify-center text-[22px]",
          "bg-[#ffdd00] dark:bg-[oklch(0.78_0.16_92)] dark:text-[oklch(0.22_0.05_92)]",
        )}
      >
        ☕
      </span>
      <span className="flex flex-col gap-0.5 min-w-0">
        <span className="text-sm font-extrabold tracking-[0.02em]">{title}</span>
        <span className="text-xs leading-snug text-[#8c7a3b] dark:text-[oklch(0.78_0.06_92)]">
          {subtitle}
        </span>
      </span>
    </a>
  );
}
