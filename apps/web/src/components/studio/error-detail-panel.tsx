import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type {
  StudioErrorGroupDetail,
  StudioErrorOccurrence,
  StudioRecord,
  StudioRecordSourceContext,
} from "@/lib/studio";
import {
  formatDateTime,
  getErrorGroupStatusLabel,
  getLevelClasses,
} from "@/lib/studio";

import { EmptyState } from "./empty-state";
import { JsonDetailBlock } from "./json-detail-block";
import { LogDetailPanel } from "./log-detail-panel";
import { MetaList } from "./meta-list";
import { PanelHeader } from "./panel-header";
import { DetailPanelSkeleton } from "./studio-skeletons";

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
        title="Select an error group"
        description="Choose a grouped error to inspect stack traces, recurrence, and fields."
      />
    );
  }

  const representative = group.occurrences.find(
    (item) => item.id === group.group.representativeOccurrenceId,
  ) ?? group.occurrences[0];
  const status = getErrorGroupStatusLabel(group.group, { resolvedAt, ignored });

  return (
    <div className="space-y-4">
      <Card>
        <PanelHeader
          title={
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="break-words">{group.group.errorType}</span>
                <Badge variant="secondary">
                  {group.group.occurrenceCount} time{group.group.occurrenceCount === 1 ? "" : "s"}
                </Badge>
                <Badge variant={status === "Recurring" ? "destructive" : "outline"}>
                  {status}
                </Badge>
              </div>
              <div className="break-words text-sm text-muted-foreground">
                {group.group.messageFirstLine}
              </div>
            </div>
          }
          description={
            <>
              First seen {formatDateTime(group.group.firstSeenAt)}
              <br />
              Last seen {formatDateTime(group.group.lastSeenAt)}
            </>
          }
          action={
            <div className="flex flex-wrap gap-2">
              {onViewTrace && group.group.relatedTraceGroupId ? (
                <Button variant="outline" size="xs" onClick={onViewTrace}>
                  View full trace
                </Button>
              ) : null}
              {onAskAi ? (
                <Button variant="secondary" size="xs" onClick={onAskAi}>
                  Recommend fixes
                </Button>
              ) : null}
            </div>
          }
        />
        <CardContent className="space-y-4">
          <MetaList
            items={[
              { label: "Fingerprint", value: group.group.fingerprint },
              {
                label: "Source",
                value:
                  group.group.fingerprintSource.relativePath
                    ? `${group.group.fingerprintSource.relativePath}${group.group.fingerprintSource.line ? `:${group.group.fingerprintSource.line}` : ""}`
                    : "Unknown source",
              },
              {
                label: "HTTP",
                value: group.group.http
                  ? [
                      group.group.http.method,
                      group.group.http.path ?? group.group.http.url,
                      group.group.http.statusCode,
                    ]
                      .filter(Boolean)
                      .join(" ")
                  : "n/a",
              },
              {
                label: "Tags",
                value: group.group.sectionTags.length > 0 ? group.group.sectionTags.join(", ") : "n/a",
              },
            ]}
          />
          <div className="flex flex-wrap gap-2">
            {onMarkResolved ? (
              <Button variant="outline" size="sm" onClick={onMarkResolved}>
                Mark resolved
              </Button>
            ) : null}
            {onIgnore ? (
              <Button variant="outline" size="sm" onClick={onIgnore}>
                Ignore for this session
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
      {representative?.stack ? (
        <JsonDetailBlock title="Stack Trace" value={representative.stack} />
      ) : null}
      {representative ? (
        <JsonDetailBlock
          title="Structured Fields"
          value={representative.structuredFields}
        />
      ) : null}
      <Card size="sm">
        <PanelHeader
          title="Occurrences"
          description="Chronological error occurrences in this session."
        />
        <CardContent className="space-y-3">
          {group.occurrences.map((item) => (
            <div
              key={item.id}
              className="space-y-2 rounded border border-border/60 bg-background/50 p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={getLevelClasses(item.level)}>{item.level}</Badge>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(item.timestamp)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {item.fingerprintSource.relativePath ?? item.fileName}
                  {item.fingerprintSource.line ? `:${item.fingerprintSource.line}` : ""}
                </span>
              </div>
              <div className="break-words text-sm">{item.messageFirstLine}</div>
              {item.http ? (
                <div className="text-xs text-muted-foreground">
                  {[item.http.method, item.http.path ?? item.http.url, item.http.statusCode]
                    .filter(Boolean)
                    .join(" ")}
                </div>
              ) : null}
              <JsonDetailBlock title="Fields" value={item.structuredFields} />
              <JsonDetailBlock title="Raw Payload" value={item.raw} />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
