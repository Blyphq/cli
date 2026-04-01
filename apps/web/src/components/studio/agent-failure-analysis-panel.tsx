import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { StudioAgentsOverview } from "@/lib/studio";

import { EmptyState } from "./empty-state";
import { PanelHeader } from "./panel-header";

interface AgentFailureAnalysisPanelProps {
  failures: StudioAgentsOverview["failures"];
  onAskAi(taskId: string): void;
}

export function AgentFailureAnalysisPanel({
  failures,
  onAskAi,
}: AgentFailureAnalysisPanelProps) {
  if (failures.length === 0) {
    return (
      <EmptyState
        title="No task failures detected"
        description="Failure analysis appears when agent tasks terminate with an error or timeout."
      />
    );
  }

  return (
    <Card size="sm">
      <PanelHeader title="Failure analysis" description="Failing step, error class, and task-scoped AI handoff." />
      <CardContent className="space-y-3">
        {failures.map((failure) => (
          <div key={failure.taskId} className="border border-border/60 bg-background/40 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="text-sm font-medium">{failure.taskTitle}</div>
                <div className="text-xs text-muted-foreground">
                  {failure.errorKind.toUpperCase()} · {failure.failedStepName ?? "Unknown step"}
                </div>
              </div>
              <Button variant="secondary" size="xs" onClick={() => onAskAi(failure.taskId)}>
                Ask AI
              </Button>
            </div>
            {failure.errorMessage ? (
              <div className="mt-2 text-xs text-destructive">{failure.errorMessage}</div>
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
