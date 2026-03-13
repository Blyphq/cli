import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { StudioRecord } from "@/lib/studio";
import { formatDateTime, getLevelClasses } from "@/lib/studio";

import { EmptyState } from "./empty-state";
import { HttpLogDetail } from "./http-log-detail";
import { JsonDetailBlock } from "./json-detail-block";
import { MetaList } from "./meta-list";
import { PanelHeader } from "./panel-header";
import { TruncatedPath } from "./truncated-path";

interface LogDetailPanelProps {
  record: StudioRecord | null;
  onDescribeWithAi?(): void;
}

export function LogDetailPanel({ record, onDescribeWithAi }: LogDetailPanelProps) {
  if (!record) {
    return (
      <EmptyState
        title="Select a record"
        description="Choose a log row to inspect the structured payload, file source, and HTTP details."
      />
    );
  }

  return (
    <div className="min-w-0 space-y-4">
      <Card>
        <PanelHeader
          title={
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <span className="min-w-0 break-words text-balance">{record.message}</span>
              <Badge className={getLevelClasses(record.level)}>{record.level}</Badge>
            </div>
          }
          description={formatDateTime(record.timestamp)}
          action={
            onDescribeWithAi ? (
              <Button variant="secondary" size="xs" onClick={onDescribeWithAi}>
                Describe with AI
              </Button>
            ) : null
          }
        />
        <CardContent className="space-y-4 min-w-0">
          <MetaList
            items={[
              { label: "Source", value: record.source },
              { label: "Type", value: record.type ?? "n/a" },
              { label: "Caller", value: record.caller ?? "n/a" },
              {
                label: "File",
                value: (
                  <div className="space-y-1">
                    <TruncatedPath
                      value={record.filePath ?? record.fileName}
                      variant="block"
                    />
                    <div className="text-xs text-muted-foreground">
                      Line {record.lineNumber}
                    </div>
                  </div>
                ),
              },
            ]}
          />
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
