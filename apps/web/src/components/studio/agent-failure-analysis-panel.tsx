import { ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { StudioAgentsOverview } from "@/lib/studio";
import { formatCompactDateTime } from "@/lib/studio";

import { EmptyState } from "./empty-state";
import { PanelHeader } from "./panel-header";
import { MonoChip } from "./studio-primitives";

interface AgentFailureAnalysisPanelProps {
  failures: StudioAgentsOverview["failures"];
  onAskAi(taskId: string): void;
}

const ERROR_KIND_LABEL: Record<StudioAgentsOverview["failures"][number]["errorKind"], string> = {
  llm: "LLM error",
  tool: "Tool error",
  agent: "Agent error",
  unknown: "Unknown error",
};

export function AgentFailureAnalysisPanel({
  failures,
  onAskAi,
}: AgentFailureAnalysisPanelProps) {
  if (failures.length === 0) {
    return (
      <EmptyState
        size="compact"
        icon={<ShieldCheck />}
        title="No task failures detected"
        description="Failure analysis appears when agent tasks terminate with an error or timeout."
      />
    );
  }

  return (
    <Card size="sm" className="min-w-0 gap-0 py-0">
      <PanelHeader
        className="py-3"
        title="Failure analysis"
        description="Failing step, error class, and task-scoped AI handoff."
        action={
          <Badge variant="destructive">
            {failures.length} failure{failures.length === 1 ? "" : "s"}
          </Badge>
        }
      />
      <CardContent className="space-y-2.5 py-3">
        {failures.map((failure) => (
          <div
            key={failure.taskId}
            className="rounded-md border border-level-error/30 bg-level-error/[0.06] p-3"
          >
            <div className="flex min-w-0 items-start gap-3">
              <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-level-error" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="min-w-0 truncate text-[0.8rem] font-medium text-foreground">
                    {failure.taskTitle}
                  </span>
                  <Badge variant={failure.status === "TIMEOUT" ? "warning" : "destructive"}>
                    {ERROR_KIND_LABEL[failure.errorKind] ?? failure.errorKind}
                  </Badge>
                </div>
                <div className="space-y-0.5">
                  <div className="text-[0.7rem] text-muted-foreground">Root cause</div>
                  <p className="text-[0.8rem] leading-relaxed text-pretty break-words text-level-error">
                    {failure.errorMessage ?? "No error message was recorded for this failure."}
                  </p>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[0.7rem] text-muted-foreground">
                  <span>Failed step</span>
                  <MonoChip className="bg-card/70 text-foreground" title={failure.failedStepName ?? undefined}>
                    {failure.failedStepName ?? "unknown step"}
                  </MonoChip>
                  {failure.failedAt ? (
                    <span className="font-mono tabular-nums text-muted-foreground/80">
                      {formatCompactDateTime(failure.failedAt)}
                    </span>
                  ) : null}
                </div>
              </div>
              <Button
                variant="outline"
                size="xs"
                className="shrink-0"
                onClick={() => onAskAi(failure.taskId)}
              >
                <Sparkles aria-hidden />
                Ask AI
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
