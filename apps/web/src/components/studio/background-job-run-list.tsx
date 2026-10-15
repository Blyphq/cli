import { Workflow } from "lucide-react";

import { Card } from "@/components/ui/card";
import type { StudioBackgroundJobRun, StudioBackgroundJobRunDetail } from "@/lib/studio";

import { BackgroundJobRunCard } from "./background-job-run-card";
import { EmptyState } from "./empty-state";
import { PanelHeader } from "./panel-header";

interface BackgroundJobRunListProps {
  runs: StudioBackgroundJobRun[];
  selectedRunId: string | null;
  expandedRunId: string | null;
  expandedRunDetail: StudioBackgroundJobRunDetail | null | undefined;
  expandedRunLoading: boolean;
  onSelect(runId: string): void;
  onToggleExpand(runId: string): void;
}

export function BackgroundJobRunList({
  runs,
  selectedRunId,
  expandedRunId,
  expandedRunDetail,
  expandedRunLoading,
  onSelect,
  onToggleExpand,
}: BackgroundJobRunListProps) {
  if (runs.length === 0) {
    return (
      <EmptyState
        icon={<Workflow />}
        title="No background job runs matched"
        description="Try a different file, time range, or search term."
      />
    );
  }

  return (
    <Card size="sm" className="min-w-0 gap-0 py-0">
      <PanelHeader
        className="py-3"
        title="Job runs"
        description="Each run is grouped into a discrete execution timeline."
        action={
          <span className="font-mono text-[0.7rem] tabular-nums text-muted-foreground">
            {runs.length} run{runs.length === 1 ? "" : "s"}
          </span>
        }
      />
      <div className="min-w-0">
        {runs.map((run) => (
          <BackgroundJobRunCard
            key={run.id}
            run={run}
            selected={selectedRunId === run.id}
            expanded={expandedRunId === run.id}
            detail={expandedRunId === run.id ? expandedRunDetail : null}
            loading={expandedRunId === run.id ? expandedRunLoading : false}
            onSelect={() => onSelect(run.id)}
            onToggleExpand={() => onToggleExpand(run.id)}
          />
        ))}
      </div>
    </Card>
  );
}
