import { FileSearch, Sparkles, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { StudioRecord, StudioRecordSourceContext } from "@/lib/studio";
import { formatDateTime } from "@/lib/studio";

import { EmptyState } from "./empty-state";
import { HttpLogDetail } from "./http-log-detail";
import { JsonDetailBlock } from "./json-detail-block";
import { LevelPill } from "./log-row";
import { MetaList } from "./meta-list";
import { SourceContextPanel } from "./source-context-panel";
import { MonoChip } from "./studio-primitives";
import { TruncatedPath } from "./truncated-path";

interface LogDetailPanelProps {
  record: StudioRecord | null;
  source?: StudioRecordSourceContext | null;
  sourceLoading?: boolean;
  onDescribeWithAi?(): void;
}

export function LogDetailPanel({
  record,
  source,
  sourceLoading = false,
  onDescribeWithAi,
}: LogDetailPanelProps) {
  if (!record) {
    return (
      <EmptyState
        icon={<FileSearch />}
        title="Select a record"
        description="Choose a log row to inspect the structured payload, file source, and HTTP details."
      />
    );
  }

  const isDatabaseRecord = record.filePath?.startsWith("database://");
  const lineLabel =
    record.lineNumber === 0 && isDatabaseRecord ? "Database row" : `Line ${record.lineNumber}`;

  return (
    <div className="min-w-0 space-y-4">
      <Card className="min-w-0 gap-0 py-0">
        <div className="flex min-w-0 flex-col gap-3 px-4 pt-4 pb-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="w-14 shrink-0">
              <LevelPill level={record.level} />
            </span>
            <time
              dateTime={record.timestamp ?? undefined}
              className="min-w-0 flex-1 truncate font-mono text-[0.72rem] tabular-nums text-muted-foreground/80"
            >
              {formatDateTime(record.timestamp)}
            </time>
            {onDescribeWithAi ? (
              <Button variant="outline" size="xs" onClick={onDescribeWithAi}>
                <Sparkles className="text-primary" />
                Describe with AI
              </Button>
            ) : null}
          </div>
          <h2 className="font-heading text-[0.95rem] font-semibold leading-snug tracking-[-0.02em] text-pretty break-words text-foreground">
            {record.message}
          </h2>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <MonoChip title="Source">{record.source}</MonoChip>
            {record.type ? <MonoChip title="Type">{record.type}</MonoChip> : null}
            <MonoChip title={record.filePath ?? record.fileName} className="max-w-[16rem]">
              <span className="truncate">
                {record.fileName}
                {isDatabaseRecord && record.lineNumber === 0 ? "" : `:${record.lineNumber}`}
              </span>
            </MonoChip>
          </div>
        </div>
        <CardContent className="min-w-0 space-y-3 border-t border-border py-3">
          <MetaList
            items={[
              {
                label: "Caller",
                value: record.caller ? (
                  <TruncatedPath value={record.caller} variant="block" />
                ) : (
                  <span className="text-muted-foreground">n/a</span>
                ),
              },
              {
                label: isDatabaseRecord ? "Source" : "File",
                value: (
                  <div className="min-w-0 space-y-0.5">
                    <TruncatedPath value={record.filePath ?? record.fileName} variant="block" />
                    <div className="font-mono text-[0.68rem] tabular-nums text-muted-foreground/70">
                      {lineLabel}
                    </div>
                  </div>
                ),
              },
            ]}
          />
          {record.malformed ? (
            <div className="flex items-start gap-2 rounded-md border border-level-warn/30 bg-level-warn/[0.06] px-3 py-2 text-[0.75rem] leading-relaxed text-foreground/90">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-level-warn" />
              This line could not be parsed as JSON. Studio kept it as a fallback record.
            </div>
          ) : null}
        </CardContent>
      </Card>
      <SourceContextPanel source={source} loading={sourceLoading} />
      {record.http ? <HttpLogDetail record={record} /> : null}
      {record.bindings ? <JsonDetailBlock title="Bindings" value={record.bindings} /> : null}
      {record.data !== undefined ? <JsonDetailBlock title="Data" value={record.data} /> : null}
      <JsonDetailBlock title="Raw Record" value={record.raw} />
    </div>
  );
}
