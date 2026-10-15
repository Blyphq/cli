import { FileCode2, FileX2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { StudioRecordSourceContext } from "@/lib/studio";
import { cn } from "@/lib/utils";

import { CodeContextSkeleton } from "./studio-skeletons";
import { TruncatedPath } from "./truncated-path";

interface SourceContextPanelProps {
  source: StudioRecordSourceContext | null | undefined;
  loading?: boolean;
}

export function SourceContextPanel({
  source,
  loading = false,
}: SourceContextPanelProps) {
  if (loading) {
    return <CodeContextSkeleton />;
  }

  if (!source || source.status === "unavailable" || !source.location || !source.snippet) {
    return (
      <Card size="sm" className="min-w-0 gap-0 py-0">
        <CardContent className="flex min-w-0 items-start gap-3 py-3">
          <span className="grid size-7 shrink-0 place-items-center rounded-md border border-border bg-muted/40 text-muted-foreground">
            <FileX2 className="size-3.5" />
          </span>
          <div className="min-w-0 space-y-0.5">
            <div className="font-heading text-[0.82rem] font-semibold tracking-[-0.02em]">
              Source unavailable
            </div>
            <p className="text-[0.75rem] leading-relaxed text-muted-foreground">
              {getUnavailableDescription(source?.reason ?? "no_location")}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const snippetLines = source.snippet.split("\n");
  const startLine = source.startLine ?? 1;
  const lastLine = startLine + snippetLines.length - 1;
  const gutterWidth = `${String(lastLine).length + 3}ch`;

  return (
    <Card size="sm" className="min-w-0 gap-0 py-0">
      <div className="flex min-w-0 items-center gap-2 border-b border-border px-3 py-2">
        <FileCode2 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <h3 className="sr-only">Source context</h3>
        <TruncatedPath
          className="flex-1 text-[0.72rem]"
          value={`${source.location.relativePath}:${source.location.line}${source.location.column ? `:${source.location.column}` : ""}`}
        />
        {source.language ? (
          <Badge variant="muted" className="hidden sm:inline-flex">
            {source.language}
          </Badge>
        ) : null}
        <Badge variant="outline">{source.location.origin}</Badge>
      </div>
      <CardContent className="min-w-0 px-0 group-data-[size=sm]/card:px-0">
        <div className="overflow-x-auto bg-muted/50 py-2">
          <pre className="min-w-max font-mono text-[0.7rem] leading-5">
            {snippetLines.map((line, index) => {
              const lineNumber = startLine + index;
              const focused = lineNumber === source.focusLine;

              return (
                <div
                  key={`${lineNumber}:${line}`}
                  aria-current={focused ? "true" : undefined}
                  className={cn(
                    "grid",
                    focused &&
                      "bg-level-error/10 shadow-[inset_2px_0_0_var(--signal)]",
                  )}
                  style={{ gridTemplateColumns: `${gutterWidth} minmax(0,1fr)` }}
                >
                  <span
                    className={cn(
                      "select-none pr-2.5 text-right tabular-nums",
                      focused ? "text-level-error" : "text-muted-foreground/60",
                    )}
                  >
                    {lineNumber}
                  </span>
                  <code
                    className={cn(
                      "whitespace-pre pr-4",
                      focused ? "text-foreground" : "text-foreground/85",
                    )}
                  >
                    {line || " "}
                  </code>
                </div>
              );
            })}
          </pre>
        </div>
      </CardContent>
    </Card>
  );
}

function getUnavailableDescription(
  reason: StudioRecordSourceContext["reason"],
): string {
  switch (reason) {
    case "no_project_frame":
    case "outside_project":
    case "node_modules":
      return "No in-project source location was found for this record.";
    case "file_missing":
    case "read_failed":
      return "Studio identified a source location, but could not read the file.";
    case "unsupported_extension":
    case "file_too_large":
      return "Studio found a source location, but this file is not supported for inline preview.";
    case "no_location":
    default:
      return "Studio could not find a source location for this record.";
  }
}
