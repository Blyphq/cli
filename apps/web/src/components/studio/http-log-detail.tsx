import { startTransition, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { StudioHttpStatusGroup, StudioRecord } from "@/lib/studio";
import { buildHttpPreview, formatDurationMs, getDurationClasses, getHttpStatusBadgeVariant } from "@/lib/studio";
import { cn } from "@/lib/utils";

import { JsonDetailBlock } from "./json-detail-block";
import { PanelHeader } from "./panel-header";
import { TruncatedPath } from "./truncated-path";

interface HttpLogDetailProps {
  record: StudioRecord;
}

function getStatusGroup(statusCode: number | null | undefined): StudioHttpStatusGroup | null {
  if (typeof statusCode !== "number" || !Number.isFinite(statusCode)) {
    return null;
  }

  if (statusCode >= 500) return "5xx";
  if (statusCode >= 400) return "4xx";
  if (statusCode >= 300) return "3xx";
  return "2xx";
}

export function HttpLogDetail({ record }: HttpLogDetailProps) {
  const preview = useMemo(() => buildHttpPreview(record), [record]);
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    setHtml(null);

    void (async () => {
      try {
        const { codeToHtml } = await import("shiki");
        const rendered = await codeToHtml(preview, {
          lang: "http",
          themes: {
            light: "github-light",
            dark: "github-dark-dimmed",
          },
        });

        if (!active) {
          return;
        }

        startTransition(() => {
          setHtml(rendered);
        });
      } catch {
        if (!active) {
          return;
        }

        startTransition(() => {
          setHtml(null);
        });
      }
    })();

    return () => {
      active = false;
    };
  }, [preview]);

  const http = record.http;
  const statusGroup = getStatusGroup(http?.statusCode);

  return (
    <Card size="sm" className="min-w-0 gap-0 py-0">
      <PanelHeader
        className="py-3 [.border-b]:pb-3"
        title="HTTP View"
        action={
          statusGroup && typeof http?.statusCode === "number" ? (
            <Badge variant={getHttpStatusBadgeVariant(statusGroup)}>{http.statusCode}</Badge>
          ) : null
        }
        description={
          <div className="min-w-0">
            <TruncatedPath
              className="text-[0.72rem]"
              value={`${http?.method ?? "?"} ${http?.path ?? http?.url ?? "/"}`}
            />
          </div>
        }
      />
      <CardContent className="min-w-0 space-y-3 py-3">
        <dl className="grid overflow-hidden rounded-md border border-border bg-border gap-px grid-cols-2">
          <DetailStat label="Method" value={http?.method ?? "Unknown"} />
          <DetailStat label="Status" value={http?.statusCode?.toString() ?? "Unknown"} />
          <DetailStat
            label="Duration"
            value={typeof http?.durationMs === "number" ? formatDurationMs(http.durationMs) : "Unknown"}
            valueClassName={getDurationClasses(http?.durationMs)}
          />
          <DetailStat label="Kind" value={http?.kind ?? "Unknown"} />
          <DetailStat label="Route template" value={http?.routeTemplate ?? "Unknown"} />
          <DetailStat label="Request ID" value={http?.requestId ?? "Unknown"} />
          <DetailStat label="Trace ID" value={http?.traceId ?? "Unknown"} />
          <DetailStat label="Path" value={http?.path ?? http?.url ?? "Unknown"} />
        </dl>
        {html ? (
          <div
            className="overflow-x-auto rounded-md bg-muted/50 p-3 [&_.shiki]:min-w-max [&_.shiki]:!bg-transparent [&_.shiki]:p-0 [&_.shiki]:font-mono [&_.shiki]:text-[0.7rem] [&_.shiki]:leading-5 dark:[&_.shiki_span]:!text-[var(--shiki-dark)]"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <pre className="max-h-96 overflow-auto rounded-md bg-muted/50 p-3 font-mono text-[0.7rem] leading-5 whitespace-pre-wrap text-foreground">
            {preview}
          </pre>
        )}
        {http?.requestHeaders ? (
          <JsonDetailBlock title="Request Headers" value={http.requestHeaders} />
        ) : null}
        {http?.responseHeaders ? (
          <JsonDetailBlock title="Response Headers" value={http.responseHeaders} />
        ) : null}
        {http?.requestBody !== undefined && http.requestBody !== null ? (
          <JsonDetailBlock title="Request Body" value={http.requestBody} />
        ) : null}
        {http?.responseBody !== undefined && http.responseBody !== null ? (
          <JsonDetailBlock title="Response Body" value={http.responseBody} />
        ) : null}
      </CardContent>
    </Card>
  );
}

function DetailStat({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="min-w-0 space-y-1 bg-card px-3 py-2">
      <dt className="text-[0.72rem] text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "truncate font-mono text-[0.75rem] tabular-nums text-foreground",
          value === "Unknown" && "text-muted-foreground/70",
          valueClassName,
        )}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}
