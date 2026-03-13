import type { KeyboardEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { StudioRecord } from "@/lib/studio";
import {
  formatCompactDateTime,
  formatDateTime,
  getLevelClasses,
} from "@/lib/studio";

interface LogRowProps {
  record: StudioRecord;
  selected: boolean;
  onSelect(recordId: string): void;
  variant?: "desktop" | "mobile";
}

export function LogRow({
  record,
  selected,
  onSelect,
  variant = "desktop",
}: LogRowProps) {
  if (variant === "mobile") {
    return (
      <button
        type="button"
        onClick={() => onSelect(record.id)}
        className={cn(
          "flex w-full min-w-0 flex-col gap-3 px-3 py-3 text-left transition-colors outline-none hover:bg-muted/30 focus-visible:bg-muted/40",
          selected && "bg-primary/10",
        )}
      >
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0 text-xs text-muted-foreground">
            {formatCompactDateTime(record.timestamp)}
          </div>
          <Badge className={cn("shrink-0", getLevelClasses(record.level))}>
            {record.level}
          </Badge>
        </div>
        <div className="min-w-0 space-y-1">
          <div className="line-clamp-3 text-sm font-medium break-words">
            {record.message}
          </div>
          <div className="flex min-w-0 flex-wrap gap-2 text-[11px] text-muted-foreground">
            <span>{record.source}</span>
            {record.type ? <span>{record.type}</span> : null}
            {record.caller ? (
              <span className="max-w-full truncate" title={record.caller}>
                {record.caller}
              </span>
            ) : null}
          </div>
        </div>
        <div
          className="truncate text-[11px] text-muted-foreground"
          title={record.fileName}
        >
          {record.fileName}
        </div>
      </button>
    );
  }

  return (
    <tr
      tabIndex={0}
      role="button"
      onKeyDown={(event) => handleRowKeyDown(event, record.id, onSelect)}
      className={cn(
        "cursor-pointer border-b border-border/60 outline-none hover:bg-muted/30 focus-visible:bg-muted/40",
        selected && "bg-primary/10",
      )}
      onClick={() => onSelect(record.id)}
    >
      <td className="w-36 px-3 py-2 align-top text-xs text-muted-foreground">
        {formatDateTime(record.timestamp)}
      </td>
      <td className="w-24 px-3 py-2 align-top">
        <Badge className={getLevelClasses(record.level)}>
          {record.level}
        </Badge>
      </td>
      <td className="w-[60%] min-w-0 px-3 py-2 align-top">
        <div className="line-clamp-2 break-words text-sm" title={record.message}>
          {record.message}
        </div>
        <div className="mt-1 flex min-w-0 flex-wrap gap-2 text-[11px] text-muted-foreground">
          <span>{record.source}</span>
          {record.type ? <span>{record.type}</span> : null}
          {record.caller ? (
            <span className="max-w-full truncate" title={record.caller}>
              {record.caller}
            </span>
          ) : null}
        </div>
      </td>
      <td
        className="w-44 px-3 py-2 align-top text-xs text-muted-foreground"
        title={record.fileName}
      >
        <span className="block truncate">{record.fileName}</span>
      </td>
    </tr>
  );
}

function handleRowKeyDown(
  event: KeyboardEvent<HTMLTableRowElement>,
  recordId: string,
  onSelect: (recordId: string) => void,
) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onSelect(recordId);
  }
}
