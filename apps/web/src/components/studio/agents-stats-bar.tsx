import type { StudioAgentsOverview } from "@/lib/studio";
import { formatDurationMs, formatPercent, formatTokenCount } from "@/lib/studio";

import { formatUsd } from "./agent-llm-call-table";
import { StatCell, StatStrip } from "./studio-primitives";

interface AgentsStatsBarProps {
  stats: StudioAgentsOverview["stats"];
  /** Optional LLM call rows used to estimate total cost. */
  llmCalls?: StudioAgentsOverview["llmCalls"];
}

export function AgentsStatsBar({ stats, llmCalls }: AgentsStatsBarProps) {
  const pricedCalls = (llmCalls ?? []).filter(
    (call) => typeof call.approxCostUsd === "number" && Number.isFinite(call.approxCostUsd),
  );
  const estimatedCost = pricedCalls.reduce((sum, call) => sum + (call.approxCostUsd ?? 0), 0);
  const successRate =
    stats.agentTasks > 0 ? (stats.agentTasks - stats.failedTasks) / stats.agentTasks : null;

  return (
    <StatStrip columns="grid-cols-2 @2xl:grid-cols-3 @5xl:grid-cols-5">
      <StatCell
        label="Agent tasks"
        value={stats.agentTasks}
        hint={
          <span className="font-mono tabular-nums">
            {stats.llmCalls} LLM · {stats.toolCalls} tool calls
          </span>
        }
      />
      <StatCell
        label="Task success rate"
        value={successRate === null ? "n/a" : formatPercent(successRate)}
        tone={stats.failedTasks > 0 ? "error" : "neutral"}
        hint={
          stats.failedTasks > 0
            ? `${stats.failedTasks} failed task${stats.failedTasks === 1 ? "" : "s"}`
            : "No failed tasks"
        }
      />
      <StatCell
        label="Total tokens"
        value={formatTokenCount(stats.totalTokens)}
        hint={`Across ${stats.llmCalls} LLM call${stats.llmCalls === 1 ? "" : "s"}`}
      />
      <StatCell
        label="Est. cost"
        value={pricedCalls.length > 0 ? formatUsd(estimatedCost) : "n/a"}
        hint={
          pricedCalls.length > 0
            ? `From ${pricedCalls.length} priced call${pricedCalls.length === 1 ? "" : "s"}`
            : "No pricing data"
        }
      />
      <StatCell
        label="Avg task duration"
        value={formatDurationMs(stats.avgTaskDurationMs)}
        hint="Per agent task"
        className="col-span-2 @5xl:col-span-1"
      />
    </StatStrip>
  );
}
