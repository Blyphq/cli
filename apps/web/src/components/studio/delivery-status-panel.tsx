import { useMemo, useState } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, RotateCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { StudioDeliveryStatus } from "@/lib/studio";
import {
  formatCompactDateTime,
  formatDateTime,
  getDeliveryHealthClasses,
  getDeliveryHealthLabel,
} from "@/lib/studio";
import { useTRPC } from "@/utils/trpc";

import { EmptyState } from "./empty-state";
import { PanelHeader } from "./panel-header";

interface DeliveryStatusPanelProps {
  deliveryStatus: StudioDeliveryStatus | undefined;
  loading: boolean;
  activeConnectorKey?: string;
}

export function DeliveryStatusPanel({
  deliveryStatus,
  loading,
  activeConnectorKey,
}: DeliveryStatusPanelProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [clearOpen, setClearOpen] = useState(false);

  const visibleRows = useMemo(() => {
    const rows = deliveryStatus?.deadLetters.items ?? [];
    if (!activeConnectorKey) {
      return rows;
    }
    return rows.filter((row) => row.connectorKey === activeConnectorKey);
  }, [activeConnectorKey, deliveryStatus?.deadLetters.items]);

  const visibleConnectors = useMemo(() => {
    const connectors = deliveryStatus?.connectors ?? [];
    if (!activeConnectorKey) {
      return connectors;
    }
    return connectors.filter((connector) => connector.key === activeConnectorKey);
  }, [activeConnectorKey, deliveryStatus?.connectors]);

  const selectedVisibleIds = visibleRows
    .map((row) => row.id)
    .filter((id) => selectedIds.includes(id));

  const invalidateDelivery = async () => {
    await queryClient.invalidateQueries();
  };

  const retryMutation = useMutation({
    ...trpc.studio.retryDeadLetters.mutationOptions({
      onSuccess: async (result) => {
        setSelectedIds([]);
        await invalidateDelivery();
        toast.success(`Requeued ${result.retriedCount} dead-letter event${result.retriedCount === 1 ? "" : "s"}.`);
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  });

  const clearMutation = useMutation({
    ...trpc.studio.clearDeadLetters.mutationOptions({
      onSuccess: async (result) => {
        setSelectedIds([]);
        setClearOpen(false);
        await invalidateDelivery();
        toast.success(`Cleared ${result.clearedCount} dead-letter event${result.clearedCount === 1 ? "" : "s"}.`);
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  });

  if (loading && !deliveryStatus) {
    return (
      <EmptyState
        title="Loading delivery status"
        description="Reading connector health and dead-lettered events."
      />
    );
  }

  if (!deliveryStatus) {
    return null;
  }

  if (!deliveryStatus.available) {
    return (
      <EmptyState
        title="Delivery status unavailable"
        description={`Queue path: ${deliveryStatus.queuePath}`}
      />
    );
  }

  const allVisibleSelected =
    visibleRows.length > 0 && visibleRows.every((row) => selectedIds.includes(row.id));

  return (
    <>
      <Card>
        <PanelHeader
          title="Delivery status"
          description={`Queue path: ${deliveryStatus.queuePath}`}
          action={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={selectedVisibleIds.length === 0 || retryMutation.isPending}
                onClick={() => retryMutation.mutate({ ids: selectedVisibleIds })}
              >
                <RotateCw />
                Retry selected
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={selectedVisibleIds.length === 0 || clearMutation.isPending}
                onClick={() => setClearOpen(true)}
              >
                <Trash2 />
                Clear selected
              </Button>
            </div>
          }
        />
        <CardContent className="space-y-6">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visibleConnectors.map((connector) => (
              <div
                key={connector.key}
                className="space-y-2 border border-border/60 bg-muted/20 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium">{connector.label}</div>
                  <Badge className={getDeliveryHealthClasses(connector.health)}>
                    {getDeliveryHealthLabel(connector.health)}
                  </Badge>
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div>Pending queue depth: {connector.pendingCount}</div>
                  <div>Dead-lettered: {connector.deadLetterCount}</div>
                  <div>Last success: {formatCompactDateTime(connector.lastSuccessAt)}</div>
                  <div>Last failure: {formatCompactDateTime(connector.lastFailureAt)}</div>
                  <div className="break-words">
                    Last error: {connector.lastError ?? "None"}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {visibleRows.length === 0 ? (
            <EmptyState
              title="No dead-lettered events"
              description="Connector retries are currently healthy."
              size="compact"
            />
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Dead-lettered events
                </div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox
                    checked={allVisibleSelected}
                    onCheckedChange={(checked) => {
                      setSelectedIds(checked ? visibleRows.map((row) => row.id) : []);
                    }}
                  />
                  Select all visible
                </label>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Connector</TableHead>
                    <TableHead>Payload preview</TableHead>
                    <TableHead>Last error</TableHead>
                    <TableHead>Attempts</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.includes(row.id)}
                          onCheckedChange={(checked) => {
                            setSelectedIds((current) =>
                              checked
                                ? [...current, row.id]
                                : current.filter((candidate) => candidate !== row.id),
                            );
                          }}
                        />
                      </TableCell>
                      <TableCell title={formatDateTime(row.timestamp)}>
                        {formatCompactDateTime(row.timestamp)}
                      </TableCell>
                      <TableCell>{row.connectorLabel}</TableCell>
                      <TableCell className="max-w-[22rem] whitespace-normal break-words">
                        {row.payloadPreview}
                      </TableCell>
                      <TableCell className="max-w-[20rem] whitespace-normal break-words text-destructive">
                        {row.lastError ?? "Unknown error"}
                      </TableCell>
                      <TableCell>
                        {row.attemptCount}/{row.maxAttempts}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={clearOpen} onOpenChange={setClearOpen}>
        <DialogContent className="max-w-md p-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-destructive" />
              <DialogTitle>Clear dead-lettered events?</DialogTitle>
            </div>
            <DialogDescription>
              This permanently removes the selected dead-lettered connector deliveries from Studio. The underlying log events are not retried.
            </DialogDescription>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setClearOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => clearMutation.mutate({ ids: selectedVisibleIds })}
              >
                Clear selected
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
