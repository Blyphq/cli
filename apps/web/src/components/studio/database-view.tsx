import type { StudioDatabaseOverview, StudioDatabaseQueryEvent } from "@/lib/studio";

import { DatabaseMigrationPanel } from "./database-migration-panel";
import { DatabaseQueryTable } from "./database-query-table";
import { DatabaseSlowQueryPanel } from "./database-slow-query-panel";
import { DatabaseStatsBar } from "./database-stats-bar";
import { DatabaseTransactionPanel } from "./database-transaction-panel";

interface DatabaseViewProps {
  database: StudioDatabaseOverview | undefined;
  loading: boolean;
  selectedRecordId: string | null;
  onSelectRecord(recordId: string): void;
  onAskAi(query: StudioDatabaseQueryEvent): void;
}

export function DatabaseView({
  database,
  loading,
  selectedRecordId,
  onSelectRecord,
  onAskAi,
}: DatabaseViewProps) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <DatabaseStatsBar
        stats={
          database?.stats ?? {
            totalQueries: 0,
            slowQueries: 0,
            failedQueries: 0,
            avgQueryTimeMs: null,
            activeTransactions: 0,
          }
        }
      />
      <DatabaseQueryTable
        queries={database?.queries ?? []}
        selectedRecordId={selectedRecordId}
        totalQueries={database?.totalQueries ?? 0}
        loading={loading}
        onSelectRecord={onSelectRecord}
      />
      <DatabaseSlowQueryPanel
        queries={database?.slowQueries ?? []}
        onSelectRecord={onSelectRecord}
        onAskAi={onAskAi}
      />
      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-2">
        <DatabaseTransactionPanel
          transactions={database?.transactions ?? []}
          onSelectRecord={onSelectRecord}
        />
        <DatabaseMigrationPanel
          migrations={database?.migrationEvents ?? []}
          onSelectRecord={onSelectRecord}
        />
      </div>
    </div>
  );
}
