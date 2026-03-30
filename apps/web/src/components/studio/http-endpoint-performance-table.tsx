import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { KeyboardEvent } from "react";
import type { StudioHttpEndpointPerformanceRow } from "@/lib/studio";
import {
  formatCompactDateTime,
  formatDurationMs,
  formatPercent,
  getHttpPerformanceRowClasses,
} from "@/lib/studio";
import { cn } from "@/lib/utils";

import { EmptyState } from "./empty-state";
import { PanelHeader } from "./panel-header";

interface HttpEndpointPerformanceTableProps {
  rows: StudioHttpEndpointPerformanceRow[];
  onSelectRoute(route: string): void;
}

export function HttpEndpointPerformanceTable({
  rows,
  onSelectRoute,
}: HttpEndpointPerformanceTableProps) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No endpoint performance yet"
        description="Studio hasn't observed any complete HTTP requests in the current scope."
        size="compact"
      />
    );
  }

  return (
    <div className="space-y-3">
      <PanelHeader
        title="Endpoint performance"
        description="Aggregated route performance sorted by p95 response time."
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Route</TableHead>
            <TableHead>Requests</TableHead>
            <TableHead>p50</TableHead>
            <TableHead>p95</TableHead>
            <TableHead>Error rate</TableHead>
            <TableHead>Last seen</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.route}
              className={cn("cursor-pointer", getHttpPerformanceRowClasses(row.highlight))}
              role="button"
              tabIndex={0}
              aria-label={`Filter route ${row.route}`}
              onClick={() => onSelectRoute(row.route)}
              onKeyDown={(event) => handleRowKeyDown(event, row.route, onSelectRoute)}
            >
              <TableCell className="font-medium whitespace-normal">{row.route}</TableCell>
              <TableCell>{row.requests}</TableCell>
              <TableCell>{formatDurationMs(row.p50DurationMs)}</TableCell>
              <TableCell>{formatDurationMs(row.p95DurationMs)}</TableCell>
              <TableCell>{formatPercent(row.errorRate)}</TableCell>
              <TableCell>{formatCompactDateTime(row.lastSeenAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function handleRowKeyDown(
  event: KeyboardEvent<HTMLTableRowElement>,
  route: string,
  onSelectRoute: (route: string) => void,
) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onSelectRoute(route);
  }
}
