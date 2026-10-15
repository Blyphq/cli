import { ChevronDown, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  StudioBadgeVariant,
  StudioPaymentTrace,
  StudioPaymentTraceDetail,
  StudioPaymentTraceEvent,
} from "@/lib/studio";
import {
  formatCompactDateTime,
  formatDurationMs,
  formatPaymentAmount,
  getPaymentTraceStatusBadgeVariant,
} from "@/lib/studio";
import { cn } from "@/lib/utils";

import { MonoChip, StatusDot, type StudioTone } from "./studio-primitives";
import { TimelineSkeleton } from "./studio-skeletons";

interface PaymentTraceCardProps {
  trace: StudioPaymentTrace;
  selected: boolean;
  expanded: boolean;
  detail: StudioPaymentTraceDetail | null | undefined;
  detailLoading: boolean;
  onSelect(): void;
  onToggleExpand(): void;
  onAskAi(): void;
}

const traceStatusTone: Record<StudioPaymentTrace["status"], StudioTone> = {
  COMPLETED: "ok",
  DECLINED: "error",
  ERROR: "error",
  PENDING: "info",
};

/** A single checkout trace row (rendered inside the trace list), with an expandable step timeline. */
export function PaymentTraceCard({
  trace,
  selected,
  expanded,
  detail,
  detailLoading,
  onSelect,
  onToggleExpand,
  onAskAi,
}: PaymentTraceCardProps) {
  const isProblem = trace.status === "DECLINED" || trace.status === "ERROR";

  return (
    <li className="border-b border-border/70 last:border-0">
      <div
        className={cn(
          "relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-2.5 transition-colors duration-150 hover:bg-muted/60 focus-within:bg-muted/60 md:grid-cols-[minmax(0,1fr)_7rem_6rem_4.5rem_11rem]",
          selected && "bg-primary-soft/50 shadow-[inset_2px_0_0_var(--signal)] hover:bg-primary-soft/60",
          expanded && !selected && "bg-muted/40",
        )}
      >
        <button
          type="button"
          aria-pressed={selected}
          className="flex min-w-0 flex-col gap-1 text-left outline-none after:absolute after:inset-0 after:content-['']"
          onClick={onSelect}
        >
          <span className="flex min-w-0 items-center gap-2">
            <StatusDot tone={traceStatusTone[trace.status] ?? "neutral"} />
            <span className="truncate font-mono text-[0.78rem] font-medium text-foreground">
              {trace.correlationLabel}
            </span>
            {trace.userId ? (
              <MonoChip className="hidden sm:inline-flex">user_{trace.userId}</MonoChip>
            ) : null}
          </span>
          <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-0.5 pl-3.5 text-[0.7rem] text-muted-foreground">
            <span className="font-mono tabular-nums text-muted-foreground/80">
              {formatCompactDateTime(trace.startedAt)}
            </span>
            <span className="font-mono tabular-nums">
              {trace.recordCount} event{trace.recordCount === 1 ? "" : "s"}
            </span>
            {trace.webhookEventCount > 0 ? (
              <span className="font-mono tabular-nums">
                {trace.webhookEventCount} webhook{trace.webhookEventCount === 1 ? "" : "s"}
              </span>
            ) : null}
            {trace.failureReason ? (
              <span className="min-w-0 truncate text-level-error">{trace.failureReason}</span>
            ) : null}
          </span>
        </button>

        <span
          className={cn(
            "pointer-events-none text-right font-mono text-[0.9rem] font-medium tabular-nums",
            !trace.amount ? "text-muted-foreground/60" : isProblem ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {trace.amount ? formatPaymentAmount(trace.amount) : "—"}
        </span>

        <span className="pointer-events-none col-start-2 row-start-2 flex justify-end md:col-start-auto md:row-start-auto md:justify-center">
          <Badge variant={getPaymentTraceStatusBadgeVariant(trace.status)} className="min-w-[4.75rem]">
            {trace.status}
          </Badge>
        </span>

        <span className="pointer-events-none hidden text-right font-mono text-[0.72rem] tabular-nums text-muted-foreground md:block">
          {trace.durationMs != null ? formatDurationMs(trace.durationMs) : "—"}
        </span>

        <span className="relative z-10 col-span-2 flex items-center justify-end gap-1 md:col-span-1">
          {isProblem ? (
            <Button variant="outline" size="xs" onClick={onAskAi}>
              <Sparkles className="text-primary" />
              Ask AI
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="xs"
            aria-expanded={expanded}
            onClick={onToggleExpand}
            className="text-muted-foreground"
          >
            {expanded ? "Collapse" : "Expand"}
            <ChevronDown
              className={cn("transition-transform duration-200 ease-out-expo", expanded && "rotate-180")}
            />
          </Button>
        </span>
      </div>

      {expanded ? (
        <div className="border-t border-border/70 bg-muted/25 px-4 py-3">
          {detailLoading && !detail ? (
            <TimelineSkeleton rows={4} />
          ) : detail ? (
            <TraceSteps detail={detail} />
          ) : (
            <div className="text-[0.75rem] text-muted-foreground">Trace detail is unavailable.</div>
          )}
        </div>
      ) : null}
    </li>
  );
}

function TraceSteps({ detail }: { detail: StudioPaymentTraceDetail }) {
  return (
    <div className="flex flex-col gap-3">
      {detail.correlationSignals.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[0.7rem] text-muted-foreground">Correlated by</span>
          {detail.correlationSignals.map((signal) => (
            <MonoChip key={`${signal.key}:${signal.value}`} className="bg-background">
              {signal.key}={signal.value}
            </MonoChip>
          ))}
        </div>
      ) : null}

      {detail.timeline.length === 0 ? (
        <div className="text-[0.75rem] text-muted-foreground">No steps were recorded for this trace.</div>
      ) : (
        <ol className="relative">
          {detail.timeline.length > 1 ? (
            <span
              aria-hidden
              className="pointer-events-none absolute top-2.5 bottom-2.5 left-[4.75rem] w-px bg-border"
            />
          ) : null}
          {detail.timeline.map((event) => (
            <li
              key={event.id}
              className="relative grid grid-cols-[3.75rem_0.75rem_minmax(0,1fr)] items-start gap-x-2.5 py-1.5"
            >
              <span className="pt-px text-right font-mono text-[0.7rem] tabular-nums text-muted-foreground/80">
                {event.offsetMs == null ? "n/a" : `+${formatDurationMs(Math.max(0, event.offsetMs))}`}
              </span>
              <span aria-hidden className="flex h-[1.125rem] items-center justify-center">
                <StatusDot tone={getStepTone(event)} className="relative z-10 size-2" />
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <Badge variant={getStepBadgeVariant(event)} className="w-[4.25rem]">
                    {event.kind}
                  </Badge>
                  <span className="min-w-0 text-[0.8rem] font-medium text-foreground">{event.message}</span>
                  {event.route ? (
                    <span className="font-mono text-[0.7rem] text-muted-foreground">{event.route}</span>
                  ) : null}
                  {event.durationMs != null ? (
                    <span className="font-mono text-[0.7rem] tabular-nums text-muted-foreground">
                      {formatDurationMs(event.durationMs)}
                    </span>
                  ) : null}
                </span>
                {event.fields.length > 0 ? (
                  <span className="flex min-w-0 flex-wrap gap-1">
                    {event.fields.map((field) => (
                      <MonoChip key={`${event.id}:${field.key}`} className="bg-background">
                        <span className="text-muted-foreground/80">{field.key}=</span>
                        <span className="text-foreground/85">{field.value}</span>
                      </MonoChip>
                    ))}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function getStepTone(event: StudioPaymentTraceEvent): StudioTone {
  if (event.kind === "ERROR" || event.status === "DECLINED" || event.status === "ERROR") {
    return "error";
  }
  if (event.status === "COMPLETED") {
    return "ok";
  }
  if (event.kind === "WEBHOOK" || event.status === "PENDING") {
    return "info";
  }
  return "neutral";
}

function getStepBadgeVariant(event: StudioPaymentTraceEvent): StudioBadgeVariant {
  switch (event.kind) {
    case "ERROR":
      return "destructive";
    case "WEBHOOK":
      return "info";
    default:
      return "outline";
  }
}
