import type { ReactNode } from "react";

import { Inbox } from "lucide-react";

import { cn } from "@/lib/utils";

interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
  size?: "default" | "compact";
  icon?: ReactNode;
}

export function EmptyState({
  title,
  description,
  action,
  size = "default",
  icon,
}: EmptyStateProps) {
  const compact = size === "compact";

  return (
    <div
      className={cn(
        "relative isolate flex min-w-0 flex-col items-center overflow-hidden rounded-lg border border-dashed border-border-strong bg-card/60 text-center",
        compact ? "gap-2 px-4 py-6" : "gap-3 px-6 py-12",
      )}
    >
      <div
        aria-hidden
        className="blyp-dot-grid pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)] opacity-70"
      />
      <span
        className={cn(
          "grid place-items-center rounded-md border border-border bg-card text-muted-foreground shadow-xs",
          compact ? "size-8 [&>svg]:size-4" : "size-10 [&>svg]:size-[18px]",
        )}
      >
        {icon ?? <Inbox />}
      </span>
      <div className="max-w-md space-y-1">
        <div
          className={cn(
            "font-heading font-semibold tracking-[-0.02em] text-foreground",
            compact ? "text-[0.85rem]" : "text-[0.95rem]",
          )}
        >
          {title}
        </div>
        <p className="text-pretty text-[0.75rem] leading-relaxed text-muted-foreground break-words">
          {description}
        </p>
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
