import { ChevronLeft, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  getAuthEventKindLabel,
  getAuthOutcomeBadgeVariant,
  type StudioAuthEvent,
} from "@/lib/studio";
import { formatCompactDateTime } from "@/lib/studio";

import { EmptyState } from "./empty-state";
import { PanelHeader } from "./panel-header";

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
      />
    );
  }

  return (
    <Card className="min-h-[28rem]">
      <PanelHeader
        title="Auth Timeline"
        description={`${loading ? "Loading auth events..." : `${total} auth events`} shown in chronological order.`}
      />
      <CardContent className="space-y-3">
        <div className="space-y-2">
          {events.map((event) => (
            <Button
              key={event.id}
              variant={
                selectedRecordId === event.recordId || highlightedRecordIds.has(event.recordId)
                  ? "secondary"
                  : "outline"
              }
              className="h-auto w-full items-start justify-start py-3 text-left"
              onClick={() => onSelect(event.recordId)}
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{event.summary}</span>
                  <Badge variant="outline">{getAuthEventKindLabel(event.kind)}</Badge>
                  <Badge variant={getAuthOutcomeBadgeVariant(event.outcome)}>
                    {event.outcome}
                  </Badge>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {formatCompactDateTime(event.timestamp)}
                  {event.userId ? ` | user ${event.userId}` : ""}
                  {event.route ? ` | ${event.route}` : ""}
                  {event.ip ? ` | ${event.ip}` : ""}
                </div>
              </div>
            </Button>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-border/60 pt-3">
          <div className="text-xs text-muted-foreground">
            Showing {events.length ? offset + 1 : 0}-{Math.min(offset + events.length, total)} of {total}
          </div>
          <div className="flex gap-2">
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
              disabled={offset + limit >= total}
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
