import { ChevronLeft, ChevronRight, History } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  formatDateTime,
  formatDurationMs,
  getAuthEventKindLabel,
  getAuthOutcomeBadgeVariant,
  type StudioAuthEvent,
} from "@/lib/studio";
import { cn } from "@/lib/utils";

import { EmptyState } from "./empty-state";
import { PanelHeader } from "./panel-header";
import { MonoChip } from "./studio-primitives";
import { ListRowsSkeleton } from "./studio-skeletons";

interface AuthTimelineProps {
  events: StudioAuthEvent[];
  selectedRecordId: string | null;
  highlightedRecordIds: Set<string>;
  offset: number;
  limit: number;
  total: number;
  loading: boolean;
  onSelect(recordId: string): void;
  onPageChange(nextOffset: number): void;
}

const outcomeDotClass: Record<StudioAuthEvent["outcome"], string> = {
  success: "bg-level-ok",
  failure: "bg-level-error",
  unknown: "bg-level-debug",
};

export function AuthTimeline({
  events,
  selectedRecordId,
  highlightedRecordIds,
  offset,
  limit,
  total,
  loading,
  onSelect,
  onPageChange,
}: AuthTimelineProps) {
  if (!loading && !events.length) {
    return (
      <EmptyState
        title="No auth activity matched the current filters."
        description="Try a different source, date range, search term, or clear the selected user."
        icon={<History />}
      />
    );
  }

  const rangeStart = events.length ? offset + 1 : 0;
  const rangeEnd = Math.min(offset + events.length, total);

  return (
    <Card className="min-h-[28rem] gap-0 py-0">
      <PanelHeader
        className="py-3"
        title="Auth Timeline"
        description={`${total} auth events shown in chronological order.`}
        action={
          highlightedRecordIds.size > 0 ? (
            <Badge variant="destructive">{highlightedRecordIds.size} flagged</Badge>
          ) : null
        }
      />
      <div className="flex-1 px-2 py-2">
        {loading && events.length === 0 ? (
          <div className="p-1">
            <ListRowsSkeleton rows={6} dense />
          </div>
        ) : null}
        <ol className="relative">
          {events.length > 1 ? (
            <span
              aria-hidden
              className="pointer-events-none absolute top-5 bottom-5 left-[8.15rem] hidden w-px bg-border sm:block"
            />
          ) : null}
          {events.map((event) => {
            const selected = selectedRecordId === event.recordId;
            const highlighted = !selected && highlightedRecordIds.has(event.recordId);

            return (
              <li key={event.id} className="relative">
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelect(event.recordId)}
                  className={cn(
                    "blyp-line-in group/event grid w-full min-w-0 grid-cols-1 items-start gap-x-3 gap-y-1 rounded-md px-2 py-2 text-left outline-none transition-colors duration-150 hover:bg-muted/60 focus-visible:bg-muted active:scale-[0.995] sm:grid-cols-[6.4rem_1rem_minmax(0,1fr)]",
                    selected && "bg-primary-soft/50 shadow-[inset_2px_0_0_var(--signal)] hover:bg-primary-soft/60",
                    highlighted && "bg-level-error/[0.06] hover:bg-level-error/[0.1]",
                  )}
                >
                  <span
                    className="flex items-baseline gap-2 font-mono tabular-nums sm:flex-col sm:items-start sm:gap-0"
                    title={formatDateTime(event.timestamp)}
                  >
                    <span className="text-[0.74rem] text-muted-foreground/90">
                      {formatClockTime(event.timestamp)}
                    </span>
                    <span className="text-[0.64rem] text-muted-foreground/60">
                      {formatShortDate(event.timestamp)}
                    </span>
                  </span>
                  <span aria-hidden className="relative hidden h-5 items-center justify-center sm:flex">
                    <span
                      className={cn(
                        "relative z-10 size-2 rounded-full",
                        outcomeDotClass[event.outcome] ?? outcomeDotClass.unknown,
                      )}
                    />
                  </span>
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <Badge variant={getAuthOutcomeBadgeVariant(event.outcome)} className="w-14">
                        {event.outcome}
                      </Badge>
                      <Badge variant="outline">{getAuthEventKindLabel(event.kind)}</Badge>
                      <span className="min-w-0 truncate text-[0.8rem] font-medium text-foreground">
                        {event.summary}
                      </span>
                    </span>
                    <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[0.7rem] tabular-nums text-muted-foreground">
                      {event.action ? <span className="text-foreground/75">{event.action}</span> : null}
                      {event.userEmail || event.userId ? (
                        <span className="min-w-0 truncate">
                          {event.userEmail ?? `user ${event.userId}`}
                        </span>
                      ) : null}
                      {event.ip ? <MonoChip title="IP address">{event.ip}</MonoChip> : null}
                      {event.route ? (
                        <span className="min-w-0 truncate">
                          {event.method ? <span className="text-foreground/70">{event.method} </span> : null}
                          {event.route}
                        </span>
                      ) : null}
                      {event.statusCode != null ? (
                        <span className={statusCodeClass(event.statusCode)}>{event.statusCode}</span>
                      ) : null}
                      {event.durationMs != null ? <span>{formatDurationMs(event.durationMs)}</span> : null}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
        <div className="font-mono text-[0.7rem] tabular-nums text-muted-foreground">
          Showing {rangeStart}-{rangeEnd} of {total}
        </div>
        <div className="flex gap-1.5">
          <Button
            variant="outline"
            size="xs"
            disabled={loading || offset === 0}
            onClick={() => onPageChange(Math.max(0, offset - limit))}
          >
            <ChevronLeft />
            Previous
          </Button>
          <Button
            variant="outline"
            size="xs"
            disabled={loading || offset + limit >= total}
            onClick={() => onPageChange(offset + limit)}
          >
            Next
            <ChevronRight />
          </Button>
        </div>
      </div>
    </Card>
  );
}

function statusCodeClass(statusCode: number): string {
  if (statusCode >= 500) {
    return "text-level-error";
  }
  if (statusCode >= 400) {
    return "text-level-warn";
  }
  return "text-muted-foreground";
}

function parseTimestamp(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatClockTime(value: string | null | undefined): string {
  const parsed = parseTimestamp(value);
  if (!parsed) {
    return value ? value : "--:--:--";
  }
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(parsed);
}

function formatShortDate(value: string | null | undefined): string {
  const parsed = parseTimestamp(value);
  if (!parsed) {
    return "";
  }
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(parsed);
}
