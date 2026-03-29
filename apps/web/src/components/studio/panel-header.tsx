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
      className={cn("min-w-0 border-b border-border/60 w-full flex flex-col gap-2", className)}
    >
      <div className="flex items-center gap-2">
        <CardTitle className="min-w-0">{title}</CardTitle>
        {action ? <CardAction>{action}</CardAction> : null}
      </div>
      {description ? (
        <CardDescription className="min-w-0 w-full break-words">
          {description}
        </CardDescription>
      ) : null}
    </CardHeader>
  );
}
