import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { StudioDatabaseTransactionSummary } from "@/lib/studio";
import { formatDurationMs, formatRelativeTime } from "@/lib/studio";

import { EmptyState } from "./empty-state";
import { PanelHeader } from "./panel-header";

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
      />
    );
  }

  return (
    <Card>
      <PanelHeader
        title="Transactions"
        description="Grouped by transaction id when present."
      />
      <CardContent className="space-y-3">
        {transactions.map((transaction) => (
          <div key={transaction.id} className="rounded-lg border border-border/60 bg-background/40 p-3">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{transaction.id}</span>
                <Badge variant={getTransactionVariant(transaction.result)}>
                  {getTransactionLabel(transaction.result)}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span>Started {formatRelativeTime(transaction.timestampStart)}</span>
                <span>Duration {formatDurationMs(transaction.durationMs)}</span>
                <span>{transaction.queries.length} queries</span>
                {transaction.requestId ? <span>Request {transaction.requestId}</span> : null}
                {transaction.traceId ? <span>Trace {transaction.traceId}</span> : null}
              </div>
              {transaction.queries.length > 0 ? (
                <div className="space-y-2 pt-1">
                  {transaction.queries.map((query) => (
                    <div key={query.id} className="flex items-center justify-between gap-3 rounded-md border border-border/50 px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {query.operation} {query.modelOrTable ? `- ${query.modelOrTable}` : ""}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDurationMs(query.durationMs)}
                        </div>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => onSelectRecord(query.recordId)}>
                        Select
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function getTransactionVariant(result: StudioDatabaseTransactionSummary["result"]) {
  switch (result) {
    case "rolled_back":
      return "destructive" as const;
    case "open":
      return "secondary" as const;
    default:
      return "outline" as const;
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
