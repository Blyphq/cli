import type * as React from "react";

import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex h-5 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-[4px] border px-1.5 font-mono text-[0.62rem] font-medium uppercase leading-none tracking-[0.06em] tabular-nums transition-colors [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary-soft text-primary-soft-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        muted: "border-transparent bg-muted text-muted-foreground",
        outline: "border-border-strong bg-transparent text-foreground/80",
        destructive: "border-transparent bg-level-error/12 text-level-error",
        info: "border-transparent bg-level-info/12 text-level-info",
        success: "border-transparent bg-level-ok/12 text-level-ok",
        warning: "border-transparent bg-level-warn/12 text-level-warn",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
