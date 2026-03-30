import { Card, CardContent } from "@/components/ui/card";
import type { StudioAgentsOverview } from "@/lib/studio";
import {
  formatDurationMs,
  formatTokenCount,
} from "@/lib/studio";

interface AgentsStatsBarProps {
  stats: StudioAgentsOverview["stats"];
}

export function AgentsStatsBar({ stats }: AgentsStatsBarProps) {
  const items = [
    { label: "Agent tasks", value: String(stats.agentTasks) },
    { label: "LLM calls", value: String(stats.llmCalls) },
    { label: "Avg task duration", value: formatDurationMs(stats.avgTaskDurationMs) },
    { label: "Tool calls", value: String(stats.toolCalls) },
    { label: "Failed tasks", value: String(stats.failedTasks) },
    { label: "Total tokens", value: formatTokenCount(stats.totalTokens) },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
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
