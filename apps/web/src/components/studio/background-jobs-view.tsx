import type { StudioBackgroundJobRunDetail, StudioBackgroundJobsOverview } from "@/lib/studio";

import { BackgroundJobPerformanceTable } from "./background-job-performance-table";
import { BackgroundJobRunList } from "./background-job-run-list";
import { BackgroundJobsStatsBar } from "./background-jobs-stats-bar";
import { ListRowsSkeleton, PanelSkeleton, StatTilesSkeleton } from "./studio-skeletons";

interface BackgroundJobsViewProps {
  page: StudioBackgroundJobsOverview | undefined;
  loading: boolean;
  selectedRunId: string | null;
  expandedRunId: string | null;
  expandedRunDetail: StudioBackgroundJobRunDetail | null | undefined;
  expandedRunLoading: boolean;
  onSelectRun(runId: string): void;
  onToggleExpand(runId: string): void;
}

export function BackgroundJobsView({
  page,
  loading,
  selectedRunId,
  expandedRunId,
  expandedRunDetail,
  expandedRunLoading,
  onSelectRun,
  onToggleExpand,
}: BackgroundJobsViewProps) {
  if (!page && loading) {
    return (
      <div className="flex flex-col gap-4">
        <StatTilesSkeleton />
        <PanelSkeleton rows={4} compact />
        <ListRowsSkeleton rows={5} />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <BackgroundJobsStatsBar
        runs={page?.runs}
        stats={
          page?.stats ?? {
            jobsDetected: 0,
            totalRuns: 0,
            successRate: 0,
            failedRuns: 0,
            mostCommonFailureReason: null,
            avgDurationMs: null,
          }
        }
      />
      <BackgroundJobPerformanceTable rows={page?.performance ?? []} />
      <BackgroundJobRunList
        runs={page?.runs ?? []}
        selectedRunId={selectedRunId}
        expandedRunId={expandedRunId}
        expandedRunDetail={expandedRunDetail}
        expandedRunLoading={expandedRunLoading}
        onSelect={onSelectRun}
        onToggleExpand={onToggleExpand}
      />
    </div>
  );
}
