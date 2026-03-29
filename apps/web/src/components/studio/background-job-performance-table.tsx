import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { StudioBackgroundJobPerformanceRow } from "@/lib/studio";
import {
  formatCompactDateTime,
  formatDuration,
  formatPercent,
  getBackgroundJobTrendLabel,
} from "@/lib/studio";

import { EmptyState } from "./empty-state";
import { PanelHeader } from "./panel-header";

interface BackgroundJobPerformanceTableProps {
  rows: StudioBackgroundJobPerformanceRow[];
}

export function BackgroundJobPerformanceTable({
  rows,
}: BackgroundJobPerformanceTableProps) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No job performance yet"
        description="Studio hasn't observed enough background job activity to compute aggregates."
        size="compact"
      />
    );
  }

  return (
    <div className="space-y-3">
      <PanelHeader
        title="Job performance"
        description="Aggregated success rates and duration trends by job type."
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Job</TableHead>
            <TableHead>Total runs</TableHead>
            <TableHead>Success rate</TableHead>
            <TableHead>Avg duration</TableHead>
            <TableHead>P95 duration</TableHead>
            <TableHead>Last run</TableHead>
            <TableHead>Trend</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.jobName}>
              <TableCell className="font-medium whitespace-normal">{row.jobName}</TableCell>
              <TableCell>{row.totalRuns}</TableCell>
              <TableCell>{formatPercent(row.successRate)}</TableCell>
              <TableCell>{formatDuration(row.avgDurationMs)}</TableCell>
              <TableCell>{formatDuration(row.p95DurationMs)}</TableCell>
              <TableCell>{formatCompactDateTime(row.lastRunTimestamp)}</TableCell>
              <TableCell>{getBackgroundJobTrendLabel(row.trend)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
