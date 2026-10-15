import { useMemo } from "react";

import { Bot, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { StudioAgentTask, StudioAgentsOverview } from "@/lib/studio";
import {
  formatDateTime,
  formatDurationMs,
  formatRelativeToSessionStart,
  formatTokenCount,
  getAgentTaskStatusBadgeVariant,
} from "@/lib/studio";
import { cn } from "@/lib/utils";

import { formatUsd } from "./agent-llm-call-table";
import { EmptyState } from "./empty-state";
import { PanelHeader } from "./panel-header";
import { MonoChip } from "./studio-primitives";
import { ListRowsSkeleton } from "./studio-skeletons";

interface AgentTaskListProps {
  tasks: StudioAgentsOverview["tasks"];
  loading: boolean;
  selectedTaskId: string | null;
  sessionStart: string | null;
  onSelect(taskId: string): void;
  /** Optional LLM call rows used to derive per-task model and cost. */
  llmCalls?: StudioAgentsOverview["llmCalls"];
}

interface TaskLlmSummary {
  models: string[];
  costUsd: number | null;
}

export function formatAgentStatus(status: string): string {
  return status.replace(/_/g, " ");
}

export function AgentTaskList({
  tasks,
  loading,
  selectedTaskId,
  sessionStart,
  onSelect,
  llmCalls,
}: AgentTaskListProps) {
  const llmByTask = useMemo(() => {
    const map = new Map<string, TaskLlmSummary>();
    for (const call of llmCalls ?? []) {
      const entry = map.get(call.taskId) ?? { models: [], costUsd: null };
      if (call.model && !entry.models.includes(call.model)) {
        entry.models.push(call.model);
      }
      if (typeof call.approxCostUsd === "number" && Number.isFinite(call.approxCostUsd)) {
        entry.costUsd = (entry.costUsd ?? 0) + call.approxCostUsd;
      }
      map.set(call.taskId, entry);
    }
    return map;
  }, [llmCalls]);

  if (!loading && tasks.length === 0) {
    return (
      <EmptyState
        icon={<Bot />}
        title="No agent tasks matched the current filters"
        description="Try a different file, date range, or search term."
      />
    );
  }

  return (
    <Card size="sm" className="min-w-0 gap-0 py-0">
      <PanelHeader
        className="py-3"
        title="Task timeline"
        description={`${tasks.length} task${tasks.length === 1 ? "" : "s"} shown`}
      />
      <div className="min-w-0">
        {loading && tasks.length === 0 ? (
          <div className="p-3">
            <ListRowsSkeleton rows={5} />
          </div>
        ) : null}
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            selected={selectedTaskId === task.id}
            sessionStart={sessionStart}
            llm={llmByTask.get(task.id)}
            onSelect={() => onSelect(task.id)}
          />
        ))}
      </div>
    </Card>
  );
}

function TaskRow({
  task,
  selected,
  sessionStart,
  llm,
  onSelect,
}: {
  task: StudioAgentTask;
  selected: boolean;
  sessionStart: string | null;
  llm: TaskLlmSummary | undefined;
  onSelect(): void;
}) {
  const counts = [
    `${task.stepCount} step${task.stepCount === 1 ? "" : "s"}`,
    `${task.llmCallCount} LLM`,
    `${task.toolCallCount} tool${task.toolCallCount === 1 ? "" : "s"}`,
    `${task.retrievalCount} retrieval${task.retrievalCount === 1 ? "" : "s"}`,
  ];
  const primaryModel = llm?.models[0] ?? null;
  const extraModels = Math.max(0, (llm?.models.length ?? 0) - 1);

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "group/task grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 border-b border-border/70 px-4 py-2.5 text-left outline-none transition-colors duration-150 last:border-0 hover:bg-muted/60 focus-visible:bg-muted",
        selected && "bg-primary-soft/50 shadow-[inset_2px_0_0_var(--signal)] hover:bg-primary-soft/60",
      )}
    >
      <div className="min-w-0 space-y-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <Badge variant={getAgentTaskStatusBadgeVariant(task.status)}>
            {formatAgentStatus(task.status)}
          </Badge>
          <span className="min-w-0 truncate text-[0.8rem] font-medium text-foreground">
            {task.title}
          </span>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[0.7rem] text-muted-foreground">
          {primaryModel ? (
            <MonoChip title={llm?.models.join(", ")}>
              {primaryModel}
              {extraModels > 0 ? ` +${extraModels}` : ""}
            </MonoChip>
          ) : null}
          {counts.map((item, index) => (
            <span key={`${task.id}:${item}`} className="inline-flex items-center gap-2">
              {index > 0 ? (
                <span aria-hidden className="text-muted-foreground/50">
                  ·
                </span>
              ) : null}
              <span className="font-mono tabular-nums">{item}</span>
            </span>
          ))}
          {task.startedAt ? (
            <span
              className="font-mono tabular-nums text-muted-foreground/80"
              title={`Started ${formatDateTime(task.startedAt)}`}
            >
              start {formatRelativeToSessionStart(task.startedAt, sessionStart)}
            </span>
          ) : null}
        </div>
        {task.failureMessage ? (
          <p className="truncate font-mono text-[0.7rem] text-level-error">{task.failureMessage}</p>
        ) : null}
      </div>
      <div className="flex flex-col items-end gap-1 font-mono text-[0.72rem] tabular-nums">
        <span className="text-foreground">{formatDurationMs(task.durationMs)}</span>
        <span className="text-muted-foreground">
          {formatTokenCount(task.totalTokens)} tok
          {llm?.costUsd != null ? ` · ${formatUsd(llm.costUsd)}` : ""}
        </span>
        {task.stepCount > 4 ? (
          <span className="inline-flex items-center gap-0.5 font-sans text-[0.68rem] text-muted-foreground transition-colors group-hover/task:text-primary">
            View full timeline
            <ChevronRight aria-hidden className="size-3" />
          </span>
        ) : null}
      </div>
    </button>
  );
}
