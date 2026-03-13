import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";

import { PanelHeader } from "./panel-header";

interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
  size?: "default" | "compact";
}

export function EmptyState({
  title,
  description,
  action,
  size = "default",
}: EmptyStateProps) {
  return (
    <Card size={size === "compact" ? "sm" : "default"} className="border-dashed">
      <PanelHeader title={title} description={description} action={action} className="border-b-0" />
      <CardContent className="min-w-0 text-muted-foreground break-words">
        Studio is ready, but there is nothing to show here yet.
      </CardContent>
    </Card>
  );
}
