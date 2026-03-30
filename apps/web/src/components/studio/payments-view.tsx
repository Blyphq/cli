import { useEffect, useMemo, useState } from "react";

import type { StudioPaymentTrace, StudioPaymentTraceDetail, StudioPaymentsOverview } from "@/lib/studio";

import { EmptyState } from "./empty-state";
import { PaymentFailureBreakdownTable } from "./payment-failure-breakdown-table";
import { PaymentTraceList } from "./payment-trace-list";
import { PaymentsStatsBar } from "./payments-stats-bar";
import { PaymentWebhookPanel } from "./payment-webhook-panel";

interface PaymentsViewProps {
  page: StudioPaymentsOverview | undefined;
  loading: boolean;
  selectedTraceId: string | null;
  expandedTraceId: string | null;
  expandedTraceDetail: StudioPaymentTraceDetail | null | undefined;
  expandedTraceLoading: boolean;
  onSelectTrace(traceId: string): void;
  onToggleExpand(traceId: string): void;
  onAskAi(trace: StudioPaymentTrace): void;
}

export function PaymentsView({
  page,
  loading,
  selectedTraceId,
  expandedTraceId,
  expandedTraceDetail,
  expandedTraceLoading,
  onSelectTrace,
  onToggleExpand,
  onAskAi,
}: PaymentsViewProps) {
  const [tracePage, setTracePage] = useState(1);
  const [webhookPage, setWebhookPage] = useState(1);
  const pageSize = 5;

  const traces = page?.traces ?? [];
  const webhooks = page?.webhooks ?? [];
  const traceTotalPages = Math.max(1, Math.ceil(traces.length / pageSize));
  const webhookTotalPages = Math.max(1, Math.ceil(webhooks.length / pageSize));
  const pagedTraces = useMemo(
    () => traces.slice((tracePage - 1) * pageSize, tracePage * pageSize),
    [tracePage, traces],
  );
  const pagedWebhooks = useMemo(
    () => webhooks.slice((webhookPage - 1) * pageSize, webhookPage * pageSize),
    [webhookPage, webhooks],
  );

  useEffect(() => {
    setTracePage((current) => Math.min(current, traceTotalPages));
  }, [traceTotalPages]);

  useEffect(() => {
    setWebhookPage((current) => Math.min(current, webhookTotalPages));
  }, [webhookTotalPages]);

  if (!page && loading) {
    return (
      <EmptyState
        title="Loading payments"
        description="Assembling payment activity into correlated checkout traces."
      />
    );
  }

  if (!page) {
    return (
      <EmptyState
        title="Payments unavailable"
        description="Studio could not load payment activity for the current scope."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PaymentsStatsBar stats={page.stats} />
      <PaymentTraceList
        traces={pagedTraces}
        selectedTraceId={selectedTraceId}
        expandedTraceId={expandedTraceId}
        expandedTraceDetail={expandedTraceDetail}
        expandedTraceLoading={expandedTraceLoading}
        currentPage={tracePage}
        totalPages={traceTotalPages}
        onSelect={onSelectTrace}
        onToggleExpand={onToggleExpand}
        onAskAi={onAskAi}
        onPageChange={setTracePage}
      />
      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <PaymentFailureBreakdownTable rows={page.failures} />
        </div>
        <div className="min-w-0">
          <PaymentWebhookPanel
            events={pagedWebhooks}
            currentPage={webhookPage}
            totalPages={webhookTotalPages}
            onPageChange={setWebhookPage}
          />
        </div>
      </div>
    </div>
  );
}
