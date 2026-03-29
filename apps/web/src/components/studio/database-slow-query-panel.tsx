import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { StudioDatabaseQueryEvent } from "@/lib/studio";
import { formatDurationMs, getDurationClasses } from "@/lib/studio";
import { cn } from "@/lib/utils";

import { EmptyState } from "./empty-state";
import { PanelHeader } from "./panel-header";

interface DatabaseSlowQueryPanelProps {
  queries: StudioDatabaseQueryEvent[];
  onSelectRecord(recordId: string): void;
  onAskAi(query: StudioDatabaseQueryEvent): void;
}

export function DatabaseSlowQueryPanel({
  queries,
  onSelectRecord,
  onAskAi,
}: DatabaseSlowQueryPanelProps) {
  if (queries.length === 0) {
    return (
      <EmptyState
        title="No slow queries detected"
        description="Queries above the 100ms threshold will appear here."
        size="compact"
      />
    );
  }

  return (
    <Card>
      <PanelHeader
        title="Slow queries"
        description="Queries slower than 100ms, sorted slowest first."
      />
      <CardContent className="space-y-3">
        {queries.map((query) => (
          <div key={query.id} className="rounded-lg border border-border/60 bg-background/40 p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{query.operation}</span>
                  <Badge variant="outline">{query.modelOrTable ?? "Unknown"}</Badge>
                  <span className={cn("text-sm font-medium", getDurationClasses(query.durationMs))}>
                    {formatDurationMs(query.durationMs)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {query.requestId ? <span>Request {query.requestId}</span> : null}
                  {query.traceId ? <span>Trace {query.traceId}</span> : null}
                  {query.adapter ? <span>{query.adapter}</span> : null}
                </div>
                {query.durationBreakdown ? (
                  <div className="text-xs text-muted-foreground">
                    {Object.entries(query.durationBreakdown)
                      .map(([key, value]) => `${key}: ${formatDurationMs(value)}`)
                      .join(" - ")}
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => onSelectRecord(query.recordId)}>
                  Select record
                </Button>
                <Button variant="secondary" size="sm" onClick={() => onAskAi(query)}>
                  Ask AI
                </Button>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
