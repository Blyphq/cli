import { FileCode2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { StudioErrorOccurrence } from "@/lib/studio";
import { formatDateTime, getLevelClasses } from "@/lib/studio";
import { cn } from "@/lib/utils";

import {
  ERROR_ROW_BASE,
  ERROR_ROW_SELECTED,
  formatErrorHttpSummary,
} from "./error-group-row";

/** Shared column widths so the raw list header and rows line up. */
export const ERROR_RAW_COLUMNS = {
  time: "w-[5.75rem] shrink-0",
  level: "flex w-16 shrink-0 justify-center",
};

/** `HH:MM:SS.mmm` clock time, like the docs' log rows. Falls back to the raw value. */
export function formatClockTime(value: string | null | undefined): string {
  if (!value) {
    return "--:--:--";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const pad = (input: number, size = 2) => String(input).padStart(size, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

interface ErrorRawRowProps {
  occurrence: StudioErrorOccurrence;
  selected: boolean;
  onSelect(id: string): void;
}

export function ErrorRawRow({
  occurrence,
  selected,
  onSelect,
}: ErrorRawRowProps) {
  const source =
    occurrence.fingerprintSource.relativePath ??
    occurrence.sourceLocation?.relativePath ??
    occurrence.fileName;
  const sourceLabel = `${source}${occurrence.fingerprintSource.line ? `:${occurrence.fingerprintSource.line}` : ""}`;
  const http = formatErrorHttpSummary(occurrence.http);

  return (
    <button
      type="button"
      aria-current={selected ? "true" : undefined}
      onClick={() => onSelect(occurrence.id)}
      className={cn(ERROR_ROW_BASE, "items-start gap-3 py-2", selected && ERROR_ROW_SELECTED)}
    >
      <span
        className={cn(
          ERROR_RAW_COLUMNS.time,
          "pt-0.5 font-mono text-[0.72rem] tabular-nums text-muted-foreground/80",
        )}
        title={formatDateTime(occurrence.timestamp)}
      >
        {formatClockTime(occurrence.timestamp)}
      </span>
      <span className={cn(ERROR_RAW_COLUMNS.level, "pt-px")}>
        <Badge className={getLevelClasses(occurrence.level)}>{occurrence.level}</Badge>
      </span>
      <span className="block min-w-0 flex-1 space-y-1">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 text-[0.8rem] font-medium text-foreground">{occurrence.type}</span>
          <span className="min-w-0 truncate text-[0.78rem] text-muted-foreground">
            {occurrence.messageFirstLine}
          </span>
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[0.68rem] tabular-nums text-muted-foreground/90">
          <span className="inline-flex min-w-0 items-center gap-1" title={sourceLabel}>
            <FileCode2 aria-hidden className="size-3 shrink-0 text-muted-foreground/70" />
            <span className="truncate">{sourceLabel}</span>
          </span>
          {http ? <span className="truncate">{http}</span> : null}
        </span>
      </span>
    </button>
  );
}
