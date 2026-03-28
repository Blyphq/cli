import { AlertCircle, RotateCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { StudioDeliveryStatus } from "@/lib/studio";
import {
  formatCompactDateTime,
  getDeliveryHealthClasses,
  getDeliveryHealthLabel,
} from "@/lib/studio";

import { EmptyState } from "./empty-state";
import { PanelHeader } from "./panel-header";

interface DeliveryStatusSidebarCardProps {
  deliveryStatus: StudioDeliveryStatus | undefined;
  loading: boolean;
  onOpen(connectorKey?: string): void;
}

export function DeliveryStatusSidebarCard({
  deliveryStatus,
  loading,
  onOpen,
}: DeliveryStatusSidebarCardProps) {
  if (loading && !deliveryStatus) {
    return (
      <EmptyState
        title="Loading delivery status"
        description="Reading connector queue health from the local Blyp queue."
        size="compact"
      />
    );
  }

  if (!deliveryStatus) {
    return null;
  }

  if (!deliveryStatus.available) {
    return (
      <EmptyState
        title="Delivery status"
        description={getUnavailableDescription(deliveryStatus.unavailableReason)}
        size="compact"
      />
    );
  }

  return (
    <Card>
      <PanelHeader
        title="Delivery status"
        description="Connector health, pending retries, and dead-letter signals."
      />
      <CardContent className="space-y-2">
        {deliveryStatus.connectors.map((connector) => (
          <Button
            key={connector.key}
            variant="outline"
            className="h-auto w-full justify-start px-3 py-3 text-left"
            onClick={() => onOpen(connector.key)}
          >
            <div className="min-w-0 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="truncate text-sm font-medium">{connector.label}</div>
                <Badge className={getDeliveryHealthClasses(connector.health)}>
                  {getDeliveryHealthLabel(connector.health)}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {connector.pendingCount > 0 ? (
                  <span className="inline-flex items-center gap-1">
                    <RotateCw className="size-3" />
                    {connector.pendingCount} pending
                  </span>
                ) : null}
                {connector.deadLetterCount > 0 ? (
                  <span className="inline-flex items-center gap-1 text-destructive">
                    <AlertCircle className="size-3" />
                    {connector.deadLetterCount} dead-lettered
                  </span>
                ) : null}
                {connector.pendingCount === 0 && connector.deadLetterCount === 0 ? (
                  <span>Last success {formatCompactDateTime(connector.lastSuccessAt)}</span>
                ) : null}
              </div>
            </div>
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}

function getUnavailableDescription(
  reason: StudioDeliveryStatus["unavailableReason"],
): string {
  switch (reason) {
    case "queue_missing":
      return "No delivery queue found at ~/.blyp/queue.db.";
    case "sqlite_unavailable":
      return "Studio could not open the local delivery queue database.";
    case "delivery_disabled":
      return "Connector delivery queue is not enabled for this project.";
    default:
      return "Delivery status is unavailable.";
  }
}
