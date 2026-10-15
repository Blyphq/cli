import { ChevronLeft, ChevronRight, ScrollText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { StudioLogEntry, StudioSelection } from "@/lib/studio";
import { isGroupEntry } from "@/lib/studio";
import { cn } from "@/lib/utils";

import { EmptyState } from "./empty-state";
import { GroupSummaryRow } from "./group-summary-row";
import { LOG_COLUMNS, LogRow } from "./log-row";
import { PanelHeader } from "./panel-header";
import { ListRowsSkeleton } from "./studio-skeletons";

interface LogListProps {
  entries: StudioLogEntry[];
  selection: StudioSelection;
  offset: number;
  limit: number;
  totalEntries: number;
  totalMatched: number;
  truncated: boolean;
  loading: boolean;
  title?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  onSelect(selection: StudioSelection): void;
  onPageChange(nextOffset: number): void;
}

const numberFormat = new Intl.NumberFormat();

export function LogList({
  entries,
  selection,
  offset,
  limit,
  totalEntries,
  totalMatched,
  truncated,
  loading,
  title = "Log Viewer",
  emptyTitle = "No log records matched",
  emptyDescription = "Try a different file, type, level, or search term.",
  onSelect,
  onPageChange,
}: LogListProps) {
  if (!loading && entries.length === 0) {
    return (
      <EmptyState
        icon={<ScrollText />}
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  const rangeStart = totalEntries === 0 ? 0 : offset + 1;
  const rangeEnd = Math.min(offset + entries.length, totalEntries);
  const hasPrevious = offset > 0;
  const hasNext = offset + limit < totalEntries;

  return (
    <Card className="min-w-0 gap-0 py-0">
      <PanelHeader
        className="py-3"
        title={title}
        description={
          <span className="font-mono text-[0.7rem] tabular-nums">
            {numberFormat.format(totalEntries)} entries
            <span className="text-muted-foreground/50"> · </span>
            {numberFormat.format(totalMatched)} matching logs
          </span>
        }
        action={
          truncated ? (
            <Badge variant="warning" title="Studio stopped scanning after reaching its scan limit.">
              Scan limit reached
            </Badge>
          ) : null
        }
      />
      <CardContent className="@container min-w-0 px-0">
        <div
          aria-hidden
          className={cn(
            LOG_COLUMNS.row,
            "hidden h-8 border-b border-border bg-muted/40 py-0 font-sans text-[0.7rem] font-medium text-muted-foreground @lg:flex",
          )}
        >
          <span className={cn(LOG_COLUMNS.time, "text-muted-foreground")}>Time</span>
          <span className={cn(LOG_COLUMNS.level, "text-center")}>Level</span>
          <span className={LOG_COLUMNS.source}>Source</span>
          <span className={LOG_COLUMNS.message}>Message</span>
          <span className={LOG_COLUMNS.location}>Location</span>
        </div>
        {loading && entries.length === 0 ? (
          <div className="p-4">
            <ListRowsSkeleton rows={8} />
          </div>
        ) : (
          <div
            role="list"
            aria-label={title}
            aria-busy={loading || undefined}
            className="min-w-0 divide-y divide-border/50 @lg:divide-y-0"
          >
            {entries.map((entry) =>
              isGroupEntry(entry) ? (
                <GroupSummaryRow
                  key={entry.id}
                  group={entry}
                  selected={selection?.kind === "group" && selection.id === entry.id}
                  onSelect={(groupId) => onSelect({ kind: "group", id: groupId })}
                />
              ) : (
                <LogRow
                  key={entry.id}
                  record={entry}
                  selected={selection?.kind === "record" && selection.id === entry.id}
                  onSelect={(recordId) => onSelect({ kind: "record", id: recordId })}
                />
              ),
            )}
          </div>
        )}
        <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-1.5">
          <div className="font-mono text-[0.7rem] tabular-nums text-muted-foreground">
            <span className="text-foreground/80">
              {numberFormat.format(rangeStart)}–{numberFormat.format(rangeEnd)}
            </span>{" "}
            of {numberFormat.format(totalEntries)}
          </div>
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="xs"
              disabled={!hasPrevious}
              onClick={() => onPageChange(Math.max(0, offset - limit))}
            >
              <ChevronLeft />
              Previous
            </Button>
            <Button
              variant="ghost"
              size="xs"
              disabled={!hasNext}
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
