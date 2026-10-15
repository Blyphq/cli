import type { StudioHttpStats, StudioHttpStatusGroup } from "@/lib/studio";
import { formatDurationMs, formatPercent, formatRequestsPerMinute } from "@/lib/studio";

import { MeterBar, StatCell, StatStrip, StatusDot, type StudioTone } from "./studio-primitives";

interface HttpStatsBarProps {
  stats: StudioHttpStats;
}

const STATUS_GROUP_TONES: Record<StudioHttpStatusGroup, StudioTone> = {
  "2xx": "ok",
  "3xx": "info",
  "4xx": "warn",
  "5xx": "error",
};

const STATUS_GROUP_ORDER: StudioHttpStatusGroup[] = ["2xx", "3xx", "4xx", "5xx"];

function getErrorRateTone(errorRate: number): StudioTone {
  if (errorRate >= 0.05) {
    return "error";
  }

  return errorRate > 0 ? "warn" : "neutral";
}

function getLatencyTone(value: number | null): StudioTone {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "neutral";
  }

  return value > 500 ? "warn" : "neutral";
}

export function HttpStatsBar({ stats }: HttpStatsBarProps) {
  const groups = STATUS_GROUP_ORDER.map((group) => ({
    group,
    count: stats.statusGroups[group] ?? 0,
    tone: STATUS_GROUP_TONES[group],
  }));
  const totalGrouped = groups.reduce((sum, item) => sum + item.count, 0);
  const successShare = totalGrouped > 0 ? (stats.statusGroups["2xx"] ?? 0) / totalGrouped : null;

  return (
    <StatStrip columns="grid-cols-2 @2xl:grid-cols-3 @6xl:grid-cols-[repeat(5,minmax(0,1fr))_minmax(15rem,1.4fr)]">
      <StatCell label="Total requests" value={stats.totalRequests.toLocaleString()} />
      <StatCell
        label="Error rate"
        value={formatPercent(stats.errorRate)}
        tone={getErrorRateTone(stats.errorRate)}
      />
      <StatCell
        label="p50 response time"
        value={formatDurationMs(stats.p50DurationMs)}
      />
      <StatCell
        label="p95 response time"
        value={formatDurationMs(stats.p95DurationMs)}
        tone={getLatencyTone(stats.p95DurationMs)}
      />
      <StatCell label="Requests/min" value={formatRequestsPerMinute(stats.requestsPerMinute)} />
      <StatCell
        label="Status mix"
        value={successShare === null ? "n/a" : formatPercent(successShare)}
        hint="2xx share"
        footer={
          <div className="space-y-2 pt-0.5">
            <MeterBar
              segments={groups.map((item) => ({
                value: item.count,
                tone: item.tone,
                label: `${item.group}: ${item.count}`,
              }))}
            />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[0.68rem] tabular-nums text-muted-foreground">
              {groups.map((item) => (
                <span key={item.group} className="inline-flex items-center gap-1.5">
                  <StatusDot tone={item.tone} />
                  <span>{item.group}</span>
                  <span className="text-foreground">{item.count}</span>
                </span>
              ))}
            </div>
          </div>
        }
      />
    </StatStrip>
  );
}
