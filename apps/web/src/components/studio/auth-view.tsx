import type { StudioAuthOverview, StudioAuthSuspiciousPattern } from "@/lib/studio";
import { cn } from "@/lib/utils";

import { AuthStatsBar } from "./auth-stats-bar";
import { AuthSuspiciousPanel } from "./auth-suspicious-panel";
import { AuthTimeline } from "./auth-timeline";
import { AuthUserBreakdown } from "./auth-user-breakdown";

interface AuthViewProps {
  auth: StudioAuthOverview | undefined;
  loading: boolean;
  offset: number;
  limit: number;
  selectedRecordId: string | null;
  selectedUserId: string | null;
  selectedPatternId: string | null;
  onPageChange(nextOffset: number): void;
  onSelectRecord(recordId: string): void;
  onSelectUser(userId: string): void;
  onResetUser(): void;
  onSelectPattern(pattern: StudioAuthSuspiciousPattern): void;
}

export function AuthView({
  auth,
  loading,
  offset,
  limit,
  selectedRecordId,
  selectedUserId,
  selectedPatternId,
  onPageChange,
  onSelectRecord,
  onSelectUser,
  onResetUser,
  onSelectPattern,
}: AuthViewProps) {
  const highlightedRecordIds = new Set(
    auth?.suspiciousPatterns
      .find((pattern) => pattern.id === selectedPatternId)
      ?.recordIds ?? [],
  );

  const hasUsers = (auth?.users.length ?? 0) > 0;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <AuthStatsBar
        stats={
          auth?.stats ?? {
            loginAttemptsTotal: 0,
            loginSuccessCount: 0,
            loginFailureCount: 0,
            activeSessionCount: 0,
            authErrorCount: 0,
            suspiciousActivityCount: 0,
          }
        }
      />
      <AuthSuspiciousPanel
        patterns={auth?.suspiciousPatterns ?? []}
        selectedPatternId={selectedPatternId}
        onSelect={onSelectPattern}
      />
      <div
        className={cn(
          "grid min-w-0 items-start gap-5",
          hasUsers && "xl:grid-cols-[minmax(0,1fr)_minmax(19rem,24rem)]",
        )}
      >
        {hasUsers ? (
          <div className="min-w-0 xl:sticky xl:top-4 xl:order-2">
            <AuthUserBreakdown
              users={auth?.users ?? []}
              selectedUserId={selectedUserId}
              onSelectUser={onSelectUser}
              onReset={onResetUser}
            />
          </div>
        ) : null}
        <div className="min-w-0 xl:order-1">
          <AuthTimeline
            events={auth?.timeline ?? []}
            selectedRecordId={selectedRecordId}
            highlightedRecordIds={highlightedRecordIds}
            offset={offset}
            limit={limit}
            total={auth?.totalTimelineEvents ?? 0}
            loading={loading}
            onSelect={onSelectRecord}
            onPageChange={onPageChange}
          />
        </div>
      </div>
    </div>
  );
}
