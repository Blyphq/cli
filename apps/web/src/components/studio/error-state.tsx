import type { ReactNode } from "react";

import { AlertTriangle } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

import { PanelHeader } from "./panel-header";

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
  return (
    <Card
      size={size === "compact" ? "sm" : "default"}
      className="border-destructive/30 bg-destructive/5"
    >
      <PanelHeader
        title={
          <span className="flex min-w-0 items-center gap-2">
          <AlertTriangle className="size-4 text-destructive" />
          {title}
          </span>
        }
        description={description}
        action={action}
      />
      <CardContent className="min-w-0 text-xs text-muted-foreground break-words">
        Studio could not load this section. Check the path, config file, or logs on disk.
      </CardContent>
    </Card>
  );
}
