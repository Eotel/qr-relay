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
    <div
      role="radiogroup"
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
            // biome-ignore lint/a11y/useSemanticElements: styled segmented pill is intentional; semantics carried via role+aria-checked
            role="radio"
            aria-checked={active}
            onClick={() => onChange(l.code)}
            className={cn(
              "px-3.5 py-1.5 rounded-full text-[13px] font-bold whitespace-nowrap",
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
