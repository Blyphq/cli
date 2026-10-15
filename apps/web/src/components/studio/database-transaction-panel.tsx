import { ArrowRightLeft } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { StudioDatabaseTransactionSummary } from "@/lib/studio";
import {
  formatDateTime,
  formatDurationMs,
  formatRelativeTime,
  getDurationClasses,
} from "@/lib/studio";
import { cn } from "@/lib/utils";

import { EmptyState } from "./empty-state";
import { PanelHeader } from "./panel-header";
import { MonoChip, StatusDot, type StudioTone } from "./studio-primitives";

interface DatabaseTransactionPanelProps {
  transactions: StudioDatabaseTransactionSummary[];
  onSelectRecord(recordId: string): void;
}

export function DatabaseTransactionPanel({
  transactions,
  onSelectRecord,
}: DatabaseTransactionPanelProps) {
  if (transactions.length === 0) {
    return (
      <EmptyState
        title="No transactions detected"
        description="Transaction groups appear when records include a transaction id."
        size="compact"
        icon={<ArrowRightLeft />}
      />
    );
  }

  return (
    <Card className="min-w-0 gap-0 py-0">
      <PanelHeader
        className="py-3 [.border-b]:pb-3"
        title="Transactions"
        description="Grouped by transaction id when present."
      />
      <ol className="divide-y divide-border/70">
        {transactions.map((transaction) => (
          <li key={transaction.id} className="flex min-w-0 flex-col gap-2 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <StatusDot
                tone={getTransactionTone(transaction.result)}
                live={transaction.result === "open"}
              />
              <span className="min-w-0 truncate font-mono text-[0.75rem] font-medium text-foreground" title={transaction.id}>
                {transaction.id}
              </span>
              <Badge variant={getTransactionVariant(transaction.result)} className="ml-auto">
                {getTransactionLabel(transaction.result)}
              </Badge>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 pl-3.5 font-mono text-[0.7rem] tabular-nums text-muted-foreground">
              <span title={formatDateTime(transaction.timestampStart)}>
                {formatRelativeTime(transaction.timestampStart)}
              </span>
              <span className={getDurationClasses(transaction.durationMs)}>
                {formatDurationMs(transaction.durationMs)}
              </span>
              <span>
                {transaction.queries.length} {transaction.queries.length === 1 ? "query" : "queries"}
              </span>
              {transaction.requestId ? (
                <MonoChip title={`Request ${transaction.requestId}`}>req {transaction.requestId}</MonoChip>
              ) : null}
              {transaction.traceId ? (
                <MonoChip title={`Trace ${transaction.traceId}`}>trace {transaction.traceId}</MonoChip>
              ) : null}
            </div>
            {transaction.queries.length > 0 ? (
              <ol className="ml-[3px] flex flex-col border-l border-border pl-3">
                {transaction.queries.map((query) => (
                  <li
                    key={query.id}
                    className="group/query relative flex min-w-0 items-center gap-3 rounded-md py-1 pr-1 pl-2 transition-colors duration-150 hover:bg-muted/60"
                  >
                    <span
                      aria-hidden
                      className="absolute top-1/2 -left-[15px] size-[5px] -translate-y-1/2 rounded-full border border-border-strong bg-card"
                    />
                    <span className="min-w-0 flex-1 truncate font-mono text-[0.72rem]">
                      <span className="font-medium text-foreground">{query.operation}</span>
                      {query.modelOrTable ? (
                        <span className="text-muted-foreground"> {query.modelOrTable}</span>
                      ) : null}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 font-mono text-[0.72rem] tabular-nums",
                        getDurationClasses(query.durationMs),
                      )}
                    >
                      {formatDurationMs(query.durationMs)}
                    </span>
                    <Button
                      variant="ghost"
                      size="xs"
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                      onClick={() => onSelectRecord(query.recordId)}
                    >
                      Select
                    </Button>
                  </li>
                ))}
              </ol>
            ) : null}
          </li>
        ))}
      </ol>
    </Card>
  );
}

function getTransactionTone(result: StudioDatabaseTransactionSummary["result"]): StudioTone {
  switch (result) {
    case "rolled_back":
      return "error";
    case "open":
      return "info";
    default:
      return "ok";
  }
}

function getTransactionVariant(result: StudioDatabaseTransactionSummary["result"]) {
  switch (result) {
    case "rolled_back":
      return "destructive" as const;
    case "open":
      return "info" as const;
    default:
      return "success" as const;
  }
}

function getTransactionLabel(result: StudioDatabaseTransactionSummary["result"]): string {
  switch (result) {
    case "rolled_back":
      return "Rolled back";
    case "open":
      return "Open";
    default:
      return "Committed";
  }
}
