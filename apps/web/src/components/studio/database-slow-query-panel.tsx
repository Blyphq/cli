import { Sparkles, Turtle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { StudioDatabaseQueryEvent } from "@/lib/studio";
import { formatDurationMs, getDurationClasses } from "@/lib/studio";
import { cn } from "@/lib/utils";

import { EmptyState } from "./empty-state";
import { PanelHeader } from "./panel-header";
import { MonoChip } from "./studio-primitives";

interface DatabaseSlowQueryPanelProps {
  queries: StudioDatabaseQueryEvent[];
  onSelectRecord(recordId: string): void;
  onAskAi(query: StudioDatabaseQueryEvent): void;
}

export function DatabaseSlowQueryPanel({
  queries,
  onSelectRecord,
  onAskAi,
}: DatabaseSlowQueryPanelProps) {
  if (queries.length === 0) {
    return (
      <EmptyState
        title="No slow queries detected"
        description="Queries above the 100ms threshold will appear here."
        size="compact"
        icon={<Turtle />}
      />
    );
  }

  const maxDuration = queries.reduce(
    (max, query) => (typeof query.durationMs === "number" && query.durationMs > max ? query.durationMs : max),
    0,
  );

  return (
    <Card className="min-w-0 gap-0 py-0">
      <PanelHeader
        className="py-3 [.border-b]:pb-3"
        title="Slow queries"
        description="Queries slower than 100ms, sorted slowest first."
      />
      <ol className="divide-y divide-border/70">
        {queries.map((query) => {
          const share =
            maxDuration > 0 && typeof query.durationMs === "number" ? query.durationMs / maxDuration : 0;

          return (
            <li key={query.id} className="flex min-w-0 flex-col gap-2.5 px-4 py-3">
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span
                    className={cn(
                      "w-16 shrink-0 font-mono text-[0.85rem] font-medium tabular-nums",
                      getDurationClasses(query.durationMs),
                    )}
                  >
                    {formatDurationMs(query.durationMs)}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex min-w-0 items-baseline gap-2 font-mono text-[0.75rem]">
                      <span className="shrink-0 font-medium text-foreground">{query.operation}</span>
                      <span
                        className={cn(
                          "truncate",
                          query.modelOrTable ? "text-muted-foreground" : "text-muted-foreground/60",
                        )}
                      >
                        {query.modelOrTable ?? "Unknown"}
                      </span>
                    </div>
                    <div className="h-1 w-full max-w-sm overflow-hidden rounded-full bg-muted" aria-hidden>
                      <div
                        className={cn(
                          "h-full rounded-full",
                          typeof query.durationMs === "number" && query.durationMs > 500
                            ? "bg-level-error/70"
                            : "bg-level-warn/70",
                        )}
                        style={{ width: `${Math.max(share * 100, share > 0 ? 3 : 0)}%` }}
                      />
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button variant="outline" size="sm" onClick={() => onSelectRecord(query.recordId)}>
                    Select record
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => onAskAi(query)}>
                    <Sparkles />
                    Ask AI
                  </Button>
                </div>
              </div>
              {query.queryText ? (
                <pre
                  className="max-h-24 overflow-auto rounded-md bg-muted/50 px-3 py-2 font-mono text-[0.7rem] leading-5 whitespace-pre-wrap break-all text-foreground/90"
                  title={query.queryText}
                >
                  {query.queryText}
                </pre>
              ) : null}
              {query.requestId || query.traceId || query.adapter || query.durationBreakdown ? (
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  {query.adapter ? <MonoChip>{query.adapter}</MonoChip> : null}
                  {query.requestId ? (
                    <MonoChip title={`Request ${query.requestId}`}>req {query.requestId}</MonoChip>
                  ) : null}
                  {query.traceId ? (
                    <MonoChip title={`Trace ${query.traceId}`}>trace {query.traceId}</MonoChip>
                  ) : null}
                  {query.durationBreakdown
                    ? Object.entries(query.durationBreakdown).map(([key, value]) => (
                        <MonoChip key={key}>
                          {key} {formatDurationMs(value)}
                        </MonoChip>
                      ))
                    : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
