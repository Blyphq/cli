import { useState } from "react";

import { ChevronRight, Webhook } from "lucide-react";

import type { StudioPaymentWebhookEvent } from "@/lib/studio";
import { formatCompactDateTime } from "@/lib/studio";
import { cn } from "@/lib/utils";

import { Badge } from "../ui/badge";
import { Card } from "../ui/card";
import { EmptyState } from "./empty-state";
import { highlightJson } from "./json-detail-block";
import { PanelHeader } from "./panel-header";
import { StudioPagination } from "./payment-trace-list";

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
  const errorCount = events.filter((event) => event.result === "error").length;

  return (
    <Card className="gap-0 py-0">
      <PanelHeader
        className="py-3"
        title="Webhook events"
        description="Incoming payment webhook traffic and processing results."
        action={
          errorCount > 0 ? (
            <Badge variant="destructive">{errorCount} failed</Badge>
          ) : null
        }
      />
      {events.length === 0 ? (
        <div className="p-3">
          <EmptyState
            title="No webhooks"
            description="No payment webhook events matched this scope."
            size="compact"
            icon={<Webhook />}
          />
        </div>
      ) : (
        <>
          <ul className="font-mono text-[0.74rem]">
            {events.map((event) => {
              const open = openId === event.id;
              const hasPayload = Boolean(event.payloadPreview);

              const rowClass = cn(
                "grid w-full min-w-0 grid-cols-[0.75rem_4rem_minmax(0,1fr)_auto] items-center gap-x-2.5 px-3 py-2 text-left",
                open && "bg-muted/50",
              );
              const rowContent = (
                <>
                  <ChevronRight
                    aria-hidden
                    className={cn(
                      "size-3 text-muted-foreground/70 transition-transform duration-200 ease-out-expo",
                      open && "rotate-90",
                      !hasPayload && "opacity-0",
                    )}
                  />
                  <Badge
                    variant={event.result === "error" ? "destructive" : "success"}
                    className="w-full"
                  >
                    {event.result}
                  </Badge>
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate text-foreground">{event.eventType ?? "webhook"}</span>
                    {event.route ? (
                      <span className="hidden truncate text-[0.68rem] text-muted-foreground sm:inline">
                        {event.route}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-[0.68rem] tabular-nums text-muted-foreground/80">
                    {formatCompactDateTime(event.timestamp)}
                  </span>
                </>
              );

              return (
                <li key={event.id} className="border-b border-border/70 last:border-0">
                  {hasPayload ? (
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => setOpenId((current) => (current === event.id ? null : event.id))}
                      className={cn(
                        rowClass,
                        "outline-none transition-colors duration-150 hover:bg-muted/60 focus-visible:bg-muted",
                      )}
                    >
                      {rowContent}
                    </button>
                  ) : (
                    <div className={rowClass}>{rowContent}</div>
                  )}
                  {open && event.payloadPreview ? (
                    <pre className="mx-3 mb-2.5 max-h-64 overflow-auto rounded-md bg-muted/50 p-3 text-[0.7rem] leading-5 break-words whitespace-pre-wrap">
                      {highlightJson(prettyPayload(event.payloadPreview))}
                    </pre>
                  ) : null}
                </li>
              );
            })}
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

function prettyPayload(preview: string): string {
  try {
    return JSON.stringify(JSON.parse(preview), null, 2);
  } catch {
    return preview;
  }
}
