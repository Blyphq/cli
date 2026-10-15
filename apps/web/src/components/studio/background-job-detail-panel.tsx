import type { ReactNode } from "react";

import { Sparkles, TriangleAlert, Workflow } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { StudioBackgroundJobRunDetail } from "@/lib/studio";
import {
  formatCompactDateTime,
  formatDuration,
  getBackgroundJobStatusBadgeVariant,
} from "@/lib/studio";

import {
  BackgroundJobTimeline,
  formatJobStatus,
  getRunAttempt,
} from "./background-job-run-card";
import { EmptyState } from "./empty-state";
import { PanelHeader } from "./panel-header";
import { MonoChip } from "./studio-primitives";
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
        icon={<Workflow />}
        title="Select a run"
        description="Choose a background job run to inspect its timeline and failure detail."
      />
    );
  }

  const { run } = detail;
  const attempt = getRunAttempt(run);
  const metrics: Array<{ label: string; value: ReactNode }> = [
    { label: "Started", value: formatCompactDateTime(run.startedAt) },
    { label: "Duration", value: formatDuration(run.durationMs) },
    { label: "Events", value: run.recordCount },
    { label: "Attempt", value: attempt ?? "n/a" },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card className="min-w-0 gap-0 py-0">
        <div className="flex min-w-0 items-start gap-3 px-4 py-3.5">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <Badge variant={getBackgroundJobStatusBadgeVariant(run.status)}>
                {formatJobStatus(run.status)}
              </Badge>
              {attempt !== null && attempt > 1 ? (
                <MonoChip className="bg-level-warn/12 text-level-warn">
                  {attempt - 1} retr{attempt - 1 === 1 ? "y" : "ies"}
                </MonoChip>
              ) : null}
            </div>
            <h3 className="font-heading text-[0.98rem] leading-snug font-semibold tracking-[-0.025em] break-words text-foreground">
              {run.jobName}
            </h3>
            <p className="truncate font-mono text-[0.68rem] text-muted-foreground/80">
              {run.runId ? `run ${run.runId}` : "Inferred run"}
            </p>
          </div>
          {run.failure ? (
            <Button variant="outline" size="xs" className="shrink-0" onClick={onAskAi}>
              <Sparkles aria-hidden />
              Ask AI
            </Button>
          ) : null}
        </div>
        <dl className="grid grid-cols-2 gap-px border-t border-border bg-border">
          {metrics.map((metric) => (
            <div key={metric.label} className="min-w-0 bg-card px-4 py-2.5">
              <dt className="text-[0.7rem] text-muted-foreground">{metric.label}</dt>
              <dd className="mt-0.5 truncate font-mono text-[0.78rem] tabular-nums text-foreground">
                {metric.value}
              </dd>
            </div>
          ))}
        </dl>
        {run.outputFields.length > 0 ? (
          <div className="flex min-w-0 flex-wrap gap-1.5 border-t border-border px-4 py-2.5">
            {run.outputFields.map((field) => (
              <MonoChip key={`${run.id}:${field.key}`} title={`${field.key}: ${field.value}`}>
                {field.key}={field.value}
              </MonoChip>
            ))}
          </div>
        ) : null}
      </Card>

      {run.failure ? (
        <section className="min-w-0 overflow-hidden rounded-lg border border-level-error/30 bg-level-error/[0.06]">
          <div className="flex min-w-0 items-center gap-2 border-b border-level-error/20 px-4 py-2.5">
            <TriangleAlert aria-hidden className="size-3.5 shrink-0 text-level-error" />
            <h3 className="font-heading text-[0.85rem] font-semibold tracking-[-0.02em] text-foreground">
              Failure detail
            </h3>
          </div>
          <div className="min-w-0 space-y-2.5 px-4 py-3">
            <p className="text-[0.8rem] leading-relaxed font-medium break-words text-level-error">
              {run.failure.message}
            </p>
            {run.failure.step ? (
              <MonoChip className="bg-card/70 text-foreground">Failed step: {run.failure.step}</MonoChip>
            ) : null}
            {run.failure.stack ? (
              <pre className="max-h-96 overflow-auto rounded-md bg-muted/50 px-3 py-2.5 font-mono text-[0.7rem] leading-5 whitespace-pre-wrap break-words text-foreground/90">
                {run.failure.stack}
              </pre>
            ) : null}
          </div>
        </section>
      ) : null}

      <Card size="sm" className="min-w-0 gap-0 py-0">
        <PanelHeader
          className="py-3"
          title="Timeline"
          description="Chronological event stream for this run."
          action={
            <span className="font-mono text-[0.7rem] tabular-nums text-muted-foreground">
              {detail.timeline.length} event{detail.timeline.length === 1 ? "" : "s"}
            </span>
          }
        />
        <div className="min-w-0 px-4 py-3">
          {loading && detail.timeline.length === 0 ? <TimelineSkeleton rows={5} /> : null}
          {detail.timeline.length > 0 ? (
            <BackgroundJobTimeline
              events={detail.timeline}
              runStartedAt={run.startedAt}
              runStatus={run.status}
            />
          ) : loading ? null : (
            <p className="text-[0.78rem] text-muted-foreground">
              No timeline events found for this run.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
