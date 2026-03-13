import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { StudioRecord } from "@/lib/studio";

import { EmptyState } from "./empty-state";
import { LogRow } from "./log-row";

interface LogListProps {
  records: StudioRecord[];
  selectedId: string | null;
  offset: number;
  limit: number;
  totalMatched: number;
  truncated: boolean;
  loading: boolean;
  onSelect(recordId: string): void;
  onPageChange(nextOffset: number): void;
}

export function LogList({
  records,
  selectedId,
  offset,
  limit,
  totalMatched,
  truncated,
  loading,
  onSelect,
  onPageChange,
}: LogListProps) {
  if (!loading && records.length === 0) {
    return (
      <EmptyState
        title="No log records matched"
        description="Try a different file, level, or search term."
      />
    );
  }

  return (
    <Card className="min-h-[36rem]">
      <CardHeader className="border-b border-border/60">
        <CardTitle>Log Viewer</CardTitle>
        <CardDescription>
          {loading ? "Loading logs..." : `${totalMatched} matching records`}
          {truncated ? " (scan limit reached)" : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="border-b border-border/60 bg-background/60 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Timestamp</th>
                <th className="px-3 py-2 font-medium">Level</th>
                <th className="px-3 py-2 font-medium">Message</th>
                <th className="px-3 py-2 font-medium">File</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <LogRow
                  key={record.id}
                  record={record}
                  selected={record.id === selectedId}
                  onSelect={onSelect}
                />
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-border/60 px-4 py-3">
          <div className="text-xs text-muted-foreground">
            Showing {offset + 1}-{Math.min(offset + records.length, totalMatched)} of {totalMatched}
          </div>
          <div className="flex items-center gap-2">
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
              disabled={offset + limit >= totalMatched}
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
