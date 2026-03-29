import type { KeyboardEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { StudioHttpRequestRow } from "@/lib/studio";
import {
  formatDateTime,
  formatDurationMs,
  formatRelativeTime,
  getHttpStatusBadgeVariant,
} from "@/lib/studio";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { EmptyState } from "./empty-state";
import { PanelHeader } from "./panel-header";

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
      />
    );
  }

  return (
    <Card className="min-w-0">
      <PanelHeader
        title="Request log"
        description={loading ? "Loading HTTP requests..." : `${rows.length} shown from ${totalRequests} matching requests`}
      />
      <CardContent className="p-0">
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full table-fixed text-left text-sm">
            <thead className="border-b border-border/60 bg-background/60 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              <tr>
                <th className="w-24 px-3 py-2 font-medium">Method</th>
                <th className="px-3 py-2 font-medium">Route</th>
                <th className="w-24 px-3 py-2 font-medium">Status</th>
                <th className="w-28 px-3 py-2 font-medium">Duration</th>
                <th className="w-28 px-3 py-2 font-medium">Trace</th>
                <th className="w-28 px-3 py-2 font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  tabIndex={0}
                  role="button"
                  aria-label={`${row.method} ${row.route}`}
                  onClick={() => onSelectRecord(row.recordId)}
                  onKeyDown={(event) => handleKeyDown(event, row.recordId, onSelectRecord)}
                  className={cn(
                    "cursor-pointer border-b border-border/60 outline-none hover:bg-muted/30 focus-visible:bg-muted/40",
                    selectedRecordId === row.recordId && "bg-primary/10",
                  )}
                >
                  <td className="px-3 py-2 align-top font-medium">{row.method}</td>
                  <td className="px-3 py-2 align-top whitespace-normal">{row.route}</td>
                  <td className="px-3 py-2 align-top">
                    <Badge variant={getHttpStatusBadgeVariant(row.statusGroup)}>
                      {row.statusCode}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 align-top">{formatDurationMs(row.durationMs)}</td>
                  <td className="px-3 py-2 align-top">
                    <TraceCell row={row} onViewTrace={onViewTrace} />
                  </td>
                  <td className="px-3 py-2 align-top text-xs text-muted-foreground" title={formatDateTime(row.timestamp)}>
                    {formatRelativeTime(row.timestamp)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="divide-y divide-border/60 lg:hidden">
          {rows.map((row) => (
            <div
              key={row.id}
              role="button"
              tabIndex={0}
              aria-label={`${row.method} ${row.route}`}
              onClick={() => onSelectRecord(row.recordId)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectRecord(row.recordId);
                }
              }}
              className={cn(
                "flex w-full flex-col gap-3 px-3 py-3 text-left hover:bg-muted/30",
                selectedRecordId === row.recordId && "bg-primary/10",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">
                    {row.method} {row.route}
                  </div>
                  <div className="text-xs text-muted-foreground">{formatDurationMs(row.durationMs)}</div>
                </div>
                <Badge variant={getHttpStatusBadgeVariant(row.statusGroup)}>{row.statusCode}</Badge>
              </div>
              <div className="flex items-center justify-between gap-3 text-xs">
                <TraceCell row={row} onViewTrace={onViewTrace} />
                <span className="text-muted-foreground" title={formatDateTime(row.timestamp)}>
                  {formatRelativeTime(row.timestamp)}
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-3 border-t border-border/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-muted-foreground">
            Showing {totalRequests === 0 ? 0 : offset + 1}-{Math.min(offset + rows.length, totalRequests)} of {totalRequests}
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
      </CardContent>
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
    return (
      <Button
        variant="outline"
        size="xs"
        onClick={(event) => {
          event.stopPropagation();
          onViewTrace(row.traceGroupId!);
        }}
      >
        View trace
      </Button>
    );
  }

  if (row.traceId) {
    return <span className="text-xs text-muted-foreground">{row.traceId}</span>;
  }

  return <span className="text-xs text-muted-foreground">n/a</span>;
}

function handleKeyDown(
  event: KeyboardEvent<HTMLTableRowElement>,
  recordId: string,
  onSelectRecord: (recordId: string) => void,
) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onSelectRecord(recordId);
  }
}
