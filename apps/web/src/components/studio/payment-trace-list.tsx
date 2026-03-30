import type { StudioPaymentTrace, StudioPaymentTraceDetail } from "@/lib/studio";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

import { EmptyState } from "./empty-state";
import { PanelHeader } from "./panel-header";
import { PaymentTraceCard } from "./payment-trace-card";

interface PaymentTraceListProps {
  traces: StudioPaymentTrace[];
  selectedTraceId: string | null;
  expandedTraceId: string | null;
  expandedTraceDetail: StudioPaymentTraceDetail | null | undefined;
  expandedTraceLoading: boolean;
  currentPage: number;
  totalPages: number;
  onSelect(traceId: string): void;
  onToggleExpand(traceId: string): void;
  onAskAi(trace: StudioPaymentTrace): void;
  onPageChange(page: number): void;
}

export function PaymentTraceList({
  traces,
  selectedTraceId,
  expandedTraceId,
  expandedTraceDetail,
  expandedTraceLoading,
  currentPage,
  totalPages,
  onSelect,
  onToggleExpand,
  onAskAi,
  onPageChange,
}: PaymentTraceListProps) {
  const pages = buildVisiblePages(currentPage, totalPages);

  return (
    <div className="space-y-3">
      <PanelHeader
        title="Checkout traces"
        description="Correlated payment lifecycle traces assembled from checkout, payment, order, and webhook signals."
      />
      {traces.length === 0 ? (
        <EmptyState
          title="No payment activity matched this scope"
          description="Try a different file, date range, or search term."
          size="compact"
        />
      ) : (
        <>
          {traces.map((trace) => (
            <PaymentTraceCard
              key={trace.id}
              trace={trace}
              selected={selectedTraceId === trace.id}
              expanded={expandedTraceId === trace.id}
              detail={
                expandedTraceId === trace.id
                  ? expandedTraceDetail
                  : null
              }
              detailLoading={expandedTraceId === trace.id && expandedTraceLoading}
              onSelect={() => onSelect(trace.id)}
              onToggleExpand={() => onToggleExpand(trace.id)}
              onAskAi={() => onAskAi(trace)}
            />
          ))}
          {totalPages > 1 ? (
            <Pagination className="justify-start">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    disabled={currentPage === 1}
                    onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                  />
                </PaginationItem>
                {pages.map((page, index) =>
                  page === "ellipsis" ? (
                    <PaginationItem key={`ellipsis-${index}`}>
                      <PaginationEllipsis />
                    </PaginationItem>
                  ) : (
                    <PaginationItem key={page}>
                      <PaginationLink
                        isActive={page === currentPage}
                        onClick={() => onPageChange(page)}
                      >
                        {page}
                      </PaginationLink>
                    </PaginationItem>
                  ),
                )}
                <PaginationItem>
                  <PaginationNext
                    disabled={currentPage === totalPages}
                    onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          ) : null}
        </>
      )}
    </div>
  );
}

function buildVisiblePages(
  currentPage: number,
  totalPages: number,
): Array<number | "ellipsis"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const windowStart = Math.max(2, currentPage - 1);
  const windowEnd = Math.min(totalPages - 1, currentPage + 1);
  const pages: Array<number | "ellipsis"> = [1];

  if (windowStart > 2) {
    pages.push("ellipsis");
  }

  for (let page = windowStart; page <= windowEnd; page += 1) {
    pages.push(page);
  }

  if (windowEnd < totalPages - 1) {
    pages.push("ellipsis");
  }

  pages.push(totalPages);
  return pages;
}
