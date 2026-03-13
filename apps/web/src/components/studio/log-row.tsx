import { Badge } from "@/components/ui/badge";
import type { StudioRecord } from "@/lib/studio";
import { formatDateTime, getLevelClasses } from "@/lib/studio";

interface LogRowProps {
  record: StudioRecord;
  selected: boolean;
  onSelect(recordId: string): void;
}

export function LogRow({ record, selected, onSelect }: LogRowProps) {
  return (
    <tr
      className={`border-b border-border/60 ${selected ? "bg-primary/10" : "hover:bg-muted/30"}`}
      onClick={() => onSelect(record.id)}
    >
      <td className="px-3 py-2 align-top text-xs text-muted-foreground">{formatDateTime(record.timestamp)}</td>
      <td className="px-3 py-2 align-top">
        <Badge className={getLevelClasses(record.level)}>
          {record.level}
        </Badge>
      </td>
      <td className="max-w-[32rem] px-3 py-2 align-top">
        <div className="line-clamp-2 text-sm">{record.message}</div>
        <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          <span>{record.source}</span>
          {record.type ? <span>{record.type}</span> : null}
          {record.caller ? <span>{record.caller}</span> : null}
        </div>
      </td>
      <td className="px-3 py-2 align-top text-xs text-muted-foreground">{record.fileName}</td>
    </tr>
  );
}
