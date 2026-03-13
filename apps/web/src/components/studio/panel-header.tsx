import type { ReactNode } from "react";

import { CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    <CardHeader className={cn("min-w-0 border-b border-border/60", className)}>
      <CardTitle className="min-w-0">{title}</CardTitle>
      {description ? (
        <CardDescription className="min-w-0 break-words">
          {description}
        </CardDescription>
      ) : null}
      {action ? <CardAction>{action}</CardAction> : null}
    </CardHeader>
  );
}
