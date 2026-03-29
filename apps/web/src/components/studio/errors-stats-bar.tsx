import { Card, CardContent } from "@/components/ui/card";
import type { StudioErrorStats } from "@/lib/studio";

interface ErrorsStatsBarProps {
  stats: StudioErrorStats;
}

export function ErrorsStatsBar({ stats }: ErrorsStatsBarProps) {
  const items = [
    {
      label: "Unique error types",
      value: String(stats.totalUniqueErrorTypes),
    },
    {
      label: "Error occurrences",
      value: String(stats.totalErrorOccurrences),
    },
    {
      label: "Most frequent",
      value: stats.mostFrequentError
        ? `${stats.mostFrequentError.errorType ?? stats.mostFrequentError.message} (${stats.mostFrequentError.count})`
        : "None",
    },
    {
      label: "New this session",
      value: String(stats.newErrorsThisSession),
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
