import { Card, CardContent } from "@/components/ui/card";
import type { StudioPaymentsOverview } from "@/lib/studio";
import { formatPaymentAmount, formatPercent } from "@/lib/studio";

interface PaymentsStatsBarProps {
  stats: StudioPaymentsOverview["stats"];
}

export function PaymentsStatsBar({ stats }: PaymentsStatsBarProps) {
  const items = [
    { label: "Checkout attempts", value: String(stats.checkoutAttempts) },
    {
      label: "Success rate",
      value: formatPercent(stats.successRate),
      meta:
        stats.successRateDeltaPercent == null
          ? stats.successRateComparisonWindowLabel
          : `${stats.successRateTrend} ${Math.round(Math.abs(stats.successRateDeltaPercent))}% ${stats.successRateComparisonWindowLabel}`,
    },
    {
      label: "Failed payments",
      value: String(stats.failedPayments),
      meta: stats.mostCommonFailureReason ?? "No failures detected",
    },
    ...(stats.revenueProcessed
      ? [{ label: "Revenue processed", value: formatPaymentAmount(stats.revenueProcessed) }]
      : []),
    { label: "Webhook events", value: String(stats.webhookEvents) },
  ];

  return (
    <div className={`grid gap-3 md:grid-cols-2 ${items.length >= 5 ? "xl:grid-cols-5" : "xl:grid-cols-4"}`}>
      {items.map((item) => (
        <Card key={item.label} size="sm">
          <CardContent className="space-y-1 p-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              {item.label}
            </div>
            <div className="break-words text-sm font-medium">{item.value}</div>
            {item.meta ? (
              <div className="text-xs text-muted-foreground">{item.meta}</div>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
