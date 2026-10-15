import { ChevronRight, Layers } from "lucide-react";

import type { StudioGroupDetail, StudioLogEntry } from "@/lib/studio";
import {
  formatDateTime,
  formatDurationMs,
  getGroupingReasonLabel,
  getLevelDotClass,
} from "@/lib/studio";
import { cn } from "@/lib/utils";

import {
  formatLogTime,
  handleRowKeyDown,
  LOG_COLUMNS,
  LOG_ROW_INTERACTIVE,
  LOG_ROW_SELECTED,
} from "./log-row";

type StudioGroupSummary = Extract<StudioLogEntry, { kind: "structured-group" }>;

interface GroupSummaryRowProps {
  group: StudioGroupSummary;
  selected: boolean;
  onSelect(groupId: string): void;
}

export function GroupSummaryRow({ group, selected, onSelect }: GroupSummaryRowProps) {
  const reasonLabel = getGroupingReasonLabel(
    group.groupingReason as StudioGroupDetail["group"]["groupingReason"],
  );
  const durationMs = getSpanMs(group.timestampStart, group.timestampEnd);
  const preview = group.previewMessages.find((message) => message !== group.title);
  const fileLabel = group.fileNames.join(", ");

  return (
    <div role="listitem" className="blyp-line-in">
      <div
        tabIndex={0}
        role="button"
        aria-current={selected ? "true" : undefined}
        aria-label={`Group: ${group.title}, ${group.recordCount} log${group.recordCount === 1 ? "" : "s"}`}
        onKeyDown={(event) => handleRowKeyDown(event, group.id, onSelect)}
        onClick={() => onSelect(group.id)}
        className={cn(
          LOG_COLUMNS.row,
          LOG_ROW_INTERACTIVE,
          "bg-muted/25",
          selected && LOG_ROW_SELECTED,
        )}
      >
        <time
          dateTime={group.timestampEnd ?? undefined}
          title={`${formatDateTime(group.timestampStart)} – ${formatDateTime(group.timestampEnd)}`}
          className={LOG_COLUMNS.time}
        >
          {formatLogTime(group.timestampEnd)}
        </time>
        <span className={LOG_COLUMNS.level}>
          <span
            className="flex w-full items-center justify-center gap-1 rounded-[4px] border border-border-strong bg-card py-0.5 text-[0.62rem] font-medium leading-none tabular-nums text-foreground"
            title={`${group.recordCount} log${group.recordCount === 1 ? "" : "s"} in this group`}
          >
            <Layers className="size-2.5 text-muted-foreground" aria-hidden />
            {group.recordCount}
          </span>
        </span>
        <span className={LOG_COLUMNS.source} title={group.type ?? reasonLabel}>
          {group.type ?? reasonLabel}
        </span>
        <span className={cn(LOG_COLUMNS.message, "flex items-center gap-2")}>
          <ChevronRight
            aria-hidden
            className={cn(
              "size-3 shrink-0 text-muted-foreground transition-transform duration-150 ease-out-expo group-hover/line:translate-x-0.5",
              selected && "text-primary",
            )}
          />
          <span className="min-w-0 truncate text-foreground" title={group.title}>
            {group.title}
          </span>
          {preview ? (
            <span
              className="hidden min-w-0 flex-1 truncate text-muted-foreground/70 @3xl:inline"
              title={preview}
            >
              · {preview}
            </span>
          ) : null}
          <span className="ml-auto flex shrink-0 items-center gap-2 pl-1">
            {group.levelSummary.length > 0 ? (
              <span
                className="flex items-center gap-0.5"
                title={`Levels: ${group.levelSummary.join(", ")}`}
              >
                {group.levelSummary.map((level) => (
                  <span
                    key={level}
                    aria-hidden
                    className={cn("size-1.5 rounded-full", getLevelDotClass(level))}
                  />
                ))}
              </span>
            ) : null}
            {durationMs !== null ? (
              <span className="text-[0.7rem] tabular-nums text-muted-foreground">
                {formatDurationMs(durationMs)}
              </span>
            ) : null}
          </span>
        </span>
        <span
          className={cn(LOG_COLUMNS.location, "truncate text-[0.7rem] text-muted-foreground/80")}
          title={fileLabel}
        >
          {group.fileNames.length > 1 ? `${group.fileNames.length} sources` : fileLabel}
        </span>
      </div>
    </div>
  );
}

function getSpanMs(start: string | null, end: string | null): number | null {
  if (!start || !end) {
    return null;
  }

  const span = new Date(end).getTime() - new Date(start).getTime();
  return Number.isFinite(span) && span >= 0 ? span : null;
}
