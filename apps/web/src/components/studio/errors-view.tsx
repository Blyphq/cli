import type {
  StudioErrorGroup,
  StudioErrorSort,
  StudioErrorViewMode,
  StudioErrorsPage,
  StudioSelection,
} from "@/lib/studio";

import { EmptyState } from "./empty-state";
import { ErrorGroupList } from "./error-group-list";
import { ErrorsStatsBar } from "./errors-stats-bar";
import { ErrorsToolbar } from "./errors-toolbar";
import { LogList } from "./log-list";

interface ErrorsViewProps {
  page: StudioErrorsPage | undefined;
  loading: boolean;
  offset: number;
  limit: number;
  viewMode: StudioErrorViewMode;
  sort: StudioErrorSort;
  errorType: string;
  sourceFile: string;
  tag: string;
  selectedGroupId: string | null;
  selection: StudioSelection;
  resolvedGroupIds: Set<string>;
  ignoredGroupIds: Set<string>;
  onViewModeChange(next: StudioErrorViewMode): void;
  onSortChange(next: StudioErrorSort): void;
  onErrorTypeChange(next: string): void;
  onSourceFileChange(next: string): void;
  onTagChange(next: string): void;
  onSelectGroup(groupId: string): void;
  onSelectRawRecord(selection: StudioSelection): void;
  onResolveGroup(groupId: string): void;
  onIgnoreGroup(groupId: string): void;
  onPageChange(nextOffset: number): void;
}

export function ErrorsView({
  page,
  loading,
  offset,
  limit,
  viewMode,
  sort,
  errorType,
  sourceFile,
  tag,
  selectedGroupId,
  selection,
  resolvedGroupIds,
  ignoredGroupIds,
  onViewModeChange,
  onSortChange,
  onErrorTypeChange,
  onSourceFileChange,
  onTagChange,
  onSelectGroup,
  onSelectRawRecord,
  onResolveGroup,
  onIgnoreGroup,
  onPageChange,
}: ErrorsViewProps) {
  if (!page && loading) {
    return (
      <EmptyState
        title="Loading errors"
        description="Grouping error signals from the current Studio session."
      />
    );
  }

  const groups = page?.groups ?? [];
  const activeGroups = groups.filter(
    (group) => !ignoredGroupIds.has(group.id) && !resolvedGroupIds.has(group.id),
  );
  const resolvedGroups = groups.filter((group) => resolvedGroupIds.has(group.id));
  const activeStats = buildClientStats(activeGroups);
  const errorTypes = unique(
    groups.map((group) => group.errorType).filter((value): value is string => Boolean(value)),
  );
  const sourceFiles = unique(
    groups.map((group) => group.sourceFile).filter((value): value is string => Boolean(value)),
  );
  const tags = uniqueTags(groups);

  return (
    <div className="space-y-4">
      <ErrorsStatsBar stats={activeStats} />
      <ErrorsToolbar
        viewMode={viewMode}
        sort={sort}
        errorType={errorType}
        sourceFile={sourceFile}
        tag={tag}
        errorTypes={errorTypes}
        sourceFiles={sourceFiles}
        tags={tags}
        onViewModeChange={onViewModeChange}
        onSortChange={onSortChange}
        onErrorTypeChange={onErrorTypeChange}
        onSourceFileChange={onSourceFileChange}
        onTagChange={onTagChange}
      />
      {viewMode === "raw" ? (
        <LogList
          entries={(page?.rawRecords ?? []).map((occurrence) => ({
            ...occurrence.record,
            kind: "record" as const,
          }))}
          selection={selection}
          offset={offset}
          limit={limit}
          totalEntries={page?.totalRawRecords ?? 0}
          totalMatched={page?.totalRawRecords ?? 0}
          truncated={page?.truncated ?? false}
          loading={loading}
          title="Raw error events"
          emptyTitle="No raw error events matched"
          emptyDescription="Try a different time range, source file, or search term."
          onSelect={onSelectRawRecord}
          onPageChange={onPageChange}
        />
      ) : (
        <ErrorGroupList
          groups={activeGroups}
          resolvedGroups={resolvedGroups}
          selectedGroupId={selectedGroupId}
          offset={offset}
          limit={limit}
          totalGroups={activeGroups.length}
          onSelect={onSelectGroup}
          onResolve={onResolveGroup}
          onIgnore={onIgnoreGroup}
          onPageChange={onPageChange}
        />
      )}
    </div>
  );
}

function buildClientStats(groups: StudioErrorGroup[]) {
  const mostFrequent = groups
    .slice()
    .sort((left, right) => right.occurrenceCount - left.occurrenceCount)[0] ?? null;

  return {
    totalUniqueErrorTypes: groups.length,
    totalErrorOccurrences: groups.reduce((sum, group) => sum + group.occurrenceCount, 0),
    mostFrequentError: mostFrequent
      ? {
          errorType: mostFrequent.errorType,
          message: mostFrequent.message,
          count: mostFrequent.occurrenceCount,
        }
      : null,
    newErrorsThisSession: groups.filter((group) => group.occurrenceCount === 1).length,
  };
}

function unique(values: string[]) {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

function uniqueTags(groups: StudioErrorGroup[]) {
  const tags = new Map<string, { id: string; label: string }>();

  for (const group of groups) {
    for (const tag of group.tags) {
      tags.set(tag.id, tag);
    }
  }

  return Array.from(tags.values()).sort((left, right) => left.label.localeCompare(right.label));
}
