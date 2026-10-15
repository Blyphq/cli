import { Receipt } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import type { StudioPaymentTrace, StudioPaymentTraceDetail } from "@/lib/studio";
import { cn } from "@/lib/utils";

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
  const problemCount = traces.filter(
    (trace) => trace.status === "DECLINED" || trace.status === "ERROR",
  ).length;

  return (
    <Card className="gap-0 py-0">
      <PanelHeader
        className="py-3"
        title="Checkout traces"
        description="Correlated payment lifecycle traces assembled from checkout, payment, order, and webhook signals."
        action={
          problemCount > 0 ? (
            <Badge variant="destructive">
              {problemCount} {problemCount === 1 ? "problem" : "problems"}
            </Badge>
          ) : null
        }
      />
      {traces.length === 0 ? (
        <div className="p-3">
          <EmptyState
            title="No payment activity matched this scope"
            description="Try a different file, date range, or search term."
            size="compact"
            icon={<Receipt />}
          />
        </div>
      ) : (
        <>
          <div
            aria-hidden
            className="hidden h-8 items-center gap-3 border-b border-border bg-muted/40 px-4 text-[0.7rem] font-medium text-muted-foreground md:grid md:grid-cols-[minmax(0,1fr)_7rem_6rem_4.5rem_11rem]"
          >
            <span>Trace</span>
            <span className="text-right">Amount</span>
            <span className="text-center">Status</span>
            <span className="text-right">Duration</span>
            <span />
          </div>
          <ul>
            {traces.map((trace) => (
              <PaymentTraceCard
                key={trace.id}
                trace={trace}
                selected={selectedTraceId === trace.id}
                expanded={expandedTraceId === trace.id}
                detail={expandedTraceId === trace.id ? expandedTraceDetail : null}
                detailLoading={expandedTraceId === trace.id && expandedTraceLoading}
                onSelect={() => onSelect(trace.id)}
                onToggleExpand={() => onToggleExpand(trace.id)}
                onAskAi={() => onAskAi(trace)}
              />
            ))}
          </ul>
          <StudioPagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={onPageChange}
          />
        </>
      )}
    </Card>
  );
}

/**
 * Compact, windowed pagination footer shared by the payment panels. Renders
 * nothing when there is only a single page.
 */
export function StudioPagination({
  currentPage,
  totalPages,
  onPageChange,
  className,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange(page: number): void;
  className?: string;
}) {
  if (totalPages <= 1) {
    return null;
  }

  const pages = buildVisiblePages(currentPage, totalPages);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2",
        className,
      )}
    >
      <span className="font-mono text-[0.7rem] tabular-nums text-muted-foreground">
        Page {currentPage} of {totalPages}
      </span>
      <Pagination className="mx-0 w-auto justify-end">
        <PaginationContent className="gap-0.5">
          <PaginationItem>
            <PaginationPrevious
              size="xs"
              className="text-[0.72rem]"
              disabled={currentPage === 1}
              onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            />
          </PaginationItem>
          {pages.map((page, index) =>
            page === "ellipsis" ? (
              <PaginationItem key={`ellipsis-${index}`}>
                <PaginationEllipsis className="size-6 text-muted-foreground [&>svg]:size-3.5" />
              </PaginationItem>
            ) : (
              <PaginationItem key={page}>
                <PaginationLink
                  size="icon-xs"
                  isActive={page === currentPage}
                  className={cn(
                    "font-mono text-[0.7rem] tabular-nums",
                    page === currentPage
                      ? "border-primary/40 bg-primary-soft/60 text-primary-soft-foreground hover:bg-primary-soft"
                      : "text-muted-foreground",
                  )}
                  onClick={() => onPageChange(page)}
                >
                  {page}
                </PaginationLink>
              </PaginationItem>
            ),
          )}
          <PaginationItem>
            <PaginationNext
              size="xs"
              className="text-[0.72rem]"
              disabled={currentPage === totalPages}
              onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
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
