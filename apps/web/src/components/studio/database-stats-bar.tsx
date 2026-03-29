import { Card, CardContent } from "@/components/ui/card";
import type { StudioDatabaseOverview } from "@/lib/studio";
import { formatDurationMs } from "@/lib/studio";

interface DatabaseStatsBarProps {
  stats: StudioDatabaseOverview["stats"];
}

export function DatabaseStatsBar({ stats }: DatabaseStatsBarProps) {
  const items = [
    { label: "Total queries", value: String(stats.totalQueries) },
    { label: "Slow queries", value: String(stats.slowQueries) },
    { label: "Failed queries", value: String(stats.failedQueries) },
    { label: "Avg query time", value: formatDurationMs(stats.avgQueryTimeMs) },
    { label: "Active transactions", value: String(stats.activeTransactions) },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
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
    </div>
  );
}
