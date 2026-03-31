import type { KeyboardEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { StudioDatabaseQueryEvent } from "@/lib/studio";
import {
  formatDateTime,
  formatDurationMs,
  formatRelativeTime,
  getDurationClasses,
} from "@/lib/studio";
import { cn } from "@/lib/utils";

import { EmptyState } from "./empty-state";
import { PanelHeader } from "./panel-header";
import { ListRowsSkeleton } from "./studio-skeletons";

interface DatabaseQueryTableProps {
  queries: StudioDatabaseQueryEvent[];
  selectedRecordId: string | null;
  totalQueries: number;
  loading: boolean;
  onSelectRecord(recordId: string): void;
}

export function DatabaseQueryTable({
  queries,
  selectedRecordId,
  totalQueries,
  loading,
  onSelectRecord,
}: DatabaseQueryTableProps) {
  if (!loading && queries.length === 0) {
    return (
      <EmptyState
        title="No database queries matched the current filters"
        description="Try a different file, date range, or search term."
      />
    );
  }

  return (
    <Card className="min-w-0">
      <PanelHeader
        title="Query log"
        description={`${queries.length} shown from ${totalQueries} matching queries`}
      />
      <CardContent className="p-0">
        {loading && queries.length === 0 ? (
          <div className="p-4">
            <ListRowsSkeleton rows={6} />
          </div>
        ) : null}
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full table-fixed text-left text-sm">
            <thead className="border-b border-border/60 bg-background/60 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              <tr>
                <th className="w-32 px-3 py-2 font-medium">Operation</th>
                <th className="px-3 py-2 font-medium">Model / Table</th>
                <th className="w-28 px-3 py-2 font-medium">Duration</th>
                <th className="w-24 px-3 py-2 font-medium">Status</th>
                <th className="w-28 px-3 py-2 font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {queries.map((query) => (
                <tr
                  key={query.id}
                  tabIndex={0}
                  role="button"
                  onClick={() => onSelectRecord(query.recordId)}
                  onKeyDown={(event) => handleRowKeyDown(event, query.recordId, onSelectRecord)}
                  className={cn(
                    "cursor-pointer border-b border-border/60 outline-none hover:bg-muted/30 focus-visible:bg-muted/40",
                    selectedRecordId === query.recordId && "bg-primary/10",
                  )}
                >
                  <td className="px-3 py-2 align-top text-sm font-medium">{query.operation}</td>
                  <td className="px-3 py-2 align-top text-sm">
                    <div className="truncate" title={query.modelOrTable ?? "Unknown"}>
                      {query.modelOrTable ?? "Unknown"}
                    </div>
                  </td>
                  <td className={cn("px-3 py-2 align-top text-sm font-medium", getDurationClasses(query.durationMs))}>
                    {formatDurationMs(query.durationMs)}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <Badge variant={getStatusVariant(query.status)}>{getStatusLabel(query.status)}</Badge>
                  </td>
                  <td className="px-3 py-2 align-top text-xs text-muted-foreground" title={formatDateTime(query.timestamp)}>
                    {formatRelativeTime(query.timestamp)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="divide-y divide-border/60 lg:hidden">
          {queries.map((query) => (
            <button
              key={query.id}
              type="button"
              onClick={() => onSelectRecord(query.recordId)}
              className={cn(
                "flex w-full flex-col gap-3 px-3 py-3 text-left hover:bg-muted/30",
                selectedRecordId === query.recordId && "bg-primary/10",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">{query.operation}</div>
                  <div className="text-xs text-muted-foreground">{query.modelOrTable ?? "Unknown"}</div>
                </div>
                <Badge variant={getStatusVariant(query.status)}>{getStatusLabel(query.status)}</Badge>
              </div>
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className={cn("font-medium", getDurationClasses(query.durationMs))}>
                  {formatDurationMs(query.durationMs)}
                </span>
                <span className="text-muted-foreground" title={formatDateTime(query.timestamp)}>
                  {formatRelativeTime(query.timestamp)}
                </span>
              </div>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function getStatusVariant(status: StudioDatabaseQueryEvent["status"]) {
  switch (status) {
    case "error":
      return "destructive" as const;
    case "slow":
      return "secondary" as const;
    default:
      return "outline" as const;
  }
}

function getStatusLabel(status: StudioDatabaseQueryEvent["status"]): string {
  switch (status) {
    case "error":
      return "Error";
    case "slow":
      return "Slow";
    default:
      return "Success";
  }
}

function handleRowKeyDown(
  event: KeyboardEvent<HTMLTableRowElement>,
  recordId: string,
  onSelect: (recordId: string) => void,
) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onSelect(recordId);
  }
}
