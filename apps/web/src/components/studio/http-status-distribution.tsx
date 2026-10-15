import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartColumn } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatDateTime, type StudioHttpStatusTimeseriesBucket } from "@/lib/studio";

import { EmptyState } from "./empty-state";
import { PanelHeader } from "./panel-header";
import { StatusDot, type StudioTone } from "./studio-primitives";

interface HttpStatusDistributionProps {
  buckets: StudioHttpStatusTimeseriesBucket[];
}

const chartConfig = {
  success2xx: {
    label: "2xx",
    color: "var(--level-ok)",
  },
  redirect3xx: {
    label: "3xx",
    color: "var(--level-info)",
  },
  client4xx: {
    label: "4xx",
    color: "var(--level-warn)",
  },
  server5xx: {
    label: "5xx",
    color: "var(--level-error)",
  },
} satisfies ChartConfig;

const SERIES: Array<{
  key: keyof typeof chartConfig;
  group: "2xx" | "3xx" | "4xx" | "5xx";
  tone: StudioTone;
}> = [
  { key: "success2xx", group: "2xx", tone: "ok" },
  { key: "redirect3xx", group: "3xx", tone: "info" },
  { key: "client4xx", group: "4xx", tone: "warn" },
  { key: "server5xx", group: "5xx", tone: "error" },
];

const AXIS_TICK = {
  fontSize: 10,
  fontFamily: "var(--font-mono)",
  fill: "var(--graphite)",
};

export function HttpStatusDistribution({ buckets }: HttpStatusDistributionProps) {
  if (buckets.length === 0) {
    return (
      <EmptyState
        title="No status distribution yet"
        description="Studio needs at least one complete HTTP request to chart response code groups over time."
        size="compact"
        icon={<ChartColumn />}
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

  const totals = SERIES.map((series) => ({
    ...series,
    count: buckets.reduce((sum, bucket) => sum + (bucket.counts[series.group] ?? 0), 0),
  }));

  return (
    <Card className="min-w-0 gap-0 py-0">
      <PanelHeader
        className="py-3 [.border-b]:pb-3"
        title="Status code distribution"
        description="Request volume by status code group across the current HTTP scope."
        action={
          <ul
            aria-label="Status code totals"
            className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[0.68rem] tabular-nums text-muted-foreground"
          >
            {totals.map((item) => (
              <li key={item.key} className="inline-flex items-center gap-1.5">
                <StatusDot tone={item.tone} />
                <span>{item.group}</span>
                <span className="text-foreground">{item.count.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        }
      />
      <CardContent className="px-2 pt-3 pb-2">
        <ChartContainer config={chartConfig} className="h-56 w-full">
          <BarChart data={data} margin={{ left: 0, right: 8, top: 4, bottom: 0 }} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke="var(--rule)" strokeDasharray="2 4" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: "var(--rule)" }}
              tick={AXIS_TICK}
              tickMargin={8}
              minTickGap={24}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              tick={AXIS_TICK}
              width={36}
            />
            <ChartTooltip
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
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
            {SERIES.map((series) => (
              <Bar
                key={series.key}
                dataKey={series.key}
                stackId="status"
                fill={`var(--color-${series.key})`}
                fillOpacity={0.85}
                maxBarSize={28}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
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
