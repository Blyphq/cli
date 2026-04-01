import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { StudioRecordSourceContext } from "@/lib/studio";

import { EmptyState } from "./empty-state";
import { PanelHeader } from "./panel-header";
import { CodeContextSkeleton } from "./studio-skeletons";

interface SourceContextPanelProps {
  source: StudioRecordSourceContext | null | undefined;
  loading?: boolean;
}

export function SourceContextPanel({
  source,
  loading = false,
}: SourceContextPanelProps) {
  if (loading) {
    return (
      <CodeContextSkeleton />
    );
  }

  if (!source || source.status === "unavailable" || !source.location || !source.snippet) {
    return (
      <Card>
        <PanelHeader
          title="Source Context"
          description={getUnavailableDescription(source?.reason ?? "no_location")}
        />
        <CardContent>
          <EmptyState
            title="Source unavailable"
            description={getUnavailableDescription(source?.reason ?? "no_location")}
            size="compact"
          />
        </CardContent>
      </Card>
    );
  }

  const snippetLines = source.snippet.split("\n");

  return (
    <Card>
      <PanelHeader
        title="Source Context"
        description={`${source.location.relativePath}:${source.location.line}`}
        action={<Badge variant="secondary">{source.location.origin}</Badge>}
      />
      <CardContent className="space-y-3">
        <div className="overflow-x-auto border border-border/60 bg-muted/20">
          <pre className="min-w-0 text-xs leading-6">
            {snippetLines.map((line, index) => {
              const lineNumber = (source.startLine ?? 1) + index;
              const focused = lineNumber === source.focusLine;

              return (
                <div
                  key={`${lineNumber}:${line}`}
                  className={
                    focused
                      ? "grid grid-cols-[4rem_minmax(0,1fr)] bg-primary/10 text-primary"
                      : "grid grid-cols-[4rem_minmax(0,1fr)]"
                  }
                >
                  <span className="border-r border-border/60 px-3 text-muted-foreground">
                    {lineNumber}
                  </span>
                  <code className="px-3 whitespace-pre-wrap break-all text-foreground">
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
