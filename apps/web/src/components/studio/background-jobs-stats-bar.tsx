import { Card, CardContent } from "@/components/ui/card";
import type { StudioBackgroundJobsOverview } from "@/lib/studio";
import { formatDuration, formatPercent } from "@/lib/studio";

interface BackgroundJobsStatsBarProps {
  stats: StudioBackgroundJobsOverview["stats"];
}

export function BackgroundJobsStatsBar({ stats }: BackgroundJobsStatsBarProps) {
  const items = [
    { label: "Jobs detected", value: String(stats.jobsDetected) },
    { label: "Total runs", value: String(stats.totalRuns) },
    { label: "Success rate", value: formatPercent(stats.successRate) },
    {
      label: "Failed runs",
      value: String(stats.failedRuns),
      meta: stats.mostCommonFailureReason ?? "No failures detected",
    },
    { label: "Avg duration", value: formatDuration(stats.avgDurationMs) },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      {items.map((item) => (
        <Card key={item.label} size="sm">
          <CardContent className="space-y-1 p-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              {item.label}
            </div>
            <div className="break-words text-sm font-medium">{item.value}</div>
            {item.meta ? (
              <div className="text-xs text-muted-foreground">{item.meta}</div>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
