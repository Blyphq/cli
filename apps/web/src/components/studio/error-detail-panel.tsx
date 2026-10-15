import { useMemo, useState } from "react";

import {
  Bug,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  EyeOff,
  FileCode2,
  Sparkles,
  Waypoints,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type {
  StudioErrorGroupDetail,
  StudioErrorOccurrence,
  StudioHttpStatusGroup,
  StudioRecord,
  StudioRecordSourceContext,
} from "@/lib/studio";
import {
  formatDateTime,
  getErrorGroupStatusLabel,
  getHttpStatusClasses,
  getLevelClasses,
} from "@/lib/studio";
import { cn } from "@/lib/utils";

import { EmptyState } from "./empty-state";
import {
  formatErrorHttpSummary,
  getErrorSourceLabel,
  getErrorStatusBadgeVariant,
} from "./error-group-row";
import { formatClockTime } from "./error-raw-row";
import { ErrorSparkline } from "./error-sparkline";
import { JsonDetailBlock } from "./json-detail-block";
import { LogDetailPanel } from "./log-detail-panel";
import { MetaList } from "./meta-list";
import { PanelHeader } from "./panel-header";
import { DetailPanelSkeleton } from "./studio-skeletons";
import { MonoChip } from "./studio-primitives";

interface ErrorDetailPanelProps {
  group: StudioErrorGroupDetail | null | undefined;
  occurrence: StudioErrorOccurrence | null;
  record: StudioRecord | null;
  recordSource?: StudioRecordSourceContext | null;
  recordSourceLoading?: boolean;
  loading?: boolean;
  resolvedAt?: string | null;
  ignored?: boolean;
  onAskAi?(): void;
  onMarkResolved?(): void;
  onIgnore?(): void;
  onViewTrace?(): void;
}

export function ErrorDetailPanel({
  group,
  occurrence,
  record,
  recordSource,
  recordSourceLoading = false,
  loading = false,
  resolvedAt,
  ignored,
  onAskAi,
  onMarkResolved,
  onIgnore,
  onViewTrace,
}: ErrorDetailPanelProps) {
  if (occurrence) {
    if (!record) {
      return <DetailPanelSkeleton />;
    }

    return (
      <LogDetailPanel
        record={record}
        source={recordSource}
        sourceLoading={recordSourceLoading}
      />
    );
  }

  if (loading && !group) {
    return <DetailPanelSkeleton />;
  }

  if (!group) {
    return (
      <EmptyState
        icon={<Bug />}
        title="Select an error group"
        description="Choose a grouped error to inspect stack traces, recurrence, and fields."
      />
    );
  }

  const summary = group.group;
  const representative =
    group.occurrences.find((item) => item.id === summary.representativeOccurrenceId) ??
    group.occurrences[0];
  const status = getErrorGroupStatusLabel(summary, { resolvedAt, ignored });
  const source = getErrorSourceLabel(summary);
  const http = formatErrorHttpSummary(summary.http);
  const statusCode = summary.http?.statusCode;
  const statusGroup = getStatusGroup(statusCode);
  const canViewTrace = Boolean(onViewTrace && summary.relatedTraceGroupId);
  const hasActions = Boolean(onAskAi || onMarkResolved || onIgnore || canViewTrace);

  return (
    <div className="space-y-4">
      <Card className="gap-0 py-0">
        <div className="space-y-2 px-4 pt-4 pb-3.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={getErrorStatusBadgeVariant(status)}>{status}</Badge>
            <MonoChip>
              {summary.occurrenceCount.toLocaleString()} event{summary.occurrenceCount === 1 ? "" : "s"}
            </MonoChip>
            {typeof statusCode === "number" && statusGroup ? (
              <Badge className={getHttpStatusClasses(statusGroup)}>{statusCode}</Badge>
            ) : null}
          </div>
          <h2 className="font-heading text-[1.05rem] font-semibold leading-snug tracking-[-0.025em] break-words text-foreground">
            {summary.errorType}
          </h2>
          <p className="line-clamp-4 text-[0.8rem] leading-relaxed break-words text-muted-foreground">
            {summary.messageFirstLine}
          </p>
          {source ? (
            <div
              className="flex min-w-0 items-center gap-1.5 font-mono text-[0.7rem] text-muted-foreground"
              title={source}
            >
              <FileCode2 aria-hidden className="size-3.5 shrink-0 text-muted-foreground/70" />
              <span className="truncate">{source}</span>
            </div>
          ) : null}
        </div>

        {hasActions ? (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-border bg-muted/30 px-4 py-2.5">
            {onAskAi ? (
              <Button size="sm" onClick={onAskAi}>
                <Sparkles />
                Ask AI to fix
              </Button>
            ) : null}
            {onMarkResolved ? (
              <Button
                variant="outline"
                size="sm"
                onClick={onMarkResolved}
                aria-pressed={status === "Resolved"}
              >
                <CheckCircle2 className={status === "Resolved" ? "text-level-ok" : undefined} />
                {status === "Resolved" ? "Resolved" : "Mark resolved"}
              </Button>
            ) : null}
            {onIgnore ? (
              <Button variant="outline" size="sm" onClick={onIgnore} title="Ignore for this session">
                <EyeOff />
                Ignore
              </Button>
            ) : null}
            {canViewTrace ? (
              <Button variant="ghost" size="sm" className="ml-auto" onClick={onViewTrace}>
                <Waypoints />
                View trace
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="grid grid-cols-2 divide-x divide-border border-t border-border">
          <MiniStat
            label="First seen"
            value={formatClockTime(summary.firstSeenAt)}
            title={formatDateTime(summary.firstSeenAt)}
          />
          <MiniStat
            label="Last seen"
            value={formatClockTime(summary.lastSeenAt)}
            title={formatDateTime(summary.lastSeenAt)}
          />
        </div>
        {summary.sparklineBuckets.length > 0 ? (
          <div className="border-t border-border px-4 py-3">
            <div className="mb-2 flex items-center justify-between text-[0.72rem] text-muted-foreground">
              <span>Frequency</span>
              <span className="font-mono text-[0.66rem] tabular-nums">
                peak {Math.max(0, ...summary.sparklineBuckets)}
              </span>
            </div>
            <ErrorSparkline
              buckets={summary.sparklineBuckets}
              className="h-10 w-full"
              label={`Occurrences over time, peak ${Math.max(0, ...summary.sparklineBuckets)} per bucket`}
            />
          </div>
        ) : null}
      </Card>

      {representative?.stack || (representative?.stackFrames.length ?? 0) > 0 ? (
        <StackTraceBlock
          stack={representative?.stack ?? null}
          frames={representative?.stackFrames ?? []}
        />
      ) : null}

      <Card size="sm" className="gap-0 py-0">
        <PanelHeader className="py-2.5 [.border-b]:pb-2.5" title="Details" />
        <CardContent className="px-4 py-3 group-data-[size=sm]/card:px-4">
          <MetaList
            items={[
              {
                label: "Fingerprint",
                value: <span className="font-mono text-[0.72rem] break-all">{summary.fingerprint}</span>,
              },
              {
                label: "Source",
                value: (
                  <span className="font-mono text-[0.72rem] break-all">
                    {source ?? <span className="text-muted-foreground">Unknown source</span>}
                  </span>
                ),
              },
              {
                label: "HTTP",
                value: http ? (
                  <span className="font-mono text-[0.72rem] break-all">{http}</span>
                ) : (
                  <span className="text-muted-foreground">n/a</span>
                ),
              },
              {
                label: "Tags",
                value:
                  summary.sectionTags.length > 0 ? (
                    <span className="flex flex-wrap gap-1">
                      {summary.sectionTags.map((tag) => (
                        <MonoChip key={tag}>{tag}</MonoChip>
                      ))}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">n/a</span>
                  ),
              },
              {
                label: "Trace",
                value: summary.relatedTraceGroupId ? (
                  <span className="font-mono text-[0.72rem] break-all">{summary.relatedTraceGroupId}</span>
                ) : (
                  <span className="text-muted-foreground">n/a</span>
                ),
              },
            ]}
          />
        </CardContent>
      </Card>

      {representative ? (
        <JsonDetailBlock title="Structured fields" value={representative.structuredFields} />
      ) : null}

      <OccurrencesCard occurrences={group.occurrences} />
    </div>
  );
}

function MiniStat({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="min-w-0 px-4 py-2.5" title={title}>
      <div className="text-[0.72rem] text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate font-mono text-[0.78rem] tabular-nums text-foreground">{value}</div>
    </div>
  );
}

type FrameLine = { key: string; text: string; inApp: boolean; header?: boolean };

const LIBRARY_FRAME = /node_modules|\bnode:|\(internal\/|^\s*at\s+(?:async\s+)?(?:new\s+)?\S*\s*\(?native\)?/;

function buildFrameLines(stack: string | null, frames: StudioErrorOccurrence["stackFrames"]): FrameLine[] {
  const stackLines = (stack ?? "").split("\n").filter((line) => line.trim().length > 0);

  if (frames.length > 0) {
    const header = stackLines[0] && !/^\s*at\s/.test(stackLines[0]) ? stackLines[0] : null;
    return [
      ...(header ? [{ key: "header", text: header, inApp: true, header: true }] : []),
      ...frames.map((frame, index) => ({
        key: `${index}:${frame.raw}`,
        text: frame.raw.trim(),
        inApp: frame.inProject,
      })),
    ];
  }

  return stackLines.map((line, index) => {
    const isFrame = /^\s*at\s/.test(line);
    return {
      key: `${index}:${line}`,
      text: line.trim(),
      inApp: !isFrame || !LIBRARY_FRAME.test(line),
      header: !isFrame && index === 0,
    };
  });
}

function StackTraceBlock({
  stack,
  frames,
}: {
  stack: string | null;
  frames: StudioErrorOccurrence["stackFrames"];
}) {
  const [hideLibrary, setHideLibrary] = useState(false);
  const [copied, setCopied] = useState(false);
  const lines = useMemo(() => buildFrameLines(stack, frames), [stack, frames]);
  const frameLines = lines.filter((line) => !line.header);
  const inAppCount = frameLines.filter((line) => line.inApp).length;
  const libraryCount = frameLines.length - inAppCount;
  const visible = hideLibrary ? lines.filter((line) => line.header || line.inApp) : lines;
  const copyText = stack ?? lines.map((line) => line.text).join("\n");

  return (
    <Card size="sm" className="min-w-0 gap-0 py-0">
      <PanelHeader
        className="py-2.5 [.border-b]:pb-2.5"
        title="Stack trace"
        action={
          <>
            {frameLines.length > 0 ? (
              <span className="hidden font-mono text-[0.66rem] tabular-nums text-muted-foreground sm:inline">
                {inAppCount} app · {libraryCount} lib
              </span>
            ) : null}
            {libraryCount > 0 && inAppCount > 0 ? (
              <Button
                variant="ghost"
                size="xs"
                aria-pressed={hideLibrary}
                onClick={() => setHideLibrary((value) => !value)}
              >
                {hideLibrary ? "Show library" : "App only"}
              </Button>
            ) : null}
            <button
              type="button"
              aria-label={copied ? "Copied" : "Copy stack trace"}
              onClick={() => {
                void navigator.clipboard?.writeText(copyText).then(() => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1400);
                });
              }}
              className="grid size-6 place-items-center rounded-[5px] text-muted-foreground transition-colors hover:bg-primary-soft hover:text-primary-soft-foreground"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            </button>
          </>
        }
      />
      <CardContent className="min-w-0 bg-muted/50 px-0 group-data-[size=sm]/card:px-0">
        <ol className="max-h-96 overflow-auto py-2 font-mono text-[0.7rem] leading-5">
          {visible.map((line) => (
            <li
              key={line.key}
              className={cn(
                "grid grid-cols-[0.875rem_minmax(0,1fr)] items-start px-3 break-words whitespace-pre-wrap",
                line.header
                  ? "pb-1 font-medium text-level-error"
                  : line.inApp
                    ? "bg-level-error/[0.04] text-foreground"
                    : "text-muted-foreground/60",
              )}
            >
              <span aria-hidden className="flex h-5 items-center">
                {!line.header && line.inApp ? <span className="size-1.5 rounded-full bg-level-error" /> : null}
              </span>
              <span className={cn(!line.header && "pl-2")}>{line.text}</span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function OccurrencesCard({ occurrences }: { occurrences: StudioErrorOccurrence[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <Card size="sm" className="gap-0 py-0">
      <PanelHeader
        className="py-2.5 [.border-b]:pb-2.5"
        title="Occurrences"
        description="Chronological error occurrences in this session."
        action={<MonoChip>{occurrences.length}</MonoChip>}
      />
      {occurrences.length === 0 ? (
        <div className="p-3">
          <EmptyState size="compact" title="No occurrences" description="No events were captured for this group." />
        </div>
      ) : (
        <ul className="divide-y divide-border/70">
          {occurrences.map((item) => {
            const expanded = expandedId === item.id;
            const location = `${item.fingerprintSource.relativePath ?? item.fileName}${item.fingerprintSource.line ? `:${item.fingerprintSource.line}` : ""}`;
            const http = formatErrorHttpSummary(item.http);

            return (
              <li key={item.id}>
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setExpandedId(expanded ? null : item.id)}
                  className={cn(
                    "flex w-full min-w-0 items-center gap-2.5 px-3 py-2 text-left outline-none transition-colors duration-150 hover:bg-muted/60 focus-visible:bg-muted",
                    expanded && "bg-muted/40",
                  )}
                >
                  <ChevronRight
                    aria-hidden
                    className={cn(
                      "size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 ease-out-expo",
                      expanded && "rotate-90",
                    )}
                  />
                  <span
                    className="w-[5.75rem] shrink-0 font-mono text-[0.7rem] tabular-nums text-muted-foreground/80"
                    title={formatDateTime(item.timestamp)}
                  >
                    {formatClockTime(item.timestamp)}
                  </span>
                  <Badge className={cn("shrink-0", getLevelClasses(item.level))}>{item.level}</Badge>
                  <span className="min-w-0 flex-1 truncate font-mono text-[0.7rem] text-muted-foreground" title={location}>
                    {location}
                  </span>
                </button>
                {expanded ? (
                  <div className="space-y-2.5 border-t border-border/70 bg-muted/20 px-3 py-3">
                    <p className="text-[0.78rem] leading-relaxed break-words text-foreground">
                      {item.messageFirstLine}
                    </p>
                    {http ? (
                      <div className="font-mono text-[0.7rem] text-muted-foreground">{http}</div>
                    ) : null}
                    <JsonDetailBlock title="Fields" value={item.structuredFields} />
                    <JsonDetailBlock title="Raw payload" value={item.raw} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function getStatusGroup(statusCode: number | null | undefined): StudioHttpStatusGroup | null {
  if (typeof statusCode !== "number" || statusCode < 100) {
    return null;
  }
  if (statusCode >= 500) {
    return "5xx";
  }
  if (statusCode >= 400) {
    return "4xx";
  }
  if (statusCode >= 300) {
    return "3xx";
  }
  return "2xx";
}
