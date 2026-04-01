import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { StudioHttpStats } from "@/lib/studio";
import {
  formatDurationMs,
  formatPercent,
  formatRequestsPerMinute,
  getHttpStatusBadgeVariant,
} from "@/lib/studio";

interface HttpStatsBarProps {
  stats: StudioHttpStats;
}

export function HttpStatsBar({ stats }: HttpStatsBarProps) {
  const items = [
    { label: "Total requests", value: String(stats.totalRequests) },
    { label: "Error rate", value: formatPercent(stats.errorRate) },
    { label: "p50 response time", value: formatDurationMs(stats.p50DurationMs) },
    { label: "p95 response time", value: formatDurationMs(stats.p95DurationMs) },
    { label: "Requests/min", value: formatRequestsPerMinute(stats.requestsPerMinute) },
  ];

  return (
    <div className="grid gap-3 xl:grid-cols-[repeat(5,minmax(0,1fr))_auto]">
      {items.map((item) => (
        <Card key={item.label} size="sm">
          <CardContent className="space-y-1 py-1">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {item.label}
            </div>
            <div className="text-sm font-medium text-foreground">{item.value}</div>
          </CardContent>
        </Card>
      ))}
      <Card size="sm">
        <CardContent className="space-y-2 py-1">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Top status codes
          </div>
          <div className="flex flex-wrap gap-2">
            {(Object.entries(stats.statusGroups) as Array<[keyof typeof stats.statusGroups, number]>).map(
              ([group, count]) => (
                <Badge key={group} variant={getHttpStatusBadgeVariant(group)}>
                  {group} {count}
                </Badge>
              ),
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
