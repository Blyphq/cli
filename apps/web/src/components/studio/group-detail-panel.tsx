import { ChevronDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { StudioGroupDetail } from "@/lib/studio";
import {
  formatCompactDateTime,
  getGroupingReasonLabel,
  getLevelClasses,
  getStructuredEvents,
  getStructuredEventSummaries,
  getStructuredRecordLabel,
  stringifyJson,
} from "@/lib/studio";

import { EmptyState } from "./empty-state";
import { MetaList } from "./meta-list";
import { PanelHeader } from "./panel-header";
import { DetailPanelSkeleton } from "./studio-skeletons";
import { TruncatedPath } from "./truncated-path";

interface GroupDetailPanelProps {
  group: StudioGroupDetail | null | undefined;
  loading?: boolean;
  onDescribeWithAi?(): void;
  onSelectRecord(recordId: string): void;
}

export function GroupDetailPanel({
  group,
  loading = false,
  onDescribeWithAi,
  onSelectRecord,
}: GroupDetailPanelProps) {
  if (loading && !group) {
    return <DetailPanelSkeleton />;
  }

  if (!group) {
    return (
      <EmptyState
        title="Select a structured group"
        description="Choose a grouped structured log entry to inspect its members and context."
      />
    );
  }

  const structuredTimeline = group.records.flatMap((record) =>
    getStructuredEventSummaries(record).map((summary, index) => ({
      id: `${record.id}:event:${index}`,
      recordId: record.id,
      summary,
      timestamp: record.timestamp,
      level: record.level,
      caller: record.caller,
      raw: getStructuredEvents(record)[index] ?? summary,
    })),
  );

  return (
    <div className="min-w-0 space-y-4">
      <Card>
        <PanelHeader
          title={
            <div className="flex min-w-0 flex-col gap-2">
              <span className="break-words">{group.group.title}</span>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">
                  {group.group.recordCount} record{group.group.recordCount === 1 ? "" : "s"}
                </Badge>
                {group.group.nestedEventCount > 0 ? (
                  <Badge variant="outline">
                    {group.group.nestedEventCount} event{group.group.nestedEventCount === 1 ? "" : "s"}
                  </Badge>
                ) : null}
                {group.group.type ? <Badge variant="outline">{group.group.type}</Badge> : null}
                <Badge variant="muted">
                  {getGroupingReasonLabel(group.group.groupingReason)}
                </Badge>
              </div>
            </div>
          }
          description={`${formatCompactDateTime(group.group.timestampStart)} to ${formatCompactDateTime(group.group.timestampEnd)}`}
          action={
            onDescribeWithAi ? (
              <Button variant="secondary" size="xs" onClick={onDescribeWithAi}>
                Describe with AI
              </Button>
            ) : null
          }
        />
        <CardContent className="space-y-4">
          <MetaList
            items={[
              { label: "Group key", value: group.group.groupKey },
              { label: "Sources", value: group.group.fileNames.join(", ") },
              { label: "Matched", value: `${group.group.matchedRecordCount} visible` },
            ]}
          />
          <div className="space-y-2">
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Preview
            </div>
            <div className="space-y-1 text-sm text-muted-foreground">
              {group.group.previewMessages.map((message) => (
                <div key={`${group.group.id}:${message}`} className="break-words">
                  {message}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
      {structuredTimeline.length > 0 ? (
        <Card size="sm">
          <PanelHeader
            title="Trace timeline"
            description="Bundled event summaries extracted from the grouped trace."
          />
          <CardContent className="space-y-2">
            {structuredTimeline.map((event, index) => (
              <Collapsible
                key={event.id}
                className="border-border/60 bg-background/30 border"
                defaultOpen={index === 0}
              >
                <CollapsibleTrigger className="hover:bg-muted/40 flex w-full min-w-0 items-start justify-between gap-3 p-3 text-left">
                  <div className="min-w-0 space-y-2">
                    <div className="min-w-0 break-words text-sm font-medium">
                      {event.summary}
                    </div>
                    <div className="flex min-w-0 flex-wrap gap-2 text-[11px] text-muted-foreground">
                      <span>{formatCompactDateTime(event.timestamp)}</span>
                      {event.caller ? <span>{event.caller}</span> : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={getLevelClasses(event.level)}>{event.level}</Badge>
                    <ChevronDown className="text-muted-foreground size-4" />
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent className="border-t border-border/60 px-3 py-3">
                  <div className="space-y-3">
                    <div className="flex justify-end">
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => onSelectRecord(event.recordId)}
                      >
                        Inspect record
                      </Button>
                    </div>
                    <TraceJsonSection label="Event payload" value={event.raw} />
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ))}
          </CardContent>
        </Card>
      ) : null}
      <Card size="sm">
        <PanelHeader
          title="Trace logs"
          description="Select a grouped log to inspect its raw payload."
        />
        <CardContent className="space-y-2">
          {group.records.map((record) => (
            <Collapsible
              key={record.id}
              className="border-border/60 bg-background/30 border"
            >
              <CollapsibleTrigger className="hover:bg-muted/40 flex w-full min-w-0 items-start justify-between gap-3 p-3 text-left">
                <div className="min-w-0 space-y-2">
                  <div
                    className="min-w-0 truncate text-sm font-medium"
                    title={getStructuredRecordLabel(record)}
                  >
                    {getStructuredRecordLabel(record)}
                  </div>
                  <div className="flex min-w-0 flex-wrap gap-2 text-[11px] text-muted-foreground">
                    <span>{formatCompactDateTime(record.timestamp)}</span>
                    {record.type ? <span>{record.type}</span> : null}
                    {record.caller ? <span>{record.caller}</span> : null}
                  </div>
                  <TruncatedPath value={record.filePath} />
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={getLevelClasses(record.level)}>{record.level}</Badge>
                  <ChevronDown className="text-muted-foreground size-4" />
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent className="border-t border-border/60 px-3 py-3">
                <div className="space-y-3">
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => onSelectRecord(record.id)}
                    >
                      Inspect record
                    </Button>
                  </div>
                  {record.bindings ? (
                    <TraceJsonSection label="Bindings" value={record.bindings} />
                  ) : null}
                  {record.data !== undefined ? (
                    <TraceJsonSection label="Data" value={record.data} />
                  ) : null}
                  {record.error ? (
                    <TraceJsonSection label="Error" value={record.error} />
                  ) : null}
                  <TraceJsonSection label="Raw record" value={record.raw} />
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function TraceJsonSection({
  label,
  value,
}: {
  label: string;
  value: unknown;
}) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <pre className="bg-muted/20 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded border border-border/60 p-3 font-mono text-[11px] leading-5 text-foreground">
        {stringifyJson(value)}
      </pre>
    </div>
  );
}
