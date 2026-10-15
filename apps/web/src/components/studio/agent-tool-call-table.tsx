import { Wrench } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { StudioAgentsOverview } from "@/lib/studio";
import { formatDurationMs } from "@/lib/studio";
import { cn } from "@/lib/utils";

import { EmptyState } from "./empty-state";
import { PanelHeader } from "./panel-header";

interface AgentToolCallTableProps {
  calls: StudioAgentsOverview["toolCalls"];
}

const headCell = "px-3 font-medium whitespace-nowrap";

function getOutcomeVariant(outcome: StudioAgentsOverview["toolCalls"][number]["outcome"]) {
  switch (outcome) {
    case "failure":
      return "destructive" as const;
    case "success":
      return "success" as const;
    default:
      return "muted" as const;
  }
}

export function AgentToolCallTable({ calls }: AgentToolCallTableProps) {
  if (calls.length === 0) {
    return (
      <EmptyState
        size="compact"
        icon={<Wrench />}
        title="No tool calls detected"
        description="Tool breakdown appears when the current filters include tool invocation events."
      />
    );
  }

  return (
    <Card size="sm" className="min-w-0 gap-0 py-0">
      <PanelHeader
        className="py-3"
        title="Tool call breakdown"
        description="Invocation status and duration by task."
      />
      <div className="min-w-0 overflow-x-auto">
        <table className="w-full min-w-[32rem] border-collapse text-left">
          <thead>
            <tr className="h-8 border-b border-border bg-muted/40 text-[0.7rem] text-muted-foreground">
              <th className={cn(headCell, "w-20 pl-4 text-center")}>Outcome</th>
              <th className={headCell}>Tool</th>
              <th className={headCell}>Task</th>
              <th className={cn(headCell, "pr-4 text-right")}>Duration</th>
            </tr>
          </thead>
          <tbody>
            {calls.map((call) => (
              <tr
                key={call.id}
                className={cn(
                  "border-b border-border/70 align-top transition-colors duration-150 last:border-0 hover:bg-muted/60",
                  call.outcome === "failure" && "bg-level-error/[0.03]",
                )}
              >
                <td className="py-2 pr-3 pl-4 text-center">
                  <Badge variant={getOutcomeVariant(call.outcome)} className="w-14">
                    {call.outcome}
                  </Badge>
                </td>
                <td className="max-w-[16rem] px-3 py-2">
                  <div className="truncate font-mono text-[0.75rem] text-foreground" title={call.name}>
                    {call.name}
                  </div>
                  {call.errorMessage ? (
                    <div className="mt-0.5 line-clamp-2 font-mono text-[0.7rem] text-level-error">
                      {call.errorMessage}
                    </div>
                  ) : null}
                </td>
                <td className="max-w-[14rem] px-3 py-2">
                  <div className="truncate text-[0.75rem] text-muted-foreground">{call.taskTitle}</div>
                </td>
                <td className="py-2 pr-4 pl-3 text-right font-mono text-[0.72rem] tabular-nums text-foreground">
                  {formatDurationMs(call.durationMs)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
