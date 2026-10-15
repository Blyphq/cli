import type { StudioDatabaseOverview } from "@/lib/studio";
import { formatDurationMs } from "@/lib/studio";

import { StatCell, StatStrip, type StudioTone } from "./studio-primitives";

interface DatabaseStatsBarProps {
  stats: StudioDatabaseOverview["stats"];
}

function getAvgTone(value: number | null | undefined): StudioTone {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "neutral";
  }

  if (value > 500) {
    return "error";
  }

  return value > 100 ? "warn" : "neutral";
}

function share(part: number, total: number): string | undefined {
  if (total <= 0 || part <= 0) {
    return undefined;
  }

  return `${Math.round((part / total) * 100)}% of queries`;
}

export function DatabaseStatsBar({ stats }: DatabaseStatsBarProps) {
  return (
    <StatStrip columns="grid-cols-2 @2xl:grid-cols-3 @5xl:grid-cols-5">
      <StatCell label="Total queries" value={stats.totalQueries.toLocaleString()} />
      <StatCell
        label="Slow queries"
        value={stats.slowQueries.toLocaleString()}
        tone={stats.slowQueries > 0 ? "warn" : "neutral"}
        hint={share(stats.slowQueries, stats.totalQueries) ?? "Above 100ms"}
      />
      <StatCell
        label="Failed queries"
        value={stats.failedQueries.toLocaleString()}
        tone={stats.failedQueries > 0 ? "error" : "neutral"}
        hint={share(stats.failedQueries, stats.totalQueries)}
      />
      <StatCell
        label="Avg query time"
        value={formatDurationMs(stats.avgQueryTimeMs)}
        tone={getAvgTone(stats.avgQueryTimeMs)}
      />
      <StatCell
        className="col-span-2 @2xl:col-span-1"
        label="Active transactions"
        value={stats.activeTransactions.toLocaleString()}
        tone={stats.activeTransactions > 0 ? "info" : "neutral"}
      />
    </StatStrip>
  );
}
