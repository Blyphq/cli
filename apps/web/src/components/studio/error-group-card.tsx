import type { KeyboardEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { StudioErrorGroup } from "@/lib/studio";
import { formatCompactDateTime } from "@/lib/studio";
import { cn } from "@/lib/utils";

import { Sparkline } from "./sparkline";

interface ErrorGroupCardProps {
  group: StudioErrorGroup;
  selected: boolean;
  onSelect(groupId: string): void;
  onResolve(groupId: string): void;
  onIgnore(groupId: string): void;
}

export function ErrorGroupCard({
  group,
  selected,
  onSelect,
  onResolve,
  onIgnore,
}: ErrorGroupCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(group.id)}
      onKeyDown={(event) => handleCardKeyDown(event, group.id, onSelect)}
      className={cn(
        "w-full space-y-3 border border-border/60 bg-background/50 p-4 text-left transition-colors hover:bg-muted/30",
        selected && "border-primary/50 bg-primary/5",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="truncate text-sm font-medium">
              {group.errorType ?? "Error"}
            </div>
            <Badge variant={group.statusHint === "new" ? "default" : "secondary"}>
              {group.statusHint === "new" ? "New" : "Recurring"}
            </Badge>
          </div>
          <div className="line-clamp-2 break-words text-sm text-muted-foreground">
            {group.message}
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          {group.occurrenceCount} time{group.occurrenceCount === 1 ? "" : "s"}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex min-w-0 flex-wrap gap-2 text-[11px] text-muted-foreground">
            <span>First {formatCompactDateTime(group.firstSeen)}</span>
            <span>Last {formatCompactDateTime(group.lastSeen)}</span>
            {group.sourceFile ? (
              <span>
                {group.sourceFile}:{group.sourceLine ?? "?"}
              </span>
            ) : null}
            {group.http?.method && group.http?.route ? (
              <span>
                {group.http.method} {group.http.route} {group.http.statusCode ?? ""}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {group.tags.map((tag) => (
              <Badge key={`${group.id}:${tag.id}`} variant="outline">
                {tag.label}
              </Badge>
            ))}
          </div>
        </div>
        <Sparkline points={group.sparkline} className="h-6 w-24 shrink-0 text-primary" />
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          aria-label={`Resolve ${group.errorType ?? group.message}`}
          variant="outline"
          size="xs"
          onClick={(event) => {
            event.stopPropagation();
            onResolve(group.id);
          }}
        >
          Resolved
        </Button>
        <Button
          type="button"
          aria-label={`Ignore ${group.errorType ?? group.message}`}
          variant="outline"
          size="xs"
          onClick={(event) => {
            event.stopPropagation();
            onIgnore(group.id);
          }}
        >
          Ignore
        </Button>
      </div>
    </div>
  );
}

function handleCardKeyDown(
  event: KeyboardEvent<HTMLDivElement>,
  groupId: string,
  onSelect: (groupId: string) => void,
) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onSelect(groupId);
  }
}
