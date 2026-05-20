import { Slot } from "@radix-ui/react-slot";
import { type VariantProps, cva } from "class-variance-authority";
import * as React from "react";
import { cn } from "./cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-extrabold " +
    "tracking-wide transition-transform duration-[80ms] ease-out active:scale-[0.97] " +
    "disabled:opacity-50 disabled:cursor-not-allowed " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground shadow-[var(--shadow-cta-primary)]",
        host: "bg-secondary text-secondary-foreground shadow-[var(--shadow-cta-secondary)]",
        outline: "border-2 border-border bg-transparent text-foreground hover:bg-muted/30",
        ghost: "bg-transparent text-muted-foreground hover:bg-muted/40",
      },
      size: {
        cta: "w-full h-12 px-4 text-base rounded-[var(--radius-md)]",
        submit: "h-11 px-4 text-sm rounded-[var(--radius-md)]",
        pill: "h-8 px-3.5 text-[13px] rounded-full",
        icon: "size-11 rounded-[var(--radius-md)]",
      },
    },
    defaultVariants: { variant: "primary", size: "cta" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
