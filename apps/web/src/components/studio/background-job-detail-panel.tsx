import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { StudioBackgroundJobRunDetail } from "@/lib/studio";
import {
  formatCompactDateTime,
  formatDuration,
  getBackgroundJobStatusBadgeVariant,
} from "@/lib/studio";

import { EmptyState } from "./empty-state";
import { PanelHeader } from "./panel-header";
import { DetailPanelSkeleton, TimelineSkeleton } from "./studio-skeletons";

interface BackgroundJobDetailPanelProps {
  detail: StudioBackgroundJobRunDetail | null | undefined;
  loading?: boolean;
  onAskAi(): void;
}

export function BackgroundJobDetailPanel({
  detail,
  loading = false,
  onAskAi,
}: BackgroundJobDetailPanelProps) {
  if (loading && !detail) {
    return <DetailPanelSkeleton />;
  }

  if (!detail) {
    return (
      <EmptyState
        title="Select a run"
        description="Choose a background job run to inspect its timeline and failure detail."
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <PanelHeader
          title={detail.run.jobName}
          description={`Started ${formatCompactDateTime(detail.run.startedAt)} • Duration ${formatDuration(detail.run.durationMs)}`}
          action={
            detail.run.failure ? (
              <Button variant="secondary" size="xs" onClick={onAskAi}>
                Ask AI
              </Button>
            ) : null
          }
        />
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant={getBackgroundJobStatusBadgeVariant(detail.run.status)}>
              {detail.run.status}
            </Badge>
            {detail.run.runId ? <Badge variant="outline">Run ID {detail.run.runId}</Badge> : null}
            <Badge variant="outline">{detail.run.recordCount} event{detail.run.recordCount === 1 ? "" : "s"}</Badge>
          </div>
          {detail.run.outputFields.length > 0 ? (
            <div className="flex flex-wrap gap-2 text-xs">
              {detail.run.outputFields.map((field) => (
                <Badge key={`${detail.run.id}:${field.key}`} variant="outline">
                  {field.key}: {field.value}
                </Badge>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
      {detail.run.failure ? (
        <Card size="sm">
          <PanelHeader title="Failure detail" />
          <CardContent className="space-y-3">
            <div className="text-sm font-medium">{detail.run.failure.message}</div>
            {detail.run.failure.step ? (
              <div className="text-xs text-muted-foreground">
                Failed step: {detail.run.failure.step}
              </div>
            ) : null}
            {detail.run.failure.stack ? (
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded border border-border/60 bg-muted/20 p-3 font-mono text-[11px] leading-5">
                {detail.run.failure.stack}
              </pre>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
      <Card size="sm">
        <PanelHeader
          title="Timeline"
          description="Chronological event stream for this run."
        />
        <CardContent className="space-y-3">
          {loading && detail.timeline.length === 0 ? <TimelineSkeleton rows={5} /> : null}
          {detail.timeline.length > 0 ? (
            detail.timeline.map((event) => (
              <div key={event.id} className="border border-border/60 bg-background/40 p-3">
                <div className="flex flex-wrap gap-2 text-sm font-medium">
                  <span>{event.message}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatCompactDateTime(event.timestamp)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {event.step ? <span>Step: {event.step}</span> : null}
                  {event.status ? <span>Status: {event.status}</span> : null}
                  {event.structuredFields.map((field) => (
                    <span key={`${event.id}:${field.key}`}>
                      {field.key}: {field.value}
                    </span>
                  ))}
                </div>
              </div>
            ))
          ) : loading ? null : (
            <div className="text-sm text-muted-foreground">No timeline events found for this run.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
