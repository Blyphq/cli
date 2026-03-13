import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { StudioRecord } from "@/lib/studio";
import { formatDateTime, getLevelClasses } from "@/lib/studio";

import { EmptyState } from "./empty-state";
import { HttpLogDetail } from "./http-log-detail";
import { JsonDetailBlock } from "./json-detail-block";

interface LogDetailPanelProps {
  record: StudioRecord | null;
}

export function LogDetailPanel({ record }: LogDetailPanelProps) {
  if (!record) {
    return (
      <EmptyState
        title="Select a record"
        description="Choose a log row to inspect the structured payload, file source, and HTTP details."
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="border-b border-border/60">
          <CardTitle className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate">{record.message}</span>
            <Badge className={getLevelClasses(record.level)}>
              {record.level}
            </Badge>
          </CardTitle>
          <CardDescription>{formatDateTime(record.timestamp)}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Detail label="Source" value={record.source} />
          <Detail label="Type" value={record.type ?? "n/a"} />
          <Detail label="Caller" value={record.caller ?? "n/a"} />
          <Detail label="File" value={`${record.fileName}:${record.lineNumber}`} />
          {record.malformed ? (
            <div className="border border-secondary bg-secondary/40 p-3 text-xs text-secondary-foreground">
              This line could not be parsed as JSON. Studio kept it as a fallback record.
            </div>
          ) : null}
        </CardContent>
      </Card>
      {record.http ? <HttpLogDetail record={record} /> : null}
      {record.bindings ? <JsonDetailBlock title="Bindings" value={record.bindings} /> : null}
      {record.data !== undefined ? <JsonDetailBlock title="Data" value={record.data} /> : null}
      <JsonDetailBlock title="Raw Record" value={record.raw} />
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="break-words text-sm">{value}</div>
    </div>
  );
}
