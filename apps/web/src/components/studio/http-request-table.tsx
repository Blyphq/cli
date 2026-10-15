import type { KeyboardEvent } from "react";

import { ChevronLeft, ChevronRight, Network, Waypoints } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { StudioHttpRequestRow } from "@/lib/studio";
import {
  formatDateTime,
  formatDurationMs,
  formatRelativeTime,
  getDurationClasses,
  getHttpStatusBadgeVariant,
} from "@/lib/studio";
import { cn } from "@/lib/utils";

import { EmptyState } from "./empty-state";
import { PanelHeader } from "./panel-header";
import { ListRowsSkeleton } from "./studio-skeletons";

interface HttpRequestTableProps {
  rows: StudioHttpRequestRow[];
  selectedRecordId: string | null;
  totalRequests: number;
  offset: number;
  limit: number;
  loading: boolean;
  onSelectRecord(recordId: string): void;
  onPageChange(nextOffset: number): void;
  onViewTrace(traceGroupId: string): void;
}

/**
 * One responsive grid for every breakpoint: method / route / status / duration on
 * the first line, trace + time folding onto a second line below `md`.
 */
const ROW_GRID =
  "grid grid-cols-[3.5rem_minmax(0,1fr)_3.5rem_4.5rem] items-center gap-x-3 md:grid-cols-[3.5rem_minmax(0,1fr)_3.5rem_4.5rem_6.5rem_6rem]";

function getHttpMethodClass(method: string): string {
  switch (method.toUpperCase()) {
    case "GET":
      return "text-level-info";
    case "POST":
      return "text-level-ok";
    case "PUT":
    case "PATCH":
      return "text-level-warn";
    case "DELETE":
      return "text-level-error";
    default:
      return "text-muted-foreground";
  }
}

export function HttpRequestTable({
  rows,
  selectedRecordId,
  totalRequests,
  offset,
  limit,
  loading,
  onSelectRecord,
  onPageChange,
  onViewTrace,
}: HttpRequestTableProps) {
  if (!loading && rows.length === 0) {
    return (
      <EmptyState
        title="No HTTP requests matched"
        description="Try a different route, method, status group, or duration threshold."
        icon={<Network />}
      />
    );
  }

  const rangeStart = totalRequests === 0 ? 0 : offset + 1;
  const rangeEnd = Math.min(offset + rows.length, totalRequests);

  return (
    <Card className="min-w-0 gap-0 py-0">
      <PanelHeader
        className="py-3 [.border-b]:pb-3"
        title="Request log"
        description={`${rows.length} shown from ${totalRequests} matching requests`}
      />
      {loading && rows.length === 0 ? (
        <div className="p-4">
          <ListRowsSkeleton rows={6} />
        </div>
      ) : null}
      {rows.length > 0 ? (
        <div className="min-w-0">
          <div
            aria-hidden
            className={cn(
              ROW_GRID,
              "hidden h-8 border-b border-border bg-muted/40 px-4 text-[0.7rem] font-medium text-muted-foreground md:grid",
            )}
          >
            <span>Method</span>
            <span>Route</span>
            <span className="text-center">Status</span>
            <span className="text-right">Duration</span>
            <span>Trace</span>
            <span className="text-right">Time</span>
          </div>
          <div>
            {rows.map((row) => {
              const selected = selectedRecordId === row.recordId;

              return (
                <div
                  key={row.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${row.method} ${row.route}`}
                  aria-current={selected ? "true" : undefined}
                  onClick={() => onSelectRecord(row.recordId)}
                  onKeyDown={(event) => handleRowKeyDown(event, row.recordId, onSelectRecord)}
                  className={cn(
                    ROW_GRID,
                    "cursor-pointer gap-y-1 border-b border-border/70 px-4 py-2 outline-none transition-colors duration-150 last:border-0 hover:bg-muted/60 focus-visible:bg-muted",
                    selected && "bg-primary-soft/50 shadow-[inset_2px_0_0_var(--signal)] hover:bg-primary-soft/60",
                  )}
                >
                  <span
                    className={cn(
                      "font-mono text-[0.72rem] font-medium tracking-tight",
                      getHttpMethodClass(row.method),
                    )}
                  >
                    {row.method}
                  </span>
                  <span
                    className="truncate font-mono text-[0.75rem] text-foreground"
                    title={row.rawPath && row.rawPath !== row.route ? `${row.route}\n${row.rawPath}` : row.route}
                  >
                    {row.route}
                  </span>
                  <span className="flex justify-center">
                    <Badge variant={getHttpStatusBadgeVariant(row.statusGroup)} className="tabular-nums">
                      {row.statusCode}
                    </Badge>
                  </span>
                  <span
                    className={cn(
                      "text-right font-mono text-[0.75rem] tabular-nums",
                      getDurationClasses(row.durationMs),
                    )}
                  >
                    {formatDurationMs(row.durationMs)}
                  </span>
                  <div className="col-span-full flex min-w-0 items-center justify-between gap-3 md:contents">
                    <span className="flex min-w-0 items-center">
                      <TraceCell row={row} onViewTrace={onViewTrace} />
                    </span>
                    <span
                      className="text-right font-mono text-[0.7rem] whitespace-nowrap tabular-nums text-muted-foreground/80"
                      title={formatDateTime(row.timestamp)}
                    >
                      {formatRelativeTime(row.timestamp)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
      <div className="flex flex-col gap-2 border-t border-border bg-muted/20 px-4 py-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="font-mono text-[0.7rem] tabular-nums text-muted-foreground">
          Showing {rangeStart}-{rangeEnd} of {totalRequests}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            disabled={offset === 0}
            onClick={() => onPageChange(Math.max(0, offset - limit))}
          >
            <ChevronLeft />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={offset + limit >= totalRequests}
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

function TraceCell({
  row,
  onViewTrace,
}: {
  row: StudioHttpRequestRow;
  onViewTrace(traceGroupId: string): void;
}) {
  if (row.traceGroupId) {
    const traceGroupId = row.traceGroupId;

    return (
      <Button
        variant="ghost"
        size="xs"
        className="-ml-2 text-muted-foreground hover:text-foreground"
        onClick={(event) => {
          event.stopPropagation();
          onViewTrace(traceGroupId);
        }}
      >
        <Waypoints className="size-3" />
        View trace
      </Button>
    );
  }

  if (row.traceId) {
    return (
      <span className="truncate font-mono text-[0.7rem] text-muted-foreground" title={row.traceId}>
        {row.traceId}
      </span>
    );
  }

  return <span className="font-mono text-[0.7rem] text-muted-foreground/60">n/a</span>;
}

function handleRowKeyDown(
  event: KeyboardEvent<HTMLDivElement>,
  recordId: string,
  onSelectRecord: (recordId: string) => void,
) {
  if (event.target !== event.currentTarget) {
    return;
  }

  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onSelectRecord(recordId);
  }
}
