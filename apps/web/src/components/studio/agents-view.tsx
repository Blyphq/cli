import type { StudioAgentsOverview } from "@/lib/studio";

import { AgentFailureAnalysisPanel } from "./agent-failure-analysis-panel";
import { AgentLlmCallTable } from "./agent-llm-call-table";
import { AgentTaskList } from "./agent-task-list";
import { AgentToolCallTable } from "./agent-tool-call-table";
import { AgentsStatsBar } from "./agents-stats-bar";
import { EmptyState } from "./empty-state";

interface AgentsViewProps {
  agents: StudioAgentsOverview | undefined;
  loading: boolean;
  selectedTaskId: string | null;
  onSelectTask(taskId: string): void;
  onAskAi(taskId: string): void;
}

export function AgentsView({
  agents,
  loading,
  selectedTaskId,
  onSelectTask,
  onAskAi,
}: AgentsViewProps) {
  if (!agents && loading) {
    return (
      <EmptyState
        title="Loading agents"
        description="Correlating AI-native logs into agent tasks."
      />
    );
  }

  return (
    <div className="space-y-4">
      <AgentsStatsBar
        stats={
          agents?.stats ?? {
            agentTasks: 0,
            llmCalls: 0,
            avgTaskDurationMs: null,
            toolCalls: 0,
            failedTasks: 0,
            totalTokens: 0,
          }
        }
      />
      <AgentTaskList
        tasks={agents?.tasks ?? []}
        loading={loading}
        selectedTaskId={selectedTaskId}
        onSelect={onSelectTask}
      />
      <AgentFailureAnalysisPanel
        failures={agents?.failures ?? []}
        onAskAi={onAskAi}
      />
      <AgentLlmCallTable calls={agents?.llmCalls ?? []} />
      <AgentToolCallTable calls={agents?.toolCalls ?? []} />
    </div>
  );
}
