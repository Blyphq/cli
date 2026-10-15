import { ArrowDownRight, ArrowRight, ArrowUpRight, Gauge } from "lucide-react";

import { Card } from "@/components/ui/card";
import type { StudioBackgroundJobPerformanceRow } from "@/lib/studio";
import {
  formatCompactDateTime,
  formatDateTime,
  formatDuration,
  formatPercent,
  getBackgroundJobTrendLabel,
} from "@/lib/studio";
import { cn } from "@/lib/utils";

import { EmptyState } from "./empty-state";
import { PanelHeader } from "./panel-header";

interface BackgroundJobPerformanceTableProps {
  rows: StudioBackgroundJobPerformanceRow[];
}

const headCell = "px-3 font-medium whitespace-nowrap";

function getSuccessRateClass(rate: number): string {
  if (rate < 0.8) {
    return "text-level-error";
  }
  if (rate < 0.95) {
    return "text-level-warn";
  }
  return "text-foreground";
}

function TrendLabel({ trend }: { trend: StudioBackgroundJobPerformanceRow["trend"] }) {
  const label = getBackgroundJobTrendLabel(trend);
  const Icon = trend === "slower" ? ArrowUpRight : trend === "faster" ? ArrowDownRight : ArrowRight;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[0.72rem]",
        trend === "slower"
          ? "text-level-warn"
          : trend === "faster"
            ? "text-level-ok"
            : "text-muted-foreground",
      )}
    >
      {trend === "slower" || trend === "faster" || trend === "stable" ? (
        <Icon aria-hidden className="size-3" />
      ) : null}
      <span>{label}</span>
    </span>
  );
}

export function BackgroundJobPerformanceTable({
  rows,
}: BackgroundJobPerformanceTableProps) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Gauge />}
        title="No job performance yet"
        description="Studio hasn't observed enough background job activity to compute aggregates."
        size="compact"
      />
    );
  }

  const maxDuration = Math.max(
    1,
    ...rows.map((row) => Math.max(row.avgDurationMs ?? 0, row.p95DurationMs ?? 0)),
  );

  return (
    <Card size="sm" className="min-w-0 gap-0 py-0">
      <PanelHeader
        className="py-3"
        title="Job performance"
        description="Aggregated success rates and duration trends by job type."
      />
      <div className="min-w-0 overflow-x-auto">
        <table className="w-full min-w-[44rem] border-collapse text-left">
          <thead>
            <tr className="h-8 border-b border-border bg-muted/40 text-[0.7rem] text-muted-foreground">
              <th className={cn(headCell, "pl-4")}>Job</th>
              <th className={cn(headCell, "text-right")}>Runs</th>
              <th className={cn(headCell, "text-right")}>Success</th>
              <th className={headCell}>Avg duration</th>
              <th className={cn(headCell, "text-right")}>P95</th>
              <th className={cn(headCell, "text-right")}>Last run</th>
              <th className={cn(headCell, "pr-4")}>Trend</th>
            </tr>
          </thead>
          <tbody className="font-mono text-[0.72rem] tabular-nums">
            {rows.map((row) => {
              const avgWidth = ((row.avgDurationMs ?? 0) / maxDuration) * 100;
              const p95Width = ((row.p95DurationMs ?? 0) / maxDuration) * 100;

              return (
                <tr
                  key={row.jobName}
                  className="border-b border-border/70 transition-colors duration-150 last:border-0 hover:bg-muted/60"
                >
                  <td className="max-w-[16rem] py-2 pr-3 pl-4">
                    <div className="truncate font-sans text-[0.78rem] font-medium text-foreground" title={row.jobName}>
                      {row.jobName}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right text-foreground">{row.totalRuns}</td>
                  <td className={cn("px-3 py-2 text-right", getSuccessRateClass(row.successRate))}>
                    {formatPercent(row.successRate)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="w-14 shrink-0 text-right text-foreground">
                        {formatDuration(row.avgDurationMs)}
                      </span>
                      <span
                        aria-hidden
                        title="Avg vs P95"
                        className="relative h-1 w-20 overflow-hidden rounded-full bg-muted"
                      >
                        <span
                          className="absolute inset-y-0 left-0 rounded-full bg-muted-foreground/20"
                          style={{ width: `${Math.max(2, p95Width)}%` }}
                        />
                        <span
                          className={cn(
                            "absolute inset-y-0 left-0 rounded-full",
                            row.trend === "slower" ? "bg-level-warn/70" : "bg-muted-foreground/55",
                          )}
                          style={{ width: `${Math.max(2, avgWidth)}%` }}
                        />
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">
                    {formatDuration(row.p95DurationMs)}
                  </td>
                  <td
                    className="px-3 py-2 text-right whitespace-nowrap text-muted-foreground/80"
                    title={formatDateTime(row.lastRunTimestamp)}
                  >
                    {formatCompactDateTime(row.lastRunTimestamp)}
                  </td>
                  <td className="py-2 pr-4 pl-3 font-sans whitespace-nowrap">
                    <TrendLabel trend={row.trend} />
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
