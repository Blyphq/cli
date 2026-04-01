import { Badge } from "@/components/ui/badge";
import type { StudioErrorGroup } from "@/lib/studio";
import {
  formatRelativeToSessionStart,
  getErrorGroupStatusLabel,
} from "@/lib/studio";
import { cn } from "@/lib/utils";

import { ErrorSparkline } from "./error-sparkline";

interface ErrorGroupRowProps {
  group: StudioErrorGroup;
  selected: boolean;
  sessionStart: string | null;
  resolvedAt?: string | null;
  ignored?: boolean;
  onSelect(fingerprint: string): void;
}

export function ErrorGroupRow({
  group,
  selected,
  sessionStart,
  resolvedAt,
  ignored,
  onSelect,
}: ErrorGroupRowProps) {
  const status = getErrorGroupStatusLabel(group, { resolvedAt, ignored });
  const source =
    group.fingerprintSource.relativePath
      ? `${group.fingerprintSource.relativePath}${group.fingerprintSource.line ? `:${group.fingerprintSource.line}` : ""}`
      :
    (group.sourceLocation
      ? `${group.sourceLocation.relativePath}:${group.sourceLocation.line}`
      : "Unknown source");

  return (
    <button
      type="button"
      onClick={() => onSelect(group.fingerprint)}
      className={cn(
        "flex w-full min-w-0 flex-col gap-3 border-b border-border/60 px-4 py-4 text-left transition-colors hover:bg-muted/30",
        selected && "bg-primary/10",
      )}
    >
      <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="truncate text-sm font-medium">{group.errorType}</div>
            <Badge variant={status === "Resolved" ? "secondary" : status === "Recurring" ? "destructive" : "outline"}>
              {status}
            </Badge>
            <Badge variant="secondary">
              {group.occurrenceCount} time{group.occurrenceCount === 1 ? "" : "s"}
            </Badge>
          </div>
          <div className="break-words text-sm text-muted-foreground">
            {group.messageFirstLine}
          </div>
          <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
            <span>First seen {formatRelativeToSessionStart(group.firstSeenAt, sessionStart)}</span>
            <span>Last seen {formatRelativeToSessionStart(group.lastSeenAt, sessionStart)}</span>
            <span>{source}</span>
            {group.http?.method || group.http?.path || typeof group.http?.statusCode === "number" ? (
              <span>
                {[
                  group.http?.method,
                  group.http?.path ?? group.http?.url,
                  typeof group.http?.statusCode === "number" ? String(group.http.statusCode) : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
              </span>
            ) : null}
          </div>
          {group.sectionTags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {group.sectionTags.map((tag) => (
                <Badge key={`${group.fingerprint}:${tag}`} variant="muted">
                  {tag}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <ErrorSparkline buckets={group.sparklineBuckets} />
        </div>
      </div>
    </button>
  );
}
