import type { StudioHttpOverview, StudioHttpUiState } from "@/lib/studio";

import { EmptyState } from "./empty-state";
import { HttpEndpointPerformanceTable } from "./http-endpoint-performance-table";
import { HttpRequestTable } from "./http-request-table";
import { HttpStatsBar } from "./http-stats-bar";
import { HttpStatusDistribution } from "./http-status-distribution";
import { HttpToolbar } from "./http-toolbar";

interface HttpViewProps {
  page: StudioHttpOverview | undefined;
  loading: boolean;
  selectedRecordId: string | null;
  httpUi: StudioHttpUiState;
  onHttpUiChange(next: StudioHttpUiState | ((current: StudioHttpUiState) => StudioHttpUiState)): void;
  onResetHttpFilters(): void;
  onSelectRecord(recordId: string): void;
  onPageChange(nextOffset: number): void;
  onSelectRoute(route: string): void;
  onViewTrace(traceGroupId: string): void;
}

export function HttpView({
  page,
  loading,
  selectedRecordId,
  httpUi,
  onHttpUiChange,
  onResetHttpFilters,
  onSelectRecord,
  onPageChange,
  onSelectRoute,
  onViewTrace,
}: HttpViewProps) {
  if (!page && loading) {
    return (
      <EmptyState
        title="Loading HTTP activity"
        description="Aggregating request volume, latency, and error signals."
      />
    );
  }

  return (
    <div className="space-y-4">
      <HttpStatsBar
        stats={
          page?.stats ?? {
            totalRequests: 0,
            errorRate: 0,
            p50DurationMs: null,
            p95DurationMs: null,
            requestsPerMinute: 0,
            statusGroups: { "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0 },
          }
        }
      />
      <HttpToolbar
        facets={page?.facets}
        httpUi={httpUi}
        onHttpUiChange={(next) =>
          onHttpUiChange(typeof next === "function" ? next(httpUi) : next)
        }
        onReset={onResetHttpFilters}
      />
      <HttpStatusDistribution buckets={page?.timeseries ?? []} />
      <HttpEndpointPerformanceTable
        rows={page?.performance ?? []}
        onSelectRoute={onSelectRoute}
      />
      <HttpRequestTable
        rows={page?.requests ?? []}
        selectedRecordId={selectedRecordId}
        totalRequests={page?.totalRequests ?? 0}
        offset={page?.offset ?? 0}
        limit={page?.limit ?? 100}
        loading={loading}
        onSelectRecord={onSelectRecord}
        onPageChange={onPageChange}
        onViewTrace={onViewTrace}
      />
    </div>
  );
}
