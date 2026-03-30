import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { StudioAgentTaskDetail } from "@/lib/studio";
import {
  formatCompactDateTime,
  formatDurationMs,
  formatRelativeToSessionStart,
  formatTokenCount,
  getAgentTaskStatusBadgeVariant,
} from "@/lib/studio";

import { EmptyState } from "./empty-state";
import { PanelHeader } from "./panel-header";

interface AgentTaskDetailPanelProps {
  detail: StudioAgentTaskDetail | null | undefined;
  loading?: boolean;
  onAskAi(): void;
}

export function AgentTaskDetailPanel({
  detail,
  loading = false,
  onAskAi,
}: AgentTaskDetailPanelProps) {
  if (loading && !detail) {
    return (
      <EmptyState
        title="Loading task"
        description="Resolving the selected agent task."
      />
    );
  }

  if (!detail) {
    return (
      <EmptyState
        title="Select a task"
        description="Choose an agent task to inspect its timeline, cost, and failure detail."
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <PanelHeader
          title={detail.task.title}
          description={`Started ${formatCompactDateTime(detail.task.startedAt)} • Duration ${formatDurationMs(detail.task.durationMs)}`}
          action={
            detail.task.status === "FAILED" ? (
              <Button variant="secondary" size="xs" onClick={onAskAi}>
                Ask AI
              </Button>
            ) : null
          }
        />
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant={getAgentTaskStatusBadgeVariant(detail.task.status)}>
              {detail.task.status}
            </Badge>
            <Badge variant="outline">{detail.task.stepCount} steps</Badge>
            <Badge variant="outline">{formatTokenCount(detail.task.totalTokens)} tokens</Badge>
            <Badge variant="outline">{detail.task.correlationSource}</Badge>
          </div>
          {detail.failure ? (
            <div className="text-sm text-destructive">
              {detail.failure.errorKind.toUpperCase()} failure: {detail.failure.errorMessage ?? "Unknown failure"}
            </div>
          ) : null}
        </CardContent>
      </Card>
      <Card size="sm">
        <PanelHeader title="Timeline" description="Chronological task steps and durations." />
        <CardContent className="space-y-3">
          {detail.steps.map((step) => (
            <Collapsible key={step.id} className="border border-border/60 bg-background/40 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    <span className="font-mono text-xs text-muted-foreground">
                      {formatRelativeToSessionStart(step.timestamp, detail.task.startedAt)}
                    </span>
                    <Badge variant="outline">{step.type}</Badge>
                    <span>{step.name}</span>
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span>{step.summary}</span>
                    {step.status ? <span>Status: {step.status}</span> : null}
                    {step.model ? <span>Model: {step.model}</span> : null}
                    {step.toolName ? <span>Tool: {step.toolName}</span> : null}
                    {typeof step.totalTokens === "number" ? (
                      <span>Tokens: {formatTokenCount(step.totalTokens)}</span>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge variant="secondary">{formatDurationMs(step.durationMs)}</Badge>
                  <CollapsibleTrigger asChild>
                    <Button variant="outline" size="xs">
                      Details
                    </Button>
                  </CollapsibleTrigger>
                </div>
              </div>
              <CollapsibleContent className="pt-3">
                <div className="space-y-3 text-xs">
                  {step.inputPreview ? <div>Input: {step.inputPreview}</div> : null}
                  {step.outputPreview ? <div>Output: {step.outputPreview}</div> : null}
                  <div className="flex flex-wrap gap-3 text-muted-foreground">
                    {typeof step.promptTokens === "number" ? (
                      <span>Prompt: {formatTokenCount(step.promptTokens)}</span>
                    ) : null}
                    {typeof step.completionTokens === "number" ? (
                      <span>Completion: {formatTokenCount(step.completionTokens)}</span>
                    ) : null}
                    <span>Duration source: {step.durationSource}</span>
                  </div>
                  {step.errorMessage ? (
                    <div className="text-destructive">{step.errorMessage}</div>
                  ) : null}
                  <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded border border-border/60 bg-muted/20 p-3 font-mono text-[11px] leading-5">
                    {JSON.stringify(step.rawDetails, null, 2)}
                  </pre>
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
