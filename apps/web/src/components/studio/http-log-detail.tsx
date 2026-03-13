import { startTransition, useEffect, useMemo, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { StudioRecord } from "@/lib/studio";
import { buildHttpPreview } from "@/lib/studio";

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
    <Card size="sm" className="bg-muted/30">
      <CardHeader className="border-b border-border/60">
        <CardTitle>HTTP View</CardTitle>
        <CardDescription>
          {record.http?.method ?? "?"} {record.http?.path ?? record.http?.url ?? "/"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground sm:grid-cols-4">
          <DetailStat label="Method" value={record.http?.method ?? "Unknown"} />
          <DetailStat label="Status" value={record.http?.statusCode?.toString() ?? "Unknown"} />
          <DetailStat label="Duration" value={record.http?.durationMs ? `${record.http.durationMs}ms` : "Unknown"} />
          <DetailStat label="Kind" value={record.http?.kind ?? "Unknown"} />
        </div>
        {html ? (
          <div
            className="[&_.shiki]:overflow-x-auto [&_.shiki]:rounded-none [&_.shiki]:bg-transparent [&_.shiki]:p-0 [&_.shiki]:font-mono [&_.shiki]:text-[11px] [&_.shiki]:leading-5"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <pre className="overflow-x-auto whitespace-pre-wrap bg-background/80 p-3 font-mono text-[11px] leading-5 text-foreground">
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
