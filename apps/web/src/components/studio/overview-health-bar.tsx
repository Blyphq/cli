import type { ReactNode } from "react";

import {
  formatOverviewMetricValue,
  formatRelativeTime,
  type StudioOverview,
  type StudioOverviewStatus,
} from "@/lib/studio";

import { StatCell, StatStrip, StatusDot, type StatCellProps, type StudioTone } from "./studio-primitives";

interface OverviewHealthBarProps {
  stats: StudioOverview["stats"];
  connectedAt: string;
  now: number;
}

/** Healthy metrics stay neutral; only problems pick up a level tone. */
function toneForStatus(status: StudioOverviewStatus): StudioTone {
  switch (status) {
    case "critical":
      return "error";
    case "warning":
      return "warn";
    default:
      return "neutral";
  }
}

function StatLabel({ children, title }: { children: ReactNode; title: string }) {
  return (
    <span title={title} className="truncate">
      {children}
    </span>
  );
}

function formatTrendLabel(deltaPercent: number | null, trend: "up" | "down" | "flat"): string {
  if (trend === "flat" || deltaPercent === null || !Number.isFinite(deltaPercent)) {
    return "No change";
  }
  return `${Math.abs(deltaPercent).toFixed(1)}%`;
}

export function OverviewHealthBar({ stats, connectedAt, now }: OverviewHealthBarProps) {
  const uptimeMs = Math.max(0, now - Date.parse(connectedAt));
  const { totalEvents, errorRate, activeTraces, warnings, avgResponseTime, uptime } = stats;

  const cells: Array<StatCellProps & { key: string }> = [
    {
      key: "total-events",
      label: <StatLabel title={totalEvents.helperText}>{totalEvents.label}</StatLabel>,
      value: formatOverviewMetricValue(totalEvents.label, totalEvents.value),
      tone: toneForStatus(totalEvents.status),
      hint: totalEvents.value > 0 ? "In current scope" : "Nothing in scope yet",
    },
    {
      key: "error-rate",
      label: <StatLabel title={errorRate.helperText}>{errorRate.label}</StatLabel>,
      value: formatOverviewMetricValue(errorRate.label, errorRate.value),
      tone: toneForStatus(errorRate.status),
      trend: {
        direction: errorRate.trend,
        label: formatTrendLabel(errorRate.deltaPercent, errorRate.trend),
        goodWhen: "down",
      },
      hint: errorRate.comparisonWindowLabel,
    },
    {
      key: "active-traces",
      label: <StatLabel title={activeTraces.helperText}>{activeTraces.label}</StatLabel>,
      value: formatOverviewMetricValue(activeTraces.label, activeTraces.value),
      tone: toneForStatus(activeTraces.status),
      hint: "Started, not yet completed",
    },
    {
      key: "warnings",
      label: <StatLabel title={warnings.helperText}>{warnings.label}</StatLabel>,
      value: formatOverviewMetricValue(warnings.label, warnings.value),
      tone: toneForStatus(warnings.status),
      hint: "Last 15 min",
    },
    {
      key: "avg-response-time",
      label: <StatLabel title={avgResponseTime.helperText}>{avgResponseTime.label}</StatLabel>,
      value: formatOverviewMetricValue(avgResponseTime.label, avgResponseTime.value),
      tone: toneForStatus(avgResponseTime.status),
      hint: avgResponseTime.value === null ? "No HTTP timing yet" : "p50 across HTTP",
    },
    {
      key: "uptime",
      label: (
        <span title={uptime.helperText} className="inline-flex min-w-0 items-center gap-1.5">
          <StatusDot tone="ok" />
          <span className="truncate">{uptime.label}</span>
        </span>
      ),
      value: formatOverviewMetricValue(uptime.label, uptimeMs),
      tone: "neutral",
      dot: false,
      hint: `Connected ${formatRelativeTime(connectedAt, now)}`,
    },
  ];

  return (
    <StatStrip columns="grid-cols-2 @2xl:grid-cols-3 @5xl:grid-cols-6">
      {cells.map(({ key, ...cell }) => (
        <StatCell key={key} {...cell} />
      ))}
    </StatStrip>
  );
}
