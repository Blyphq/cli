import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatDateTime, type StudioHttpStatusTimeseriesBucket } from "@/lib/studio";

import { EmptyState } from "./empty-state";
import { PanelHeader } from "./panel-header";

interface HttpStatusDistributionProps {
  buckets: StudioHttpStatusTimeseriesBucket[];
}

const chartConfig = {
  success2xx: {
    label: "2xx",
    color: "var(--color-chart-1)",
  },
  redirect3xx: {
    label: "3xx",
    color: "var(--color-chart-2)",
  },
  client4xx: {
    label: "4xx",
    color: "var(--color-chart-3)",
  },
  server5xx: {
    label: "5xx",
    color: "var(--color-chart-4)",
  },
} satisfies ChartConfig;

export function HttpStatusDistribution({ buckets }: HttpStatusDistributionProps) {
  if (buckets.length === 0) {
    return (
      <EmptyState
        title="No status distribution yet"
        description="Studio needs at least one complete HTTP request to chart response code groups over time."
        size="compact"
      />
    );
  }

  const data = buckets.map((bucket) => ({
    label: formatBucketLabel(bucket.start, bucket.end),
    success2xx: bucket.counts["2xx"],
    redirect3xx: bucket.counts["3xx"],
    client4xx: bucket.counts["4xx"],
    server5xx: bucket.counts["5xx"],
    start: bucket.start,
    end: bucket.end,
  }));

  return (
    <div className="space-y-3">
      <PanelHeader
        title="Status code distribution"
        description="Request volume by status code group across the current HTTP scope."
      />
      <div className="rounded-md border border-border/60 bg-card p-4">
        <ChartContainer config={chartConfig} className="h-64 w-full">
          <AreaChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              minTickGap={24}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              width={32}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) => {
                    const item = payload?.[0]?.payload as
                      | { start?: string; end?: string }
                      | undefined;
                    if (!item?.start || !item?.end) {
                      return "Request volume";
                    }

                    return `${formatDateTime(item.start)} to ${formatDateTime(item.end)}`;
                  }}
                />
              }
            />
            <Legend />
            <Area
              type="monotone"
              dataKey="success2xx"
              stackId="status"
              stroke="var(--color-success2xx)"
              fill="var(--color-success2xx)"
              fillOpacity={0.45}
            />
            <Area
              type="monotone"
              dataKey="redirect3xx"
              stackId="status"
              stroke="var(--color-redirect3xx)"
              fill="var(--color-redirect3xx)"
              fillOpacity={0.45}
            />
            <Area
              type="monotone"
              dataKey="client4xx"
              stackId="status"
              stroke="var(--color-client4xx)"
              fill="var(--color-client4xx)"
              fillOpacity={0.5}
            />
            <Area
              type="monotone"
              dataKey="server5xx"
              stackId="status"
              stroke="var(--color-server5xx)"
              fill="var(--color-server5xx)"
              fillOpacity={0.6}
            />
          </AreaChart>
        </ChartContainer>
      </div>
    </div>
  );
}

function formatBucketLabel(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const durationMs = endDate.getTime() - startDate.getTime();

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return start;
  }

  if (durationMs <= 60 * 60 * 1000) {
    return startDate.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return startDate.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
  });
}
