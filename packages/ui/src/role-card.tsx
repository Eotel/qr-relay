import type * as React from "react";
import { Badge } from "./badge";
import { Button } from "./button";
import { Card } from "./card";
import { cn } from "./cn";

interface RoleCardProps {
  step: number | string;
  stepVariant: "host" | "player" | "neutral";
  icon?: React.ReactNode;
  title: string;
  desc: string;
  ctaLabel: string;
  ctaIcon?: React.ReactNode;
  ctaVariant: "primary" | "host";
  onCtaClick?: () => void;
  className?: string;
  children?: React.ReactNode;
}

/* Role-tinted card borders: the card edge inherits the role's CTA hue
   so the host card frames in teal and the player card frames in
   terracotta. The 2px width overrides Card's default 1px hairline; the
   ~40% opacity keeps the warm cream interior dominant rather than
   turning the card into a colored block. */
const roleBorderClass: Record<RoleCardProps["stepVariant"], string> = {
  host: "border-2 border-secondary/45 dark:border-secondary/50",
  player: "border-2 border-primary/50 dark:border-primary/55",
  neutral: "",
};

export function RoleCard({
  step,
  stepVariant,
  icon,
  title,
  desc,
  ctaLabel,
  ctaIcon,
  ctaVariant,
  onCtaClick,
  className,
  children,
}: RoleCardProps) {
  return (
    <Card className={cn("flex flex-col gap-3 relative", roleBorderClass[stepVariant], className)}>
      <Badge variant={stepVariant} size="step" className="self-start">
        STEP {step}
      </Badge>

      <div className="flex items-center gap-2.5">
        {icon && (
          <span
            aria-hidden
            className="size-9 rounded-full inline-flex items-center justify-center bg-muted/40 text-foreground"
          >
            {icon}
          </span>
        )}
        <h3 className="m-0 text-base font-extrabold tracking-tight">{title}</h3>
      </div>

      <p className="m-0 text-sm leading-[1.65] text-foreground/85">{desc}</p>

      <Button variant={ctaVariant} size="cta" onClick={onCtaClick}>
        {ctaIcon}
        <span>{ctaLabel}</span>
      </Button>

      {children}
    </Card>
  );
}
