import { startTransition, useEffect, useMemo, useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import type { StudioRecord } from "@/lib/studio";
import { buildHttpPreview } from "@/lib/studio";
import { PanelHeader } from "./panel-header";
import { TruncatedPath } from "./truncated-path";

interface HttpLogDetailProps {
  record: StudioRecord;
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
          theme: "github-dark-dimmed",
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

  return (
    <Card size="sm" className="min-w-0 bg-muted/30">
      <PanelHeader
        title="HTTP View"
        description={
          <div className="min-w-0">
            <TruncatedPath
              value={`${record.http?.method ?? "?"} ${record.http?.path ?? record.http?.url ?? "/"}`}
            />
          </div>
        }
      />
      <CardContent className="min-w-0 space-y-3">
        <div className="grid gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
          <DetailStat label="Method" value={record.http?.method ?? "Unknown"} />
          <DetailStat label="Status" value={record.http?.statusCode?.toString() ?? "Unknown"} />
          <DetailStat label="Duration" value={record.http?.durationMs ? `${record.http.durationMs}ms` : "Unknown"} />
          <DetailStat label="Kind" value={record.http?.kind ?? "Unknown"} />
        </div>
        {html ? (
          <div
            className="overflow-x-auto [&_.shiki]:min-w-max [&_.shiki]:rounded-none [&_.shiki]:bg-transparent [&_.shiki]:p-0 [&_.shiki]:font-mono [&_.shiki]:text-[11px] [&_.shiki]:leading-5"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap bg-background/80 p-3 font-mono text-[11px] leading-5 text-foreground">
            {preview}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div>{label}</div>
      <div className="text-sm tracking-normal text-foreground">{value}</div>
    </div>
  );
}
