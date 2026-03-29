import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  formatOverviewMetricValue,
  formatOverviewTrend,
  formatRelativeTime,
  getOverviewStatusClasses,
  type StudioOverview,
} from "@/lib/studio";
import { cn } from "@/lib/utils";

interface OverviewHealthBarProps {
  stats: StudioOverview["stats"];
  connectedAt: string;
  now: number;
}

export function OverviewHealthBar({
  stats,
  connectedAt,
  now,
}: OverviewHealthBarProps) {
  const uptimeMs = Math.max(0, now - Date.parse(connectedAt));
  const cards = [
    stats.totalEvents,
    stats.errorRate,
    stats.activeTraces,
    stats.warnings,
    stats.avgResponseTime,
    {
      ...stats.uptime,
      value: uptimeMs,
      helperText: `Connected ${formatRelativeTime(connectedAt, now)}.`,
    },
  ] as const;

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {cards.map((stat) => (
        <Card
          key={stat.label}
          className={cn("border shadow-sm", getOverviewStatusClasses(stat.status))}
        >
          <CardContent className="space-y-4 pt-5">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-[0.18em] opacity-70">
                  {stat.label}
                </div>
                <div className="text-3xl font-medium tracking-tight">
                  {formatOverviewMetricValue(stat.label, stat.value)}
                </div>
              </div>
              <Badge variant="outline" className="rounded-none border-current/30 bg-transparent text-[10px] uppercase">
                {stat.status}
              </Badge>
            </div>
            <div className="flex min-h-6 items-center justify-between gap-3">
              {"trend" in stat ? (
                <div className="flex items-center gap-1 text-[11px] opacity-80">
                  {stat.trend === "up" ? (
                    <ArrowUpRight className="size-3.5" />
                  ) : stat.trend === "down" ? (
                    <ArrowDownRight className="size-3.5" />
                  ) : (
                    <ArrowRight className="size-3.5" />
                  )}
                  <span>{formatOverviewTrend(stat.trend, stat.deltaPercent)}</span>
                </div>
              ) : null}
            </div>
            <div className="space-y-1 text-[11px] leading-5 opacity-80">
              <div>{stat.helperText}</div>
              {"comparisonWindowLabel" in stat ? (
                <div>{stat.comparisonWindowLabel}</div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
