import { Card, CardContent } from "@/components/ui/card";
import type { StudioErrorStats } from "@/lib/studio";

interface ErrorsStatsBarProps {
  stats: StudioErrorStats;
}

export function ErrorsStatsBar({ stats }: ErrorsStatsBarProps) {
  const items = [
    {
      label: "Unique error types",
      value: String(stats.uniqueErrorTypes),
    },
    {
      label: "Error occurrences",
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
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label} size="sm">
          <CardContent className="space-y-1 p-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              {item.label}
            </div>
            <div className="text-sm font-medium break-words">{item.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
