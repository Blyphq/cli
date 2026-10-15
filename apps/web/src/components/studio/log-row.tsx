import type { KeyboardEvent } from "react";

import type { StudioRecord } from "@/lib/studio";
import { formatDateTime, getLevelClasses } from "@/lib/studio";
import { cn } from "@/lib/utils";

/**
 * Column layout shared by the log list header, record rows and grouped rows.
 * Mirrors the Studio preview on blyp.dev: mono timestamp, fixed-width level
 * pill, muted source column, message, and (on wide containers) a location.
 * Widths respond to the list's container (`@container` on the list body).
 */
export const LOG_COLUMNS = {
  row: "group/line flex flex-wrap items-center gap-x-2.5 gap-y-1 px-3 py-1.5 font-mono text-[0.75rem] @lg:flex-nowrap",
  time: "w-[5.75rem] shrink-0 tabular-nums text-muted-foreground/70",
  level: "w-14 shrink-0",
  source: "w-16 shrink-0 truncate text-muted-foreground @2xl:w-20",
  message: "min-w-0 basis-full truncate @lg:basis-auto @lg:flex-1",
  location: "hidden w-40 shrink-0 text-right @4xl:block",
} as const;

export const LOG_ROW_INTERACTIVE =
  "relative cursor-pointer outline-none transition-colors duration-150 hover:bg-muted focus-visible:bg-muted";

export const LOG_ROW_SELECTED =
  "bg-primary-soft/50 shadow-[inset_2px_0_0_var(--signal)] hover:bg-primary-soft/70 focus-visible:bg-primary-soft/70";

export function LevelPill({ level, className }: { level: string; className?: string }) {
  return (
    <span
      className={cn(
        "block w-full truncate rounded-[4px] border py-0.5 text-center text-[0.62rem] font-medium uppercase leading-none tracking-[0.06em]",
        getLevelClasses(level),
        className,
      )}
    >
      {level}
    </span>
  );
}

/** `HH:MM:SS.mmm` in local time, like the docs' log stream. */
export function formatLogTime(value: string | null | undefined): string {
  if (!value) {
    return "--:--:--.---";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  const pad = (part: number, length = 2) => String(part).padStart(length, "0");

  return `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}:${pad(parsed.getSeconds())}.${pad(parsed.getMilliseconds(), 3)}`;
}

interface LogRowProps {
  record: StudioRecord;
  selected: boolean;
  onSelect(recordId: string): void;
}

export function LogRow({ record, selected, onSelect }: LogRowProps) {
  const location = record.caller ?? record.fileName;
  const sourceLabel = record.type ?? record.source;

  return (
    <div role="listitem" className="blyp-line-in">
      <div
        tabIndex={0}
        role="button"
        aria-current={selected ? "true" : undefined}
        aria-label={`${record.level} ${record.message}`}
        onKeyDown={(event) => handleRowKeyDown(event, record.id, onSelect)}
        onClick={() => onSelect(record.id)}
        className={cn(LOG_COLUMNS.row, LOG_ROW_INTERACTIVE, selected && LOG_ROW_SELECTED)}
      >
        <time
          dateTime={record.timestamp ?? undefined}
          title={formatDateTime(record.timestamp)}
          className={LOG_COLUMNS.time}
        >
          {formatLogTime(record.timestamp)}
        </time>
        <span className={LOG_COLUMNS.level}>
          <LevelPill level={record.level} />
        </span>
        <span className={LOG_COLUMNS.source} title={sourceLabel}>
          {sourceLabel}
        </span>
        <span
          className={cn(
            LOG_COLUMNS.message,
            record.malformed ? "text-muted-foreground italic" : "text-foreground",
          )}
          title={record.message}
        >
          {record.message}
        </span>
        <span
          className={cn(LOG_COLUMNS.location, "truncate text-[0.7rem] text-muted-foreground/80")}
          title={record.caller ? `${record.caller}\n${record.filePath}` : record.filePath}
          dir="rtl"
        >
          <bdi>{location}</bdi>
        </span>
      </div>
    </div>
  );
}

export function handleRowKeyDown(
  event: KeyboardEvent<HTMLElement>,
  id: string,
  onSelect: (id: string) => void,
) {
  if (event.target !== event.currentTarget) {
    return;
  }

  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onSelect(id);
  }
}
