import type { StudioBackgroundJobRun, StudioBackgroundJobsOverview } from "@/lib/studio";
import { formatDuration, formatPercent } from "@/lib/studio";

import { getRunAttempt } from "./background-job-run-card";
import { StatCell, StatStrip } from "./studio-primitives";

interface BackgroundJobsStatsBarProps {
  stats: StudioBackgroundJobsOverview["stats"];
  /** Optional run rows used to count retried runs (from logged attempt fields). */
  runs?: readonly StudioBackgroundJobRun[];
}

export function BackgroundJobsStatsBar({ stats, runs }: BackgroundJobsStatsBarProps) {
  const attempts = (runs ?? []).map(getRunAttempt).filter((value): value is number => value !== null);
  const retriedRuns = attempts.filter((attempt) => attempt > 1).length;
  const hasAttemptData = attempts.length > 0;

  return (
    <StatStrip
      columns={
        hasAttemptData
          ? "grid-cols-2 @2xl:grid-cols-3 @5xl:grid-cols-5"
          : "grid-cols-2 @2xl:grid-cols-4"
      }
    >
      <StatCell
        label="Jobs detected"
        value={stats.jobsDetected}
        hint={`Distinct job type${stats.jobsDetected === 1 ? "" : "s"}`}
      />
      <StatCell
        label="Total runs"
        value={stats.totalRuns}
        hint={
          <span className="font-mono tabular-nums">
            {stats.totalRuns > 0 ? `${formatPercent(stats.successRate)} success` : "No runs yet"}
          </span>
        }
      />
      <StatCell
        label="Failed runs"
        value={stats.failedRuns}
        tone={stats.failedRuns > 0 ? "error" : "neutral"}
        hint={stats.mostCommonFailureReason ?? "No failures detected"}
      />
      {hasAttemptData ? (
        <StatCell
          label="Retried runs"
          value={retriedRuns}
          tone={retriedRuns > 0 ? "warn" : "neutral"}
          hint={`${attempts.length} run${attempts.length === 1 ? "" : "s"} report attempts`}
        />
      ) : null}
      <StatCell
        label="Avg duration"
        value={formatDuration(stats.avgDurationMs)}
        hint="Per run"
        className={hasAttemptData ? "col-span-2 @2xl:col-span-2 @5xl:col-span-1" : undefined}
      />
    </StatStrip>
  );
}
