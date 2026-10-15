import type { ReactNode } from "react";

import { ChevronRight, Layers, Sparkles } from "lucide-react";

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
  formatDateTime,
  formatDurationMs,
  getGroupingReasonLabel,
  getLevelDotClass,
  getStructuredEvents,
  getStructuredEventSummaries,
  getStructuredRecordLabel,
  stringifyJson,
} from "@/lib/studio";
import { cn } from "@/lib/utils";

import { EmptyState } from "./empty-state";
import { highlightJson } from "./json-detail-block";
import { formatLogTime, LevelPill } from "./log-row";
import { MetaList } from "./meta-list";
import { PanelHeader } from "./panel-header";
import { MeterBar, MonoChip, type StudioTone } from "./studio-primitives";
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
        icon={<Layers />}
        title="Select a structured group"
        description="Choose a grouped structured log entry to inspect its members and context."
      />
    );
  }

  const summary = group.group;
  const startMs = getEarliestMs(group.records.map((record) => record.timestamp));
  const spanMs = getSpanMs(summary.timestampStart, summary.timestampEnd);

  const structuredTimeline = group.records.flatMap((record) =>
    getStructuredEventSummaries(record).map((eventSummary, index) => ({
      id: `${record.id}:event:${index}`,
      recordId: record.id,
      summary: eventSummary,
      timestamp: record.timestamp,
      level: record.level,
      caller: record.caller,
      raw: getStructuredEvents(record)[index] ?? eventSummary,
    })),
  );

  const levelCounts = countLevels(group.records.map((record) => record.level));

  return (
    <div className="min-w-0 space-y-4">
      <Card className="min-w-0 gap-0 py-0">
        <div className="flex min-w-0 flex-col gap-3 px-4 pt-4 pb-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="blyp-eyebrow shrink-0">Trace</span>
            <span
              className="min-w-0 flex-1 truncate font-mono text-[0.7rem] tabular-nums text-muted-foreground/80"
              title={`${formatDateTime(summary.timestampStart)} – ${formatDateTime(summary.timestampEnd)}`}
            >
              {formatLogTime(summary.timestampStart)}
              <span className="text-muted-foreground/50"> → </span>
              {formatLogTime(summary.timestampEnd)}
            </span>
            {onDescribeWithAi ? (
              <Button variant="outline" size="xs" onClick={onDescribeWithAi}>
                <Sparkles className="text-primary" />
                Describe with AI
              </Button>
            ) : null}
          </div>
          <h2 className="font-heading text-[0.95rem] font-semibold leading-snug tracking-[-0.02em] text-pretty break-words text-foreground">
            {summary.title}
          </h2>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">
              {summary.recordCount} record{summary.recordCount === 1 ? "" : "s"}
            </Badge>
            {summary.nestedEventCount > 0 ? (
              <Badge variant="muted">
                {summary.nestedEventCount} event{summary.nestedEventCount === 1 ? "" : "s"}
              </Badge>
            ) : null}
            {spanMs !== null ? <Badge variant="muted">{formatDurationMs(spanMs)}</Badge> : null}
            {summary.type ? <MonoChip>{summary.type}</MonoChip> : null}
            <MonoChip title="Grouping reason">{getGroupingReasonLabel(summary.groupingReason)}</MonoChip>
          </div>
          {levelCounts.length > 0 ? (
            <div className="space-y-1.5">
              <MeterBar
                segments={levelCounts.map((entry) => ({
                  value: entry.count,
                  tone: getLevelTone(entry.level),
                  label: `${entry.level}: ${entry.count}`,
                }))}
              />
              <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[0.68rem] tabular-nums text-muted-foreground">
                {levelCounts.map((entry) => (
                  <span key={entry.level} className="inline-flex items-center gap-1.5">
                    <span className={cn("size-1.5 rounded-full", getLevelDotClass(entry.level))} />
                    {entry.level}
                    <span className="text-foreground/80">{entry.count}</span>
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <CardContent className="min-w-0 space-y-3 border-t border-border py-3">
          <MetaList
            items={[
              {
                label: "Group key",
                value: (
                  <span className="font-mono text-[0.72rem] break-all">{summary.groupKey}</span>
                ),
              },
              {
                label: "Sources",
                value: (
                  <div className="min-w-0 space-y-0.5">
                    {summary.fileNames.map((fileName) => (
                      <TruncatedPath key={fileName} value={fileName} />
                    ))}
                  </div>
                ),
              },
              {
                label: "Matched",
                value: (
                  <span className="font-mono text-[0.72rem] tabular-nums">
                    {summary.matchedRecordCount} visible
                  </span>
                ),
              },
              ...(summary.previewMessages.length > 0
                ? [
                    {
                      label: "Preview",
                      value: (
                        <ul className="min-w-0 space-y-0.5 text-[0.78rem] text-muted-foreground">
                          {summary.previewMessages.map((message) => (
                            <li key={`${summary.id}:${message}`} className="break-words">
                              {message}
                            </li>
                          ))}
                        </ul>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        </CardContent>
      </Card>
      {structuredTimeline.length > 0 ? (
        <Card size="sm" className="min-w-0 gap-0 py-0">
          <PanelHeader
            className="py-3"
            title="Trace timeline"
            description="Bundled event summaries extracted from the grouped trace."
          />
          <CardContent className="min-w-0 py-2 group-data-[size=sm]/card:px-2">
            <ol className="min-w-0">
              {structuredTimeline.map((event, index) => (
                <TimelineItem
                  key={event.id}
                  defaultOpen={index === 0}
                  isLast={index === structuredTimeline.length - 1}
                  level={event.level}
                  offset={getOffsetLabel(event.timestamp, startMs)}
                  title={event.summary}
                  meta={
                    <>
                      <span>{formatLogTime(event.timestamp)}</span>
                      {event.caller ? <span className="truncate">{event.caller}</span> : null}
                    </>
                  }
                >
                  <InspectRecordButton onClick={() => onSelectRecord(event.recordId)} />
                  <TraceJsonSection label="Event payload" value={event.raw} />
                </TimelineItem>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}
      <Card size="sm" className="min-w-0 gap-0 py-0">
        <PanelHeader
          className="py-3"
          title="Trace logs"
          description="Select a grouped log to inspect its raw payload."
        />
        <CardContent className="min-w-0 py-2 group-data-[size=sm]/card:px-2">
          <ol className="min-w-0">
            {group.records.map((record, index) => {
              const label = getStructuredRecordLabel(record);

              return (
                <TimelineItem
                  key={record.id}
                  isLast={index === group.records.length - 1}
                  level={record.level}
                  offset={getOffsetLabel(record.timestamp, startMs)}
                  title={label}
                  meta={
                    <>
                      <span>{formatLogTime(record.timestamp)}</span>
                      {record.type ? <span>{record.type}</span> : null}
                      {record.caller ? <span className="truncate">{record.caller}</span> : null}
                    </>
                  }
                >
                  <TruncatedPath value={record.filePath} />
                  <InspectRecordButton onClick={() => onSelectRecord(record.id)} />
                  {record.bindings ? (
                    <TraceJsonSection label="Bindings" value={record.bindings} />
                  ) : null}
                  {record.data !== undefined ? (
                    <TraceJsonSection label="Data" value={record.data} />
                  ) : null}
                  {record.error ? <TraceJsonSection label="Error" value={record.error} /> : null}
                  <TraceJsonSection label="Raw record" value={record.raw} />
                </TimelineItem>
              );
            })}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

function TimelineItem({
  level,
  offset,
  title,
  meta,
  isLast,
  defaultOpen,
  children,
}: {
  level: string;
  offset: string;
  title: string;
  meta: ReactNode;
  isLast: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <li className="relative min-w-0 pl-6">
      <span
        aria-hidden
        className={cn(
          "absolute left-[0.6875rem] w-px bg-border",
          isLast ? "top-0 h-4" : "top-0 bottom-0",
        )}
      />
      <span
        aria-hidden
        className={cn(
          "absolute top-[0.8rem] left-2 size-[0.4375rem] rounded-full ring-[3px] ring-card",
          getLevelDotClass(level),
        )}
      />
      <Collapsible defaultOpen={defaultOpen} className="min-w-0">
        <CollapsibleTrigger className="group/trigger flex w-full min-w-0 items-start gap-2.5 rounded-md px-2 py-1.5 text-left outline-none transition-colors duration-150 hover:bg-muted focus-visible:bg-muted data-[panel-open]:bg-muted/50">
          <span className="w-12 shrink-0 pt-px font-mono text-[0.68rem] tabular-nums text-muted-foreground">
            {offset}
          </span>
          <span className="min-w-0 flex-1 space-y-0.5">
            <span className="block truncate text-[0.8rem] font-medium text-foreground" title={title}>
              {title}
            </span>
            <span className="flex min-w-0 flex-wrap gap-x-2 font-mono text-[0.68rem] tabular-nums text-muted-foreground/80">
              {meta}
            </span>
          </span>
          <span className="w-14 shrink-0">
            <LevelPill level={level} />
          </span>
          <ChevronRight
            aria-hidden
            className="mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 ease-out-expo group-data-[panel-open]/trigger:rotate-90"
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="min-w-0">
          <div className="min-w-0 space-y-3 px-2 pt-1.5 pb-3">{children}</div>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

function InspectRecordButton({ onClick }: { onClick(): void }) {
  return (
    <div className="flex justify-end">
      <Button variant="outline" size="xs" onClick={onClick}>
        Inspect record
      </Button>
    </div>
  );
}

function TraceJsonSection({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <div className="text-[0.72rem] text-muted-foreground">{label}</div>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/50 px-3 py-2.5 font-mono text-[0.7rem] leading-5 text-foreground">
        {highlightJson(stringifyJson(value))}
      </pre>
    </div>
  );
}

function getLevelTone(level: string): StudioTone {
  switch (level.toLowerCase()) {
    case "critical":
    case "fatal":
    case "error":
      return "error";
    case "warn":
    case "warning":
      return "warn";
    case "info":
      return "info";
    case "success":
      return "ok";
    default:
      return "neutral";
  }
}

function countLevels(levels: string[]): Array<{ level: string; count: number }> {
  const counts = new Map<string, number>();

  for (const level of levels) {
    const key = level.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from(counts, ([level, count]) => ({ level, count }));
}

function toMs(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function getEarliestMs(values: Array<string | null | undefined>): number | null {
  let earliest: number | null = null;

  for (const value of values) {
    const ms = toMs(value);
    if (ms !== null && (earliest === null || ms < earliest)) {
      earliest = ms;
    }
  }

  return earliest;
}

function getSpanMs(start: string | null, end: string | null): number | null {
  const startMs = toMs(start);
  const endMs = toMs(end);

  if (startMs === null || endMs === null || endMs < startMs) {
    return null;
  }

  return endMs - startMs;
}

function getOffsetLabel(timestamp: string | null, startMs: number | null): string {
  const ms = toMs(timestamp);

  if (ms === null || startMs === null) {
    return "—";
  }

  return `+${formatDurationMs(ms - startMs)}`;
}
