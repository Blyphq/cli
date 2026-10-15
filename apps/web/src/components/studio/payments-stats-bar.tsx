import type { StudioPaymentsOverview } from "@/lib/studio";
import { formatPaymentAmount, formatPercent } from "@/lib/studio";

import { MeterBar, StatCell, StatStrip } from "./studio-primitives";

interface PaymentsStatsBarProps {
  stats: StudioPaymentsOverview["stats"];
}

export function PaymentsStatsBar({ stats }: PaymentsStatsBarProps) {
  const hasRevenue = Boolean(stats.revenueProcessed);
  const successfulCheckouts = Math.round(stats.successRate * stats.checkoutAttempts);
  const pendingCheckouts = Math.max(0, stats.checkoutAttempts - successfulCheckouts - stats.failedPayments);
  const successTone =
    stats.checkoutAttempts === 0 ? "neutral" : stats.successRate < 0.5 ? "error" : stats.successRate < 0.9 ? "warn" : "neutral";

  return (
    <StatStrip
      columns={
        hasRevenue
          ? "grid-cols-2 @2xl:grid-cols-4 @5xl:grid-cols-[minmax(0,1.5fr)_repeat(4,minmax(0,1fr))]"
          : "grid-cols-2 @2xl:grid-cols-4"
      }
    >
      {hasRevenue ? (
        <StatCell
          className="col-span-2 @2xl:col-span-4 @5xl:col-span-1"
          label="Revenue processed"
          value={
            <span className="text-[2rem] leading-none tracking-[-0.045em]">
              {formatPaymentAmount(stats.revenueProcessed)}
            </span>
          }
          hint={
            <span className="font-mono tabular-nums">
              {stats.revenueProcessed?.currency ?? stats.currency ?? "currency n/a"}
              {stats.revenueProcessed?.inferredMinorUnits ? " · inferred minor units" : ""}
            </span>
          }
        />
      ) : null}
      <StatCell
        label="Checkout attempts"
        value={stats.checkoutAttempts.toLocaleString()}
        hint={
          <span className="font-mono tabular-nums">
            {successfulCheckouts} ok · {stats.failedPayments} failed
            {pendingCheckouts > 0 ? ` · ${pendingCheckouts} pending` : ""}
          </span>
        }
        footer={
          stats.checkoutAttempts > 0 ? (
            <MeterBar
              className="mt-0.5"
              segments={[
                { value: successfulCheckouts, tone: "ok", label: `${successfulCheckouts} succeeded` },
                { value: pendingCheckouts, tone: "info", label: `${pendingCheckouts} pending` },
                { value: stats.failedPayments, tone: "error", label: `${stats.failedPayments} failed` },
              ]}
            />
          ) : null
        }
      />
      <StatCell
        label="Success rate"
        value={formatPercent(stats.successRate)}
        tone={successTone}
        trend={
          stats.successRateDeltaPercent == null
            ? undefined
            : {
                direction: stats.successRateTrend,
                label: `${Math.round(Math.abs(stats.successRateDeltaPercent))}%`,
                goodWhen: "up",
              }
        }
        hint={stats.successRateComparisonWindowLabel}
      />
      <StatCell
        label="Failed payments"
        value={stats.failedPayments.toLocaleString()}
        tone={stats.failedPayments > 0 ? "error" : "neutral"}
        hint={stats.mostCommonFailureReason ?? "No failures detected"}
      />
      <StatCell
        label="Webhooks received"
        value={stats.webhookEvents.toLocaleString()}
        hint="Provider callbacks in scope"
      />
    </StatStrip>
  );
}
