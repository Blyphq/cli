import type { ReactNode } from "react";

import {
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface PanelHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function PanelHeader({
  title,
  description,
  action,
  className,
}: PanelHeaderProps) {
  return (
    <CardHeader
      className={cn("flex w-full min-w-0 flex-col gap-1 border-b border-border", className)}
    >
      <div className="flex w-full min-w-0 items-center gap-2">
        <CardTitle className="min-w-0 flex-1">{title}</CardTitle>
        {action ? <CardAction className="flex shrink-0 items-center gap-1.5">{action}</CardAction> : null}
      </div>
      {description ? (
        <CardDescription className="w-full min-w-0 text-[0.75rem] leading-relaxed break-words">
          {description}
        </CardDescription>
      ) : null}
    </CardHeader>
  );
}
