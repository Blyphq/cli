import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatRelativeTime, type StudioOverview } from "@/lib/studio";

import { EmptyState } from "./empty-state";
import { PanelHeader } from "./panel-header";

interface OverviewRecentErrorsProps {
  items: StudioOverview["recentErrors"];
  onAskAi(item: StudioOverview["recentErrors"][number]): void;
  onViewTrace(item: StudioOverview["recentErrors"][number]): void;
}

export function OverviewRecentErrors({
  items,
  onAskAi,
  onViewTrace,
}: OverviewRecentErrorsProps) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="Recent errors"
        description="No recent errors matched the current overview scope."
      />
    );
  }

  return (
    <Card size="sm">
      <PanelHeader
        title="Recent errors"
        description="The latest five error groups in the current overview scope."
      />
      <CardContent className="space-y-4 pt-4">
        {items.map((item) => (
          <div
            key={item.groupId}
            className="space-y-3 border border-border/60 bg-background/40 p-4"
          >
            <div className="line-clamp-2 break-words text-sm font-medium leading-6">
              {item.message}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              <span>{formatRelativeTime(item.timestamp)}</span>
              {item.sourceFile ? (
                <span>
                  {item.sourceFile}:{item.sourceLine ?? "?"}
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button variant="outline" size="xs" onClick={() => onViewTrace(item)}>
                View trace
                <ArrowRight />
              </Button>
              <Button variant="secondary" size="xs" onClick={() => onAskAi(item)}>
                Ask AI
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
