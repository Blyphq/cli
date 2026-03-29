import { Card, CardContent } from "@/components/ui/card";
import type { StudioErrorStats } from "@/lib/studio";

interface ErrorStatsBarProps {
  stats: StudioErrorStats;
}

export function ErrorStatsBar({ stats }: ErrorStatsBarProps) {
  const items = [
    {
      label: "Unique errors",
      value: String(stats.uniqueErrorTypes),
    },
    {
      label: "Occurrences",
      value: String(stats.totalOccurrences),
    },
    {
      label: "Most frequent",
      value: stats.mostFrequentError
        ? `${stats.mostFrequentError.type} (${stats.mostFrequentError.count})`
        : "None",
    },
    {
      label: "Cross-session new",
      value: stats.newErrorsComparedToPreviousSessions.available
        ? String(stats.newErrorsComparedToPreviousSessions.count ?? 0)
        : "Unavailable",
    },
  ];

  return (
    <Card size="sm">
      <CardContent className="grid gap-3 px-4 py-4 md:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="space-y-1">
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              {item.label}
            </div>
            <div className="text-sm font-medium">{item.value}</div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
