import type { StudioBackgroundJobRun, StudioBackgroundJobRunDetail } from "@/lib/studio";

import { EmptyState } from "./empty-state";
import { PanelHeader } from "./panel-header";
import { BackgroundJobRunCard } from "./background-job-run-card";

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
        title="No background job runs matched"
        description="Try a different file, time range, or search term."
      />
    );
  }

  return (
    <div className="space-y-3">
      <PanelHeader
        title="Job runs"
        description="Each run is grouped into a discrete execution timeline."
      />
      <div className="space-y-3">
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
    </div>
  );
}
