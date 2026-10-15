import type { KeyboardEvent } from "react";

import { Database } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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

const ROW_GRID =
  "grid grid-cols-[4.5rem_minmax(0,1fr)_4.5rem] items-center gap-x-3 md:grid-cols-[4.5rem_minmax(0,1fr)_4.5rem_4rem_6rem]";

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
        icon={<Database />}
      />
    );
  }

  return (
    <Card className="min-w-0 gap-0 py-0">
      <PanelHeader
        className="py-3 [.border-b]:pb-3"
        title="Query log"
        description={`${queries.length} shown from ${totalQueries} matching queries`}
      />
      {loading && queries.length === 0 ? (
        <div className="p-4">
          <ListRowsSkeleton rows={6} />
        </div>
      ) : null}
      {queries.length > 0 ? (
        <div className="min-w-0">
          <div
            aria-hidden
            className={cn(
              ROW_GRID,
              "hidden h-8 border-b border-border bg-muted/40 px-4 text-[0.7rem] font-medium text-muted-foreground md:grid",
            )}
          >
            <span>Operation</span>
            <span>Model / table</span>
            <span className="text-right">Duration</span>
            <span className="text-center">Status</span>
            <span className="text-right">Time</span>
          </div>
          {queries.map((query) => {
            const selected = selectedRecordId === query.recordId;
            const target = query.modelOrTable ?? "Unknown";

            return (
              <div
                key={query.id}
                role="button"
                tabIndex={0}
                aria-label={`${query.operation} ${target}`}
                aria-current={selected ? "true" : undefined}
                onClick={() => onSelectRecord(query.recordId)}
                onKeyDown={(event) => handleRowKeyDown(event, query.recordId, onSelectRecord)}
                className={cn(
                  ROW_GRID,
                  "cursor-pointer gap-y-1 border-b border-border/70 px-4 py-2 outline-none transition-colors duration-150 last:border-0 hover:bg-muted/60 focus-visible:bg-muted",
                  selected && "bg-primary-soft/50 shadow-[inset_2px_0_0_var(--signal)] hover:bg-primary-soft/60",
                )}
              >
                <span className="truncate font-mono text-[0.72rem] font-medium text-foreground">
                  {query.operation}
                </span>
                <span className="flex min-w-0 items-baseline gap-2">
                  <span
                    className={cn(
                      "max-w-[55%] shrink-0 truncate font-mono text-[0.75rem]",
                      query.modelOrTable ? "text-foreground" : "text-muted-foreground/70",
                    )}
                    title={target}
                  >
                    {target}
                  </span>
                  {query.queryText ? (
                    <span
                      className="min-w-0 truncate font-mono text-[0.7rem] text-muted-foreground/80"
                      title={query.queryText}
                    >
                      {query.queryText}
                    </span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    "text-right font-mono text-[0.75rem] tabular-nums",
                    getDurationClasses(query.durationMs),
                  )}
                >
                  {formatDurationMs(query.durationMs)}
                </span>
                <div className="col-span-full flex items-center justify-between gap-3 md:contents">
                  <span className="flex md:justify-center">
                    <Badge variant={getStatusVariant(query.status)}>{getStatusLabel(query.status)}</Badge>
                  </span>
                  <span
                    className="text-right font-mono text-[0.7rem] whitespace-nowrap tabular-nums text-muted-foreground/80"
                    title={formatDateTime(query.timestamp)}
                  >
                    {formatRelativeTime(query.timestamp)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </Card>
  );
}

function getStatusVariant(status: StudioDatabaseQueryEvent["status"]) {
  switch (status) {
    case "error":
      return "destructive" as const;
    case "slow":
      return "warning" as const;
    default:
      return "success" as const;
  }
}

function getStatusLabel(status: StudioDatabaseQueryEvent["status"]): string {
  switch (status) {
    case "error":
      return "Error";
    case "slow":
      return "Slow";
    default:
      return "OK";
  }
}

function handleRowKeyDown(
  event: KeyboardEvent<HTMLDivElement>,
  recordId: string,
  onSelect: (recordId: string) => void,
) {
  if (event.target !== event.currentTarget) {
    return;
  }

  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onSelect(recordId);
  }
}
