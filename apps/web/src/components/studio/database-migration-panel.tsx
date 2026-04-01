import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { StudioDatabaseMigrationEvent } from "@/lib/studio";
import { formatDurationMs, formatRelativeTime } from "@/lib/studio";
import { cn } from "@/lib/utils";

import { EmptyState } from "./empty-state";
import { PanelHeader } from "./panel-header";

interface DatabaseMigrationPanelProps {
  migrations: StudioDatabaseMigrationEvent[];
  onSelectRecord(recordId: string): void;
}

export function DatabaseMigrationPanel({
  migrations,
  onSelectRecord,
}: DatabaseMigrationPanelProps) {
  if (migrations.length === 0) {
    return (
      <EmptyState
        title="No migrations detected"
        description="Migration runs will show up here when matching events are present."
        size="compact"
      />
    );
  }

  return (
    <Card>
      <PanelHeader
        title="Migration events"
        description="High-signal schema changes and migration runs."
      />
      <CardContent className="space-y-3">
        {migrations.map((migration) => (
          <div
            key={migration.id}
            className={cn(
              "rounded-lg border p-3",
              migration.success
                ? "border-primary/30 bg-primary/5"
                : "border-destructive/40 bg-destructive/5",
            )}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">
                    {migration.name ?? migration.version ?? "Migration"}
                  </span>
                  <Badge variant={migration.success ? "outline" : "destructive"}>
                    {migration.success ? "Success" : "Failure"}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {migration.version ? <span>Version {migration.version}</span> : null}
                  <span>{formatRelativeTime(migration.timestamp)}</span>
                  <span>{formatDurationMs(migration.durationMs)}</span>
                </div>
                {migration.errorMessage ? (
                  <div className="text-xs text-destructive">{migration.errorMessage}</div>
                ) : null}
              </div>
              <Button variant="outline" size="sm" onClick={() => onSelectRecord(migration.recordId)}>
                Select record
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
