import { FileCode2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { StudioErrorGroup } from "@/lib/studio";
import {
  formatDateTime,
  formatRelativeToSessionStart,
  getErrorGroupStatusLabel,
} from "@/lib/studio";
import { cn } from "@/lib/utils";

import { ErrorSparkline } from "./error-sparkline";

type ErrorStatusLabel = ReturnType<typeof getErrorGroupStatusLabel>;
type ErrorHttpSummary = {
  method?: string | null;
  path?: string | null;
  url?: string | null;
  statusCode?: number | null;
} | null | undefined;

/** `file:line` for a group or occurrence, preferring the fingerprint source. */
export function getErrorSourceLabel(
  item: Pick<StudioErrorGroup, "fingerprintSource" | "sourceLocation"> & { fileName?: string },
): string | null {
  if (item.fingerprintSource.relativePath) {
    return `${item.fingerprintSource.relativePath}${item.fingerprintSource.line ? `:${item.fingerprintSource.line}` : ""}`;
  }
  if (item.sourceLocation) {
    return `${item.sourceLocation.relativePath}:${item.sourceLocation.line}`;
  }
  return item.fileName ?? null;
}

/** "METHOD /path STATUS" — keeps status code 0. Returns null when there is nothing to show. */
export function formatErrorHttpSummary(http: ErrorHttpSummary): string | null {
  if (!http) {
    return null;
  }
  const parts = [
    http.method,
    http.path ?? http.url,
    typeof http.statusCode === "number" ? String(http.statusCode) : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : null;
}

export function getErrorStatusBadgeVariant(status: ErrorStatusLabel) {
  switch (status) {
    case "Recurring":
      return "destructive" as const;
    case "Resolved":
      return "success" as const;
    case "Ignored":
      return "muted" as const;
    default:
      return "default" as const;
  }
}

/** Shared grid columns so the list header and rows line up. */
export const ERROR_GROUP_COLUMNS = {
  trend: "hidden w-24 shrink-0 @lg/errors:block",
  events: "block w-14 shrink-0 text-right",
  seen: "hidden w-[5.5rem] shrink-0 text-right @xl/errors:block",
};

export const ERROR_ROW_BASE =
  "group/row relative flex w-full min-w-0 items-center gap-4 px-4 py-2.5 text-left outline-none transition-colors duration-150 hover:bg-muted/60 focus-visible:bg-muted";
export const ERROR_ROW_SELECTED =
  "bg-primary-soft/50 shadow-[inset_2px_0_0_var(--signal)] hover:bg-primary-soft/60";

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
  const source = getErrorSourceLabel(group) ?? "Unknown source";
  const http = formatErrorHttpSummary(group.http);
  const settled = status === "Resolved" || status === "Ignored";

  return (
    <button
      type="button"
      aria-current={selected ? "true" : undefined}
      onClick={() => onSelect(group.fingerprint)}
      className={cn(ERROR_ROW_BASE, selected && ERROR_ROW_SELECTED)}
    >
      <span className={cn("block min-w-0 flex-1 space-y-1", settled && "opacity-70")}>
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[0.82rem] font-medium text-foreground">{group.errorType}</span>
          <Badge variant={getErrorStatusBadgeVariant(status)}>{status}</Badge>
        </span>
        <span className="block truncate text-[0.78rem] text-muted-foreground">{group.messageFirstLine}</span>
        <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[0.68rem] tabular-nums text-muted-foreground/90">
          <span className="inline-flex min-w-0 items-center gap-1" title={source}>
            <FileCode2 aria-hidden className="size-3 shrink-0 text-muted-foreground/70" />
            <span className="truncate">{source}</span>
          </span>
          {http ? <span className="truncate">{http}</span> : null}
          <span className="@xl/errors:hidden" title={formatDateTime(group.lastSeenAt)}>
            last {formatRelativeToSessionStart(group.lastSeenAt, sessionStart)}
          </span>
          {group.sectionTags.length > 0 ? (
            <span className="inline-flex min-w-0 flex-wrap items-center gap-1">
              {group.sectionTags.map((tag) => (
                <span
                  key={`${group.fingerprint}:${tag}`}
                  className="inline-flex h-4 items-center rounded-[3px] bg-muted px-1 text-[0.62rem] text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </span>
          ) : null}
        </span>
      </span>
      <ErrorSparkline buckets={group.sparklineBuckets} className={cn(ERROR_GROUP_COLUMNS.trend, "h-7")} />
      <span className={ERROR_GROUP_COLUMNS.events}>
        <span className="block font-mono text-[0.8rem] font-medium tabular-nums text-foreground">
          {group.occurrenceCount.toLocaleString()}
        </span>
        <span className="block text-[0.66rem] text-muted-foreground">
          {group.occurrenceCount === 1 ? "event" : "events"}
        </span>
      </span>
      <span className={cn(ERROR_GROUP_COLUMNS.seen, "font-mono text-[0.7rem] tabular-nums")}>
        <span className="block text-foreground/80" title={`Last seen ${formatDateTime(group.lastSeenAt)}`}>
          {formatRelativeToSessionStart(group.lastSeenAt, sessionStart)}
        </span>
        <span className="block text-muted-foreground/80" title={`First seen ${formatDateTime(group.firstSeenAt)}`}>
          {formatRelativeToSessionStart(group.firstSeenAt, sessionStart)}
        </span>
      </span>
    </button>
  );
}
