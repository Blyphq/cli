import type { ReactNode } from "react";

import { AlertTriangle } from "lucide-react";

import { cn } from "@/lib/utils";

interface ErrorStateProps {
  title: string;
  description: string;
  action?: ReactNode;
  size?: "default" | "compact";
}

export function ErrorState({
  title,
  description,
  action,
  size = "default",
}: ErrorStateProps) {
  const compact = size === "compact";

  return (
    <div
      role="alert"
      className={cn(
        "flex min-w-0 gap-3 rounded-lg border border-level-error/30 bg-level-error/[0.06]",
        compact ? "p-3" : "p-4",
      )}
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-level-error/12 text-level-error">
        <AlertTriangle className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="font-heading text-[0.85rem] font-semibold tracking-[-0.02em] text-foreground">
            {title}
          </div>
          {action}
        </div>
        <p className="font-mono text-[0.72rem] leading-relaxed text-level-error/90 break-words">
          {description}
        </p>
        {!compact ? (
          <p className="text-[0.72rem] text-muted-foreground">
            Studio could not load this section. Check the path, config file, or logs on disk.
          </p>
        ) : null}
      </div>
    </div>
  );
}
