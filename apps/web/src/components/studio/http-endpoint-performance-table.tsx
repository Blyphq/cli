import type { KeyboardEvent } from "react";

import { Gauge } from "lucide-react";

import { Card } from "@/components/ui/card";
import type { StudioHttpEndpointPerformanceRow } from "@/lib/studio";
import {
  formatCompactDateTime,
  formatDateTime,
  formatDurationMs,
  formatPercent,
  getDurationClasses,
  getHttpPerformanceRowClasses,
} from "@/lib/studio";
import { cn } from "@/lib/utils";

import { EmptyState } from "./empty-state";
import { PanelHeader } from "./panel-header";
import { StatusDot } from "./studio-primitives";

interface HttpEndpointPerformanceTableProps {
  rows: StudioHttpEndpointPerformanceRow[];
  onSelectRoute(route: string): void;
}

export function HttpEndpointPerformanceTable({
  rows,
  onSelectRoute,
}: HttpEndpointPerformanceTableProps) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No endpoint performance yet"
        description="Studio hasn't observed any complete HTTP requests in the current scope."
        size="compact"
        icon={<Gauge />}
      />
    );
  }

  const maxP95 = rows.reduce(
    (max, row) => (typeof row.p95DurationMs === "number" && row.p95DurationMs > max ? row.p95DurationMs : max),
    0,
  );

  return (
    <Card className="min-w-0 gap-0 py-0">
      <PanelHeader
        className="py-3 [.border-b]:pb-3"
        title="Endpoint performance"
        description="Aggregated route performance sorted by p95 response time."
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left">
          <thead>
            <tr className="h-8 border-b border-border bg-muted/40 text-[0.7rem] font-medium text-muted-foreground">
              <th className="px-4 font-medium">Route</th>
              <th className="w-24 px-3 text-right font-medium">Requests</th>
              <th className="w-20 px-3 text-right font-medium">p50</th>
              <th className="w-44 px-3 font-medium">p95</th>
              <th className="w-24 px-3 text-right font-medium">Error rate</th>
              <th className="w-32 px-4 text-right font-medium">Last seen</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const p95Share =
                maxP95 > 0 && typeof row.p95DurationMs === "number" ? row.p95DurationMs / maxP95 : 0;

              return (
                <tr
                  key={row.route}
                  className={cn(
                    "cursor-pointer border-b border-border/70 outline-none transition-colors duration-150 last:border-0 hover:bg-muted/60 focus-visible:bg-muted",
                    getHttpPerformanceRowClasses(row.highlight),
                  )}
                  role="button"
                  tabIndex={0}
                  aria-label={`Filter route ${row.route}`}
                  onClick={() => onSelectRoute(row.route)}
                  onKeyDown={(event) => handleRowKeyDown(event, row.route, onSelectRoute)}
                >
                  <td className="max-w-0 px-4 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      {row.highlight === "error" ? (
                        <StatusDot tone="error" />
                      ) : row.highlight === "slow" ? (
                        <StatusDot tone="warn" />
                      ) : (
                        <StatusDot tone="neutral" className="opacity-0" />
                      )}
                      <span
                        className="truncate font-mono text-[0.75rem] text-foreground"
                        title={row.route}
                      >
                        {row.route}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-[0.75rem] tabular-nums text-foreground">
                    {row.requests.toLocaleString()}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right font-mono text-[0.75rem] tabular-nums",
                      getDurationClasses(row.p50DurationMs),
                    )}
                  >
                    {formatDurationMs(row.p50DurationMs)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2.5">
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                        <div
                          className={cn(
                            "h-full rounded-full",
                            getP95BarClass(row.p95DurationMs),
                          )}
                          style={{ width: `${Math.max(p95Share * 100, p95Share > 0 ? 3 : 0)}%` }}
                        />
                      </div>
                      <span
                        className={cn(
                          "w-14 shrink-0 text-right font-mono text-[0.75rem] tabular-nums",
                          getDurationClasses(row.p95DurationMs),
                        )}
                      >
                        {formatDurationMs(row.p95DurationMs)}
                      </span>
                    </div>
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right font-mono text-[0.75rem] tabular-nums",
                      row.errorRate >= 0.05
                        ? "text-level-error"
                        : row.errorRate > 0
                          ? "text-level-warn"
                          : "text-muted-foreground",
                    )}
                  >
                    {formatPercent(row.errorRate)}
                  </td>
                  <td
                    className="px-4 py-2 text-right font-mono text-[0.72rem] whitespace-nowrap tabular-nums text-muted-foreground/80"
                    title={formatDateTime(row.lastSeenAt)}
                  >
                    {formatCompactDateTime(row.lastSeenAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function getP95BarClass(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "bg-transparent";
  }

  if (value > 500) {
    return "bg-level-error/70";
  }

  if (value > 100) {
    return "bg-level-warn/70";
  }

  return "bg-muted-foreground/40";
}

function handleRowKeyDown(
  event: KeyboardEvent<HTMLTableRowElement>,
  route: string,
  onSelectRoute: (route: string) => void,
) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onSelectRoute(route);
  }
}
