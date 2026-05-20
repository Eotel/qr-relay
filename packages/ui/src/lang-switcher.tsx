import * as React from "react";
import { cn } from "./cn";

export const LANGS = [
  { code: "ja", label: "日本語" },
  { code: "en", label: "English" },
  { code: "ko", label: "한국어" },
] as const;

export type Lang = (typeof LANGS)[number]["code"];

interface LangSwitcherProps {
  value: Lang;
  onChange: (lang: Lang) => void;
  className?: string;
}

export function LangSwitcher({ value, onChange, className }: LangSwitcherProps) {
  return (
    /* Segmented buttons with aria-pressed instead of role="radio". ARIA
       radio expects arrow-key navigation; with three buttons that all live
       in the tab order, aria-pressed is the honest contract — the screen
       reader announces "言語 グループ" + each lang as a toggle. */
    // biome-ignore lint/a11y/useSemanticElements: <fieldset> is for form-control grouping; this is a segmented toolbar of toggle buttons, so role="group" on a <div> is the correct ARIA fit.
    <div
      role="group"
      aria-label="言語"
      className={cn(
        "self-center flex gap-1.5 p-1.5 rounded-full",
        "bg-muted/40 dark:bg-white/[0.06]",
        className,
      )}
    >
      {LANGS.map((l) => {
        const active = value === l.code;
        return (
          <button
            key={l.code}
            type="button"
            aria-pressed={active}
            aria-label={l.label}
            onClick={() => onChange(l.code)}
            className={cn(
              "px-3.5 py-1.5 rounded-full text-[13px] font-bold whitespace-nowrap",
              /* PRODUCT.md sets --tap-min: 44px. py-2.5 + text-sm lands at
                 ~40px on coarse pointers; min-h-11 forces the row to clear
                 the floor without spreading the desktop pill (where the
                 base h is ~26px and a mouse cursor doesn't need 44). */
              "pointer-coarse:px-4 pointer-coarse:py-2.5 pointer-coarse:min-h-11 pointer-coarse:text-sm",
              "transition-colors duration-150 ease-out",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
              active
                ? "bg-primary text-primary-foreground"
                : "bg-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {l.label}
          </button>
        );
      })}
    </div>
  );
}
