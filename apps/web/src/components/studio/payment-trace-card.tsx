import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { StudioPaymentTrace, StudioPaymentTraceDetail } from "@/lib/studio";
import {
  formatCompactDateTime,
  formatDurationMs,
  formatPaymentAmount,
  getPaymentTraceStatusBadgeVariant,
} from "@/lib/studio";

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
  return (
    <Card
      size="sm"
      className={selected ? "border-primary/50 shadow-sm" : undefined}
    >
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            onClick={onSelect}
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[15px] font-medium">
              <span>{trace.correlationLabel}</span>
              {trace.userId ? (
                <span className="text-muted-foreground">user_{trace.userId}</span>
              ) : null}
              {trace.amount ? (
                <span className="text-muted-foreground">{formatPaymentAmount(trace.amount)}</span>
              ) : null}
              {trace.durationMs != null ? (
                <span className="text-muted-foreground">{formatDurationMs(trace.durationMs)}</span>
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{formatCompactDateTime(trace.startedAt)}</span>
              <span>{trace.recordCount} event{trace.recordCount === 1 ? "" : "s"}</span>
              {trace.failureReason ? <span>{trace.failureReason}</span> : null}
            </div>
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={getPaymentTraceStatusBadgeVariant(trace.status)}>
              {trace.status}
            </Badge>
            <Button variant="outline" size="xs" onClick={onToggleExpand}>
              {expanded ? "Collapse" : "Expand"}
            </Button>
            {(trace.status === "DECLINED" || trace.status === "ERROR") ? (
              <Button variant="secondary" size="xs" onClick={onAskAi}>
                Ask AI
              </Button>
            ) : null}
          </div>
        </div>
        {expanded ? (
          detailLoading && !detail ? (
            <div className="text-xs text-muted-foreground">Loading trace timeline.</div>
          ) : detail ? (
            <div className="space-y-3 border-t border-border/60 pt-4">
              {detail.timeline.map((event) => (
                <div key={event.id} className="border border-border/60 bg-background/40 p-4">
                  <div className="flex flex-wrap gap-2 text-sm">
                    <span className="min-w-16 text-muted-foreground">
                      {event.offsetMs == null ? "n/a" : `+${Math.max(0, event.offsetMs)}ms`}
                    </span>
                    <Badge variant={event.kind === "ERROR" ? "destructive" : "outline"}>
                      {event.kind}
                    </Badge>
                    <span className="font-medium">{event.message}</span>
                  </div>
                  {event.fields.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
                      {event.fields.map((field) => (
                        <span key={`${event.id}:${field.key}`}>
                          {field.key}={field.value}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null
        ) : null}
      </CardContent>
    </Card>
  );
}
