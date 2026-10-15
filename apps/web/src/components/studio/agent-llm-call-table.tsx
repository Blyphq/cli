import { Sparkles } from "lucide-react";

import { Card } from "@/components/ui/card";
import type { StudioAgentsOverview } from "@/lib/studio";
import { formatDurationMs, formatTokenCount } from "@/lib/studio";
import { cn } from "@/lib/utils";

import { EmptyState } from "./empty-state";
import { PanelHeader } from "./panel-header";

interface AgentLlmCallTableProps {
  calls: StudioAgentsOverview["llmCalls"];
}

/** Compact USD formatting for token cost estimates. */
export function formatUsd(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "n/a";
  }

  return `$${value.toFixed(value > 0 && value < 0.01 ? 4 : 2)}`;
}

const headCell = "px-3 font-medium whitespace-nowrap";

export function AgentLlmCallTable({ calls }: AgentLlmCallTableProps) {
  if (calls.length === 0) {
    return (
      <EmptyState
        size="compact"
        icon={<Sparkles />}
        title="No LLM calls detected"
        description="LLM breakdown appears when the current filters include model or token events."
      />
    );
  }

  const maxDuration = Math.max(1, ...calls.map((call) => call.durationMs ?? 0));

  return (
    <Card size="sm" className="min-w-0 gap-0 py-0">
      <PanelHeader
        className="py-3"
        title="LLM call breakdown"
        description="Sorted by slowest call first."
      />
      <div className="min-w-0 overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-left">
          <thead>
            <tr className="h-8 border-b border-border bg-muted/40 text-[0.7rem] text-muted-foreground">
              <th className={cn(headCell, "pl-4")}>Model</th>
              <th className={cn(headCell, "text-right")}>Prompt</th>
              <th className={cn(headCell, "text-right")}>Completion</th>
              <th className={cn(headCell, "text-right")}>Total</th>
              <th className={cn(headCell, "text-right")}>Cost</th>
              <th className={cn(headCell, "pr-4 text-right")}>Duration</th>
            </tr>
          </thead>
          <tbody className="font-mono text-[0.72rem] tabular-nums">
            {calls.map((call) => (
              <tr
                key={call.id}
                className="border-b border-border/70 transition-colors duration-150 last:border-0 hover:bg-muted/60"
              >
                <td className="max-w-[18rem] py-2 pr-3 pl-4">
                  <div className="truncate text-foreground" title={call.model ?? undefined}>
                    {call.model ?? "Unknown model"}
                  </div>
                  <div className="truncate font-sans text-[0.7rem] text-muted-foreground">
                    {call.taskTitle}
                  </div>
                </td>
                <td className="px-3 py-2 text-right text-muted-foreground">
                  {formatTokenCount(call.promptTokens)}
                </td>
                <td className="px-3 py-2 text-right text-muted-foreground">
                  {formatTokenCount(call.completionTokens)}
                </td>
                <td className="px-3 py-2 text-right text-foreground">
                  {formatTokenCount(call.totalTokens)}
                </td>
                <td className="px-3 py-2 text-right text-muted-foreground">
                  {formatUsd(call.approxCostUsd)}
                </td>
                <td className="py-2 pr-4 pl-3">
                  <div className="flex items-center justify-end gap-2">
                    <span
                      aria-hidden
                      className="hidden h-1 w-12 overflow-hidden rounded-full bg-muted sm:block"
                    >
                      <span
                        className="block h-full rounded-full bg-muted-foreground/45"
                        style={{
                          width: `${Math.max(4, ((call.durationMs ?? 0) / maxDuration) * 100)}%`,
                        }}
                      />
                    </span>
                    <span className="w-14 text-right text-foreground">
                      {formatDurationMs(call.durationMs)}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
