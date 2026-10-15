import type { StudioErrorStats } from "@/lib/studio";

import { StatCell, StatStrip } from "./studio-primitives";

interface ErrorStatsBarProps {
  stats: StudioErrorStats;
  labels?: Partial<Record<"unique" | "occurrences" | "mostFrequent" | "crossSession", string>>;
}

export function ErrorStatsBar({ stats, labels }: ErrorStatsBarProps) {
  const crossSession = stats.newErrorsComparedToPreviousSessions;
  const newCount = crossSession.available ? (crossSession.count ?? 0) : null;
  const mostFrequent = stats.mostFrequentError;

  return (
    <StatStrip columns="grid-cols-2 @2xl:grid-cols-4">
      <StatCell
        label={labels?.unique ?? "Unique errors"}
        value={stats.uniqueErrorTypes.toLocaleString()}
        hint="grouped by fingerprint"
      />
      <StatCell
        label={labels?.occurrences ?? "Occurrences"}
        value={stats.totalOccurrences.toLocaleString()}
        tone={stats.totalOccurrences > 0 ? "error" : "neutral"}
        hint={stats.totalOccurrences > 0 ? "in the inspected session" : "nothing thrown"}
      />
      <StatCell
        label={labels?.mostFrequent ?? "Most frequent"}
        value={
          mostFrequent ? (
            <span
              className="block truncate text-[1.05rem] leading-[1.6rem] tracking-[-0.02em]"
              title={`${mostFrequent.type} — ${mostFrequent.messageFirstLine}`}
            >
              {`${mostFrequent.type} ×${mostFrequent.count}`}
            </span>
          ) : (
            <span className="text-muted-foreground/60">—</span>
          )
        }
        hint={mostFrequent ? <span className="font-mono">{mostFrequent.messageFirstLine}</span> : "No errors yet"}
      />
      <StatCell
        label={labels?.crossSession ?? "New vs. previous sessions"}
        value={newCount === null ? <span className="text-muted-foreground/60">—</span> : newCount.toLocaleString()}
        tone={newCount && newCount > 0 ? "warn" : "neutral"}
        hint={newCount === null ? "Unavailable for this session" : newCount > 0 ? "not seen before" : "nothing new"}
      />
    </StatStrip>
  );
}
