import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { StudioErrorGroupDetail } from "@/lib/studio";
import { formatCompactDateTime, stringifyJson } from "@/lib/studio";

import { EmptyState } from "./empty-state";
import { JsonDetailBlock } from "./json-detail-block";
import { MetaList } from "./meta-list";
import { PanelHeader } from "./panel-header";

interface ErrorDetailPanelProps {
  detail: StudioErrorGroupDetail | null | undefined;
  loading?: boolean;
  onAskAi(): void;
  onViewTrace?(): void;
  statusLabel?: "New" | "Recurring" | "Resolved";
}

export function ErrorDetailPanel({
  detail,
  loading = false,
  onAskAi,
  onViewTrace,
  statusLabel,
}: ErrorDetailPanelProps) {
  if (loading && !detail) {
    return (
      <EmptyState
        title="Loading error"
        description="Resolving the selected error group."
      />
    );
  }

  if (!detail) {
    return (
      <EmptyState
        title="Select an error group"
        description="Choose an error card to inspect stack traces, occurrences, and fields."
      />
    );
  }

  const representative = detail.occurrences.at(-1) ?? detail.occurrences[0] ?? null;
  const stack =
    representative?.record.stack ??
    (typeof representative?.record.error === "object" &&
    representative?.record.error &&
    "stack" in representative.record.error
      ? String((representative.record.error as { stack?: unknown }).stack ?? "")
      : "");

  return (
    <div className="min-w-0 space-y-4">
      <Card>
        <PanelHeader
          title={
            <div className="min-w-0 space-y-2">
              <div className="break-words text-balance">
                {detail.group.errorType ?? "Error"}: {detail.group.message}
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">
                  {detail.group.occurrenceCount} occurrence{detail.group.occurrenceCount === 1 ? "" : "s"}
                </Badge>
                <Badge variant={statusLabel === "Resolved" ? "outline" : "default"}>
                  {statusLabel ?? (detail.group.statusHint === "new" ? "New" : "Recurring")}
                </Badge>
                {detail.group.tags.map((tag) => (
                  <Badge key={`${detail.group.id}:${tag.id}`} variant="outline">
                    {tag.label}
                  </Badge>
                ))}
              </div>
            </div>
          }
          description={`First ${formatCompactDateTime(detail.group.firstSeen)} • Last ${formatCompactDateTime(detail.group.lastSeen)}`}
          action={
            <div className="flex flex-wrap gap-2">
              {detail.traceReference && onViewTrace ? (
                <Button variant="outline" size="xs" onClick={onViewTrace}>
                  View full trace
                </Button>
              ) : null}
              <Button variant="secondary" size="xs" onClick={onAskAi}>
                Ask AI to fix this
              </Button>
            </div>
          }
        />
        <CardContent className="space-y-4">
          <MetaList
            items={[
              {
                label: "Source",
                value: detail.group.sourceFile
                  ? `${detail.group.sourceFile}:${detail.group.sourceLine ?? "?"}`
                  : "Unknown",
              },
              {
                label: "HTTP",
                value:
                  detail.group.http?.method && detail.group.http.route
                    ? `${detail.group.http.method} ${detail.group.http.route} ${detail.group.http.statusCode ?? ""}`.trim()
                    : "n/a",
              },
              {
                label: "Fingerprint",
                value: detail.group.fingerprint,
              },
            ]}
          />
        </CardContent>
      </Card>
      {stack ? (
        <Card size="sm">
          <PanelHeader title="Stack trace" />
          <CardContent>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded border border-border/60 bg-muted/20 p-3 font-mono text-[11px] leading-5">
              {stack}
            </pre>
          </CardContent>
        </Card>
      ) : null}
      <Card size="sm">
        <PanelHeader
          title="Occurrences"
          description="Chronological list of each occurrence in this session."
        />
        <CardContent className="space-y-3">
          {detail.occurrences.map((occurrence) => (
            <div key={occurrence.record.id} className="border border-border/60 bg-background/40 p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                <span>{occurrence.message}</span>
                <span className="text-xs text-muted-foreground">
                  {formatCompactDateTime(occurrence.record.timestamp)}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                {occurrence.sourceFile ? (
                  <span>
                    {occurrence.sourceFile}:{occurrence.sourceLine ?? "?"}
                  </span>
                ) : null}
                {occurrence.http?.method && occurrence.http.route ? (
                  <span>
                    {occurrence.http.method} {occurrence.http.route} {occurrence.http.statusCode ?? ""}
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card size="sm">
        <PanelHeader title="Structured fields" />
        <CardContent className="space-y-2">
          {detail.structuredFields.length === 0 ? (
            <div className="text-sm text-muted-foreground">No structured fields captured.</div>
          ) : (
            detail.structuredFields.map((field) => (
              <div
                key={field.key}
                className="grid gap-1 border-b border-border/40 py-2 md:grid-cols-[12rem_minmax(0,1fr)]"
              >
                <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  {field.key}
                </div>
                <div className="break-words font-mono text-xs">{field.value}</div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
      {representative ? (
        <JsonDetailBlock
          title="Representative raw record"
          value={representative.record.raw}
          description={stringifyJson(representative.record.error ?? representative.record.data ?? null).length > 0 ? "Raw payload for the representative occurrence." : undefined}
        />
      ) : null}
    </div>
  );
}
