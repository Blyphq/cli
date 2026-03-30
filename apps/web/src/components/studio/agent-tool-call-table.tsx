import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { StudioAgentsOverview } from "@/lib/studio";
import { formatDurationMs } from "@/lib/studio";

import { EmptyState } from "./empty-state";
import { PanelHeader } from "./panel-header";

interface AgentToolCallTableProps {
  calls: StudioAgentsOverview["toolCalls"];
}

export function AgentToolCallTable({ calls }: AgentToolCallTableProps) {
  if (calls.length === 0) {
    return (
      <EmptyState
        title="No tool calls detected"
        description="Tool breakdown appears when the current filters include tool invocation events."
      />
    );
  }

  return (
    <Card size="sm">
      <PanelHeader title="Tool call breakdown" description="Invocation status and duration by task." />
      <CardContent className="space-y-3">
        {calls.map((call) => (
          <div key={call.id} className="border border-border/60 bg-background/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="text-sm font-medium">{call.name}</div>
                <div className="text-xs text-muted-foreground">{call.taskTitle}</div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={call.outcome === "failure" ? "destructive" : call.outcome === "success" ? "default" : "outline"}>
                  {call.outcome}
                </Badge>
                <span className="text-sm font-medium">{formatDurationMs(call.durationMs)}</span>
              </div>
            </div>
            {call.errorMessage ? (
              <div className="mt-2 text-xs text-destructive">{call.errorMessage}</div>
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
