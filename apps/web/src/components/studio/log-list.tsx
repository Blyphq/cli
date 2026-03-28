import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { StudioLogEntry, StudioSelection } from "@/lib/studio";
import { isGroupEntry } from "@/lib/studio";

import { EmptyState } from "./empty-state";
import { GroupSummaryRow } from "./group-summary-row";
import { LogRow } from "./log-row";
import { PanelHeader } from "./panel-header";

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
  const summary = `${loading ? "Loading logs..." : `${totalEntries} visible entries from ${totalMatched} matching logs`}${truncated ? " (scan limit reached)" : ""}`;

  if (!loading && entries.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  return (
    <Card className="min-h-[36rem] min-w-0">
      <PanelHeader title={title} description={summary} />
      <CardContent className="min-w-0 p-0">
        <div className="hidden min-w-0 overflow-x-auto lg:block">
          <table className="w-full table-fixed text-left text-sm">
            <thead className="border-b border-border/60 bg-background/60 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              <tr>
                <th className="w-36 px-3 py-2 font-medium">Timestamp</th>
                <th className="w-24 px-3 py-2 font-medium">Level</th>
                <th className="px-3 py-2 font-medium">Message</th>
                <th className="w-44 px-3 py-2 font-medium">File</th>
              </tr>
            </thead>
            <tbody>
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
            </tbody>
          </table>
        </div>
        <div className="divide-y divide-border/60 lg:hidden">
          {entries.map((entry) =>
            isGroupEntry(entry) ? (
              <GroupSummaryRow
                key={entry.id}
                group={entry}
                selected={selection?.kind === "group" && selection.id === entry.id}
                onSelect={(groupId) => onSelect({ kind: "group", id: groupId })}
                variant="mobile"
              />
            ) : (
              <LogRow
                key={entry.id}
                record={entry}
                selected={selection?.kind === "record" && selection.id === entry.id}
                onSelect={(recordId) => onSelect({ kind: "record", id: recordId })}
                variant="mobile"
              />
            ),
          )}
        </div>
        <div className="flex flex-col gap-3 border-t border-border/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-muted-foreground">
            Showing {offset + 1}-{Math.min(offset + entries.length, totalEntries)} of {totalEntries}
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
              disabled={offset + limit >= totalEntries}
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
