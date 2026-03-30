import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { StudioAgentTask, StudioAgentsOverview } from "@/lib/studio";
import {
  formatDurationMs,
  formatRelativeToSessionStart,
  getAgentTaskStatusBadgeVariant,
} from "@/lib/studio";

import { EmptyState } from "./empty-state";
import { PanelHeader } from "./panel-header";

interface AgentTaskListProps {
  tasks: StudioAgentsOverview["tasks"];
  loading: boolean;
  selectedTaskId: string | null;
  sessionStart: string | null;
  onSelect(taskId: string): void;
}

export function AgentTaskList({
  tasks,
  loading,
  selectedTaskId,
  sessionStart,
  onSelect,
}: AgentTaskListProps) {
  if (!loading && tasks.length === 0) {
    return (
      <EmptyState
        title="No agent tasks matched the current filters"
        description="Try a different file, date range, or search term."
      />
    );
  }

  return (
    <Card size="sm">
      <PanelHeader
        title="Task timeline"
        description={loading ? "Loading agent tasks..." : `${tasks.length} task${tasks.length === 1 ? "" : "s"} shown`}
      />
      <CardContent className="space-y-3">
        {tasks.map((task) => (
          <button
            key={task.id}
            type="button"
            onClick={() => onSelect(task.id)}
            className={`w-full border border-border/60 p-3 text-left hover:bg-muted/20 ${selectedTaskId === task.id ? "bg-primary/10" : "bg-background/40"}`}
          >
            <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
              <span className="font-mono text-xs text-muted-foreground">{task.id}</span>
              <span>{task.title}</span>
              <Badge variant={getAgentTaskStatusBadgeVariant(task.status)}>{task.status}</Badge>
              <span className="text-xs text-muted-foreground">{formatDurationMs(task.durationMs)}</span>
            </div>
            <div className="mt-3 space-y-2">
              <TaskMeta task={task} sessionStart={sessionStart} />
            </div>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}

function TaskMeta({
  task,
  sessionStart,
}: {
  task: StudioAgentTask;
  sessionStart: string | null;
}) {
  const previews = [
    `${task.stepCount} steps`,
    `${task.llmCallCount} LLM`,
    `${task.toolCallCount} tools`,
    `${task.retrievalCount} retrieval`,
  ];

  return (
    <>
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {previews.map((item) => (
          <span key={`${task.id}:${item}`}>{item}</span>
        ))}
        {task.startedAt ? (
          <span>
            Start {formatRelativeToSessionStart(task.startedAt, sessionStart)}
          </span>
        ) : null}
      </div>
      {task.failureMessage ? (
        <div className="text-xs text-destructive">{task.failureMessage}</div>
      ) : null}
      {task.stepCount > 4 ? (
        <div className="text-xs font-medium text-primary">View full timeline</div>
      ) : null}
    </>
  );
}
