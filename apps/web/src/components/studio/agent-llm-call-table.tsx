import { Card, CardContent } from "@/components/ui/card";
import type { StudioAgentLlmCallRow, StudioAgentsOverview } from "@/lib/studio";
import {
  formatApproxUsd,
  formatDurationMs,
  formatTokenCount,
} from "@/lib/studio";

import { EmptyState } from "./empty-state";
import { PanelHeader } from "./panel-header";

interface AgentLlmCallTableProps {
  calls: StudioAgentsOverview["llmCalls"];
}

export function AgentLlmCallTable({ calls }: AgentLlmCallTableProps) {
  if (calls.length === 0) {
    return (
      <EmptyState
        title="No LLM calls detected"
        description="LLM breakdown appears when the current filters include model or token events."
      />
    );
  }

  return (
    <Card size="sm">
      <PanelHeader title="LLM call breakdown" description="Sorted by slowest call first." />
      <CardContent className="space-y-3">
        {calls.map((call) => (
          <LlmRow key={call.id} call={call} />
        ))}
      </CardContent>
    </Card>
  );
}

function LlmRow({ call }: { call: StudioAgentLlmCallRow }) {
  return (
    <div className="border border-border/60 bg-background/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="text-sm font-medium">{call.model ?? "Unknown model"}</div>
          <div className="text-xs text-muted-foreground">{call.taskTitle}</div>
        </div>
        <div className="text-sm font-medium">{formatDurationMs(call.durationMs)}</div>
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span>Prompt: {formatTokenCount(call.promptTokens)}</span>
        <span>Completion: {formatTokenCount(call.completionTokens)}</span>
        <span>Total: {formatTokenCount(call.totalTokens)}</span>
        <span>{formatApproxUsd(call.approxCostUsd)}</span>
      </div>
    </div>
  );
}
