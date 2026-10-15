import type { StudioErrorStats } from "@/lib/studio";

import { ErrorStatsBar } from "./error-stats-bar";

interface ErrorsStatsBarProps {
  stats: StudioErrorStats;
}

/** Alternate labelling of the errors stat strip; shares the ruled `StatStrip` layout. */
export function ErrorsStatsBar({ stats }: ErrorsStatsBarProps) {
  return (
    <ErrorStatsBar
      stats={stats}
      labels={{
        unique: "Unique error types",
        occurrences: "Error occurrences",
        crossSession: "Cross-session new",
      }}
    />
  );
}
