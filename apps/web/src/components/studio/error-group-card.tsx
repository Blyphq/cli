import type { KeyboardEvent } from "react";

import { CheckCircle2, EyeOff, FileCode2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { StudioErrorGroup } from "@/lib/studio";
import { formatCompactDateTime, formatDateTime } from "@/lib/studio";
import { cn } from "@/lib/utils";

import {
  ERROR_ROW_BASE,
  ERROR_ROW_SELECTED,
  formatErrorHttpSummary,
  getErrorSourceLabel,
  getErrorStatusBadgeVariant,
} from "./error-group-row";
import { ErrorSparkline } from "./error-sparkline";

interface ErrorGroupCardProps {
  group: StudioErrorGroup;
  selected: boolean;
  onSelect(groupId: string): void;
  onResolve?(groupId: string): void;
  onIgnore(groupId: string): void;
}

/** Issue-tracker style row with inline Resolve / Ignore actions. */
export function ErrorGroupCard({
  group,
  selected,
  onSelect,
  onResolve,
  onIgnore,
}: ErrorGroupCardProps) {
  const source = getErrorSourceLabel(group);
  const http = formatErrorHttpSummary(group.http);
  const statusLabel = group.occurrenceCount > 1 ? "Recurring" : "New";
  const name = group.errorType ?? group.message;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={selected ? "true" : undefined}
      onClick={() => onSelect(group.fingerprint)}
      onKeyDown={(event) => handleCardKeyDown(event, group.fingerprint, onSelect)}
      className={cn(ERROR_ROW_BASE, "cursor-pointer items-start", selected && ERROR_ROW_SELECTED)}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[0.82rem] font-medium text-foreground">
            {group.errorType ?? "Error"}
          </span>
          <Badge variant={getErrorStatusBadgeVariant(statusLabel)}>{statusLabel}</Badge>
        </div>
        <div className="line-clamp-2 text-[0.78rem] break-words text-muted-foreground">
          {group.messageFirstLine}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[0.68rem] tabular-nums text-muted-foreground/90">
          {source ? (
            <span className="inline-flex min-w-0 items-center gap-1" title={source}>
              <FileCode2 aria-hidden className="size-3 shrink-0 text-muted-foreground/70" />
              <span className="truncate">{source}</span>
            </span>
          ) : null}
          {http ? <span className="truncate">{http}</span> : null}
          <span title={formatDateTime(group.firstSeenAt)}>first {formatCompactDateTime(group.firstSeenAt)}</span>
          <span title={formatDateTime(group.lastSeenAt)}>last {formatCompactDateTime(group.lastSeenAt)}</span>
          {group.sectionTags.map((tag) => (
            <span
              key={`${group.fingerprint}:${tag}`}
              className="inline-flex h-4 items-center rounded-[3px] bg-muted px-1 text-[0.62rem] text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <div className="flex items-center gap-3">
          <ErrorSparkline buckets={group.sparklineBuckets} className="hidden h-6 w-20 sm:block" />
          <span className="font-mono text-[0.8rem] font-medium tabular-nums text-foreground">
            {group.occurrenceCount.toLocaleString()}
            <span className="ml-1 font-sans text-[0.66rem] font-normal text-muted-foreground">
              {group.occurrenceCount === 1 ? "event" : "events"}
            </span>
          </span>
        </div>
        <div className="flex gap-1 opacity-100 transition-opacity duration-150 sm:opacity-0 sm:group-hover/row:opacity-100 sm:group-focus-within/row:opacity-100">
          {onResolve ? (
            <Button
              type="button"
              aria-label={`Resolve ${name}`}
              variant="outline"
              size="xs"
              onClick={(event) => {
                event.stopPropagation();
                onResolve(group.fingerprint);
              }}
            >
              <CheckCircle2 />
              Resolve
            </Button>
          ) : null}
          <Button
            type="button"
            aria-label={`Ignore ${name}`}
            variant="outline"
            size="xs"
            onClick={(event) => {
              event.stopPropagation();
              onIgnore(group.fingerprint);
            }}
          >
            <EyeOff />
            Ignore
          </Button>
        </div>
      </div>
    </div>
  );
}

function handleCardKeyDown(
  event: KeyboardEvent<HTMLDivElement>,
  groupId: string,
  onSelect: (groupId: string) => void,
) {
  if (event.target !== event.currentTarget) {
    return;
  }

  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onSelect(groupId);
  }
}
