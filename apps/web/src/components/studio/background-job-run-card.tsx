import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { StudioBackgroundJobRun, StudioBackgroundJobRunDetail } from "@/lib/studio";
import {
  formatCompactDateTime,
  formatDuration,
  getBackgroundJobStatusBadgeVariant,
} from "@/lib/studio";

interface BackgroundJobRunCardProps {
  run: StudioBackgroundJobRun;
  selected: boolean;
  expanded: boolean;
  detail: StudioBackgroundJobRunDetail | null | undefined;
  loading: boolean;
  onSelect(): void;
  onToggleExpand(): void;
}

export function BackgroundJobRunCard({
  run,
  selected,
  expanded,
  detail,
  loading,
  onSelect,
  onToggleExpand,
}: BackgroundJobRunCardProps) {
  return (
    <Card
      size="sm"
      className={selected ? "ring-primary/30 bg-primary/5" : undefined}
    >
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <button
              type="button"
              className="text-left text-sm font-medium hover:underline"
              onClick={onSelect}
            >
              {run.jobName}
            </button>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              {run.runId ? <span>Run ID {run.runId}</span> : <span>Inferred run</span>}
              <span>{formatCompactDateTime(run.startedAt)}</span>
              <span>{formatDuration(run.durationMs)}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={getBackgroundJobStatusBadgeVariant(run.status)}>
              {run.status}
            </Badge>
            <Button variant="outline" size="xs" onClick={onToggleExpand}>
              {expanded ? "Hide timeline" : "Show timeline"}
            </Button>
          </div>
        </div>
        {run.outputFields.length > 0 ? (
          <div className="flex flex-wrap gap-2 text-xs">
            {run.outputFields.map((field) => (
              <Badge key={`${run.id}:${field.key}`} variant="outline">
                {field.key}: {field.value}
              </Badge>
            ))}
          </div>
        ) : null}
        {expanded ? (
          <div className="space-y-2 border-t border-border/60 pt-3">
            {loading && !detail ? (
              <div className="text-sm text-muted-foreground">Loading run timeline…</div>
            ) : detail ? (
              detail.timeline.map((event) => (
                <div key={event.id} className="border border-border/60 bg-background/40 p-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    <span>{event.message}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatCompactDateTime(event.timestamp)}
                    </span>
                    {event.status ? (
                      <Badge variant={getBackgroundJobStatusBadgeVariant(event.status)}>
                        {event.status}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {event.step ? <span>Step: {event.step}</span> : null}
                    {event.structuredFields.map((field) => (
                      <span key={`${event.id}:${field.key}`}>
                        {field.key}: {field.value}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-sm text-muted-foreground">No timeline events found for this run.</div>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
