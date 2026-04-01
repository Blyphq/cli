import { useState } from "react";

import type { StudioPaymentWebhookEvent } from "@/lib/studio";
import { formatCompactDateTime } from "@/lib/studio";

import { Badge } from "../ui/badge";
import { Card, CardContent } from "../ui/card";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "../ui/pagination";
import { PanelHeader } from "./panel-header";

interface PaymentWebhookPanelProps {
  events: StudioPaymentWebhookEvent[];
  currentPage: number;
  totalPages: number;
  onPageChange(page: number): void;
}

export function PaymentWebhookPanel({
  events,
  currentPage,
  totalPages,
  onPageChange,
}: PaymentWebhookPanelProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const pages = getVisiblePages(currentPage, totalPages);

  return (
    <Card size="sm">
      <PanelHeader
        title="Webhook events"
        description="Incoming payment webhook traffic and processing results."
      />
      <CardContent className="space-y-3">
        {events.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No payment webhook events matched this scope.
          </div>
        ) : (
          <>
            {events.map((event) => (
              <button
                key={event.id}
                type="button"
                className="w-full border border-border/60 bg-background/40 p-4 text-left"
                onClick={() => setOpenId((current) => (current === event.id ? null : event.id))}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-medium">{event.eventType ?? "webhook"}</span>
                  <Badge variant={event.result === "error" ? "destructive" : "default"}>
                    {event.result}
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {formatCompactDateTime(event.timestamp)}
                  {event.route ? ` • ${event.route}` : ""}
                </div>
                {openId === event.id && event.payloadPreview ? (
                  <pre className="mt-3 overflow-auto whitespace-pre-wrap break-words rounded border border-border/60 bg-muted/20 p-3 font-mono text-[11px] leading-5">
                    {event.payloadPreview}
                  </pre>
                ) : null}
              </button>
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
      </CardContent>
    </Card>
  );
}

function getVisiblePages(currentPage: number, totalPages: number): Array<number | "ellipsis"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  const sortedPages = Array.from(pages)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((left, right) => left - right);
  const visiblePages: Array<number | "ellipsis"> = [];

  for (const page of sortedPages) {
    const previousPage = visiblePages[visiblePages.length - 1];
    if (typeof previousPage === "number" && page - previousPage > 1) {
      visiblePages.push("ellipsis");
    }
    visiblePages.push(page);
  }

  return visiblePages;
}
