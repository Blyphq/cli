import { Badge } from "@/components/ui/badge";
import type { StudioErrorOccurrence } from "@/lib/studio";
import { formatDateTime, getLevelClasses } from "@/lib/studio";
import { cn } from "@/lib/utils";

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
  return (
    <button
      type="button"
      onClick={() => onSelect(occurrence.id)}
      className={cn(
        "flex w-full min-w-0 flex-col gap-2 border-b border-border/60 px-4 py-4 text-left transition-colors hover:bg-muted/30",
        selected && "bg-primary/10",
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Badge className={getLevelClasses(occurrence.level)}>{occurrence.level}</Badge>
        <span className="text-sm font-medium">{occurrence.type}</span>
        <span className="text-xs text-muted-foreground">
          {formatDateTime(occurrence.timestamp)}
        </span>
      </div>
      <div className="break-words text-sm text-muted-foreground">
        {occurrence.messageFirstLine}
      </div>
      <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
        <span>
          {occurrence.fingerprintSource.relativePath ??
            occurrence.sourceLocation?.relativePath ??
            occurrence.fileName}
          {occurrence.fingerprintSource.line ? `:${occurrence.fingerprintSource.line}` : ""}
        </span>
        {occurrence.http?.method || occurrence.http?.path || typeof occurrence.http?.statusCode === "number" ? (
          <span>
            {[
              occurrence.http?.method,
              occurrence.http?.path ?? occurrence.http?.url,
              typeof occurrence.http?.statusCode === "number"
                ? String(occurrence.http.statusCode)
                : null,
            ]
              .filter(Boolean)
              .join(" ")}
          </span>
        ) : null}
      </div>
    </button>
  );
}
