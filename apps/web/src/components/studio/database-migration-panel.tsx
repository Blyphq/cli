import { GitCommitVertical } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { StudioDatabaseMigrationEvent } from "@/lib/studio";
import { formatDateTime, formatDurationMs, formatRelativeTime } from "@/lib/studio";
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
        icon={<GitCommitVertical />}
      />
    );
  }

  return (
    <Card className="min-w-0 gap-0 py-0">
      <PanelHeader
        className="py-3 [.border-b]:pb-3"
        title="Migration events"
        description="High-signal schema changes and migration runs."
      />
      <ol className="relative px-4 py-3">
        {migrations.map((migration, index) => {
          const isLast = index === migrations.length - 1;

          return (
            <li key={migration.id} className="relative flex min-w-0 gap-3 pb-4 last:pb-0">
              {!isLast ? (
                <span aria-hidden className="absolute top-4 bottom-0 left-[4px] w-px bg-border" />
              ) : null}
              <span
                aria-hidden
                className={cn(
                  "relative mt-1.5 size-[9px] shrink-0 rounded-full border-2 bg-card",
                  migration.success ? "border-level-ok" : "border-level-error",
                )}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span
                    className="min-w-0 truncate font-mono text-[0.75rem] font-medium text-foreground"
                    title={migration.name ?? migration.version ?? "Migration"}
                  >
                    {migration.name ?? migration.version ?? "Migration"}
                  </span>
                  <Badge variant={migration.success ? "success" : "destructive"}>
                    {migration.success ? "Success" : "Failure"}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="ml-auto text-muted-foreground hover:text-foreground"
                    onClick={() => onSelectRecord(migration.recordId)}
                  >
                    Select record
                  </Button>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[0.7rem] tabular-nums text-muted-foreground">
                  {migration.version && migration.version !== migration.name ? (
                    <span className="truncate" title={migration.version}>
                      v {migration.version}
                    </span>
                  ) : null}
                  <span className="text-muted-foreground/80" title={formatDateTime(migration.timestamp)}>
                    {formatRelativeTime(migration.timestamp)}
                  </span>
                  <span>{formatDurationMs(migration.durationMs)}</span>
                </div>
                {migration.errorMessage ? (
                  <div className="rounded-md border border-level-error/30 bg-level-error/[0.06] px-2.5 py-1.5 font-mono text-[0.7rem] leading-5 break-words text-level-error">
                    {migration.errorMessage}
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
