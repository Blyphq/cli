import type { KeyboardEvent } from "react";

import { Badge } from "@/components/ui/badge";
import type { StudioGroupDetail, StudioLogEntry } from "@/lib/studio";
import {
  formatCompactDateTime,
  formatDateTime,
  getGroupingReasonLabel,
} from "@/lib/studio";
import { cn } from "@/lib/utils";

type StudioGroupSummary = Extract<StudioLogEntry, { kind: "structured-group" }>;

interface GroupSummaryRowProps {
  group: StudioGroupSummary;
  selected: boolean;
  onSelect(groupId: string): void;
  variant?: "desktop" | "mobile";
}

export function GroupSummaryRow({
  group,
  selected,
  onSelect,
  variant = "desktop",
}: GroupSummaryRowProps) {
  const reasonLabel = getGroupingReasonLabel(
    group.groupingReason as StudioGroupDetail["group"]["groupingReason"],
  );

  if (variant === "mobile") {
    return (
      <button
        type="button"
        onClick={() => onSelect(group.id)}
        className={cn(
          "flex w-full min-w-0 flex-col gap-3 px-3 py-3 text-left transition-colors outline-none hover:bg-muted/30 focus-visible:bg-muted/40",
          selected && "bg-primary/10",
        )}
      >
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium" title={group.title}>
              {group.title}
            </div>
            <div className="text-xs text-muted-foreground">
              {formatCompactDateTime(group.timestampEnd)}
            </div>
          </div>
          <Badge variant="secondary">{group.recordCount} log{group.recordCount === 1 ? "" : "s"}</Badge>
        </div>
        <div className="flex min-w-0 flex-wrap gap-2 text-[11px] text-muted-foreground">
          {group.type ? <Badge variant="outline">{group.type}</Badge> : null}
          <Badge variant="muted">{reasonLabel}</Badge>
          <span>{group.fileNames.length} source{group.fileNames.length === 1 ? "" : "s"}</span>
        </div>
        <div className="space-y-1 text-[11px] text-muted-foreground">
          {group.previewMessages.map((message) => (
            <div key={`${group.id}:${message}`} className="line-clamp-1 break-words">
              {message}
            </div>
          ))}
        </div>
      </button>
    );
  }

  return (
    <tr
      tabIndex={0}
      role="button"
      onKeyDown={(event) => handleRowKeyDown(event, group.id, onSelect)}
      className={cn(
        "cursor-pointer border-b border-border/60 outline-none hover:bg-muted/30 focus-visible:bg-muted/40",
        selected && "bg-primary/10",
      )}
      onClick={() => onSelect(group.id)}
    >
      <td className="w-36 px-3 py-2 align-top text-xs text-muted-foreground">
        {formatDateTime(group.timestampEnd)}
      </td>
      <td className="w-24 px-3 py-2 align-top">
        <Badge variant="secondary">{group.recordCount} log{group.recordCount === 1 ? "" : "s"}</Badge>
      </td>
      <td className="min-w-0 px-3 py-2 align-top">
        <div className="min-w-0 space-y-1">
          <div className="truncate text-sm font-medium" title={group.title}>
            {group.title}
          </div>
          <div className="flex min-w-0 flex-wrap gap-2 text-[11px] text-muted-foreground">
            {group.type ? <Badge variant="outline">{group.type}</Badge> : null}
            <Badge variant="muted">{reasonLabel}</Badge>
            <span>{group.fileNames.length} source{group.fileNames.length === 1 ? "" : "s"}</span>
          </div>
          <div className="space-y-1 text-[11px] text-muted-foreground">
            {group.previewMessages.map((message) => (
              <div key={`${group.id}:${message}`} className="line-clamp-1 break-words">
                {message}
              </div>
            ))}
          </div>
        </div>
      </td>
      <td
        className="w-44 px-3 py-2 align-top text-xs text-muted-foreground"
        title={group.fileNames.join(", ")}
      >
        <span className="block truncate">{group.fileNames.join(", ")}</span>
      </td>
    </tr>
  );
}

function handleRowKeyDown(
  event: KeyboardEvent<HTMLTableRowElement>,
  groupId: string,
  onSelect: (groupId: string) => void,
) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onSelect(groupId);
  }
}
