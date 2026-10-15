import { ChevronDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  StudioBackgroundJobRun,
  StudioBackgroundJobRunDetail,
  StudioBackgroundJobTimelineEvent,
} from "@/lib/studio";
import {
  formatCompactDateTime,
  formatDateTime,
  formatDuration,
  getBackgroundJobStatusBadgeVariant,
} from "@/lib/studio";
import { cn } from "@/lib/utils";

import { MonoChip, StatusDot, type StudioTone } from "./studio-primitives";
import { TimelineSkeleton } from "./studio-skeletons";

interface BackgroundJobRunCardProps {
  run: StudioBackgroundJobRun;
  selected: boolean;
  expanded: boolean;
  detail: StudioBackgroundJobRunDetail | null | undefined;
  loading: boolean;
  onSelect(): void;
  onToggleExpand(): void;
}

const ATTEMPT_KEY = /^(attempt|attempts|attempt_?number|attemptsMade|retry_?attempt)$/i;
const RETRY_KEY = /^(retry|retries|retry_?count|retriesCount)$/i;

/** Derive an attempt number from a run's structured output fields, if one was logged. */
export function getRunAttempt(run: Pick<StudioBackgroundJobRun, "outputFields">): number | null {
  for (const field of run.outputFields) {
    const value = Number.parseInt(field.value, 10);
    if (!Number.isFinite(value)) {
      continue;
    }
    if (ATTEMPT_KEY.test(field.key)) {
      return value;
    }
    if (RETRY_KEY.test(field.key)) {
      return value + 1;
    }
  }
  return null;
}

export function formatJobStatus(status: string): string {
  return status.replace(/_/g, " ");
}

export function getJobStatusTone(status: string | null | undefined, level?: string): StudioTone {
  switch (status) {
    case "COMPLETED":
      return "ok";
    case "FAILED":
      return "error";
    case "TIMEOUT":
      return "warn";
    case "IN_PROGRESS":
      return "info";
    default:
      break;
  }
  const normalizedLevel = level?.toLowerCase();
  if (normalizedLevel === "error" || normalizedLevel === "fatal" || normalizedLevel === "critical") {
    return "error";
  }
  if (normalizedLevel === "warn" || normalizedLevel === "warning") {
    return "warn";
  }
  return "neutral";
}

function formatOffset(timestamp: string | null, startedAt: string | null): string | null {
  if (!timestamp || !startedAt) {
    return null;
  }
  const diff = Date.parse(timestamp) - Date.parse(startedAt);
  if (!Number.isFinite(diff)) {
    return null;
  }
  return `+${formatDuration(Math.max(0, diff))}`;
}

/** Vertical rail timeline of run events, CI-pipeline style. */
export function BackgroundJobTimeline({
  events,
  runStartedAt,
  runStatus,
}: {
  events: readonly StudioBackgroundJobTimelineEvent[];
  runStartedAt: string | null;
  runStatus: StudioBackgroundJobRun["status"];
}) {
  return (
    <ol className="min-w-0">
      {events.map((event, index) => {
        const isLast = index === events.length - 1;
        const tone = getJobStatusTone(event.status, event.level);
        const live = isLast && runStatus === "IN_PROGRESS";
        const offset = formatOffset(event.timestamp, runStartedAt);

        return (
          <li
            key={event.id}
            className="relative grid min-w-0 grid-cols-[0.75rem_minmax(0,1fr)] gap-x-3"
          >
            <div aria-hidden className="relative flex justify-center">
              {!isLast ? <span className="absolute top-4 -bottom-1 w-px bg-border" /> : null}
              <StatusDot
                tone={tone}
                live={live}
                className="relative mt-[0.4rem] size-2"
              />
            </div>
            <div className={cn("min-w-0 space-y-1", isLast ? "pb-0" : "pb-3")}>
              <div className="flex min-w-0 items-start gap-2">
                <span
                  className={cn(
                    "min-w-0 flex-1 text-[0.78rem] leading-5 break-words",
                    tone === "error" ? "text-level-error" : "text-foreground",
                  )}
                >
                  {event.message}
                </span>
                <span
                  className="shrink-0 pt-0.5 font-mono text-[0.68rem] tabular-nums text-muted-foreground/80"
                  title={formatDateTime(event.timestamp)}
                >
                  {offset ?? formatCompactDateTime(event.timestamp)}
                </span>
              </div>
              {event.step || event.status || event.structuredFields.length > 0 ? (
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  {event.status ? (
                    <Badge variant={getBackgroundJobStatusBadgeVariant(event.status)}>
                      {formatJobStatus(event.status)}
                    </Badge>
                  ) : null}
                  {event.step ? <MonoChip title="Step">step {event.step}</MonoChip> : null}
                  {event.structuredFields.map((field) => (
                    <MonoChip key={`${event.id}:${field.key}`} title={`${field.key}: ${field.value}`}>
                      {field.key}={field.value}
                    </MonoChip>
                  ))}
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
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
  const tone = getJobStatusTone(run.status);
  const attempt = getRunAttempt(run);

  return (
    <div
      className={cn(
        "min-w-0 border-b border-border/70 transition-colors duration-150 last:border-0",
        selected && "bg-primary-soft/50 shadow-[inset_2px_0_0_var(--signal)]",
      )}
    >
      <div className="flex min-w-0 items-center gap-3 px-4 py-2.5">
        <StatusDot tone={tone} live={run.status === "IN_PROGRESS"} className="size-2" />
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={selected}
          className="group/run -mx-1.5 -my-1 min-w-0 flex-1 rounded-md px-1.5 py-1 text-left outline-none transition-colors duration-150 hover:bg-muted/60 focus-visible:bg-muted"
        >
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 truncate text-[0.8rem] font-medium text-foreground">
              {run.jobName}
            </span>
            <Badge variant={getBackgroundJobStatusBadgeVariant(run.status)}>
              {formatJobStatus(run.status)}
            </Badge>
            {attempt !== null ? (
              <MonoChip
                className={cn(attempt > 1 && "bg-level-warn/12 text-level-warn")}
                title={attempt > 1 ? `${attempt - 1} retr${attempt - 1 === 1 ? "y" : "ies"}` : "First attempt"}
              >
                attempt {attempt}
              </MonoChip>
            ) : null}
          </div>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[0.68rem] tabular-nums text-muted-foreground/80">
            <span className="truncate">{run.runId ? `run ${run.runId}` : "Inferred run"}</span>
            <span aria-hidden className="text-muted-foreground/50">·</span>
            <span title={formatDateTime(run.startedAt)}>{formatCompactDateTime(run.startedAt)}</span>
            <span aria-hidden className="text-muted-foreground/50">·</span>
            <span>
              {run.recordCount} event{run.recordCount === 1 ? "" : "s"}
            </span>
          </div>
          {run.failure ? (
            <p className="mt-1 truncate font-mono text-[0.7rem] text-level-error">
              {run.failure.message}
            </p>
          ) : null}
        </button>
        <span className="hidden shrink-0 font-mono text-[0.75rem] tabular-nums text-foreground sm:inline">
          {formatDuration(run.durationMs)}
        </span>
        <Button
          variant="ghost"
          size="xs"
          className="shrink-0 text-muted-foreground"
          aria-expanded={expanded}
          onClick={onToggleExpand}
        >
          {expanded ? "Hide timeline" : "Show timeline"}
          <ChevronDown
            aria-hidden
            className={cn("transition-transform duration-150", expanded && "rotate-180")}
          />
        </Button>
      </div>
      {run.outputFields.length > 0 ? (
        <div className="flex min-w-0 flex-wrap gap-1.5 px-4 pb-2.5 pl-9">
          {run.outputFields.map((field) => (
            <MonoChip key={`${run.id}:${field.key}`} title={`${field.key}: ${field.value}`}>
              {field.key}={field.value}
            </MonoChip>
          ))}
        </div>
      ) : null}
      {expanded ? (
        <div className="blyp-fade-up border-t border-border/70 bg-muted/20 py-3 pr-4 pl-[0.875rem]">
          {loading && !detail ? (
            <TimelineSkeleton rows={4} />
          ) : detail && detail.timeline.length > 0 ? (
            <BackgroundJobTimeline
              events={detail.timeline}
              runStartedAt={run.startedAt}
              runStatus={run.status}
            />
          ) : (
            <p className="pl-6 text-[0.78rem] text-muted-foreground">
              No timeline events found for this run.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
