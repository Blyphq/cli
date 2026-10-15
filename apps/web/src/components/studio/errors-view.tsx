import { Bug, CheckCircle2, ChevronRight, EyeOff, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type {
  StudioErrorGroup,
  StudioErrorOccurrence,
  StudioErrorUiState,
  StudioErrorsPage,
  StudioSelection,
} from "@/lib/studio";
import { cn } from "@/lib/utils";

import { EmptyState } from "./empty-state";
import { ERROR_GROUP_COLUMNS, ErrorGroupRow, getErrorSourceLabel } from "./error-group-row";
import { ERROR_RAW_COLUMNS, ErrorRawRow } from "./error-raw-row";
import { ErrorStatsBar } from "./error-stats-bar";
import { ErrorsToolbar, ToolbarToggle } from "./errors-toolbar";
import { PanelHeader } from "./panel-header";
import { ListRowsSkeleton } from "./studio-skeletons";

interface ErrorsViewProps {
  data: StudioErrorsPage | undefined;
  loading: boolean;
  selection: StudioSelection;
  ui: StudioErrorUiState;
  resolvedAtByFingerprint: Record<string, string>;
  ignoredByFingerprint: Record<string, true>;
  resolvedCollapsed: boolean;
  onUiChange(next: StudioErrorUiState): void;
  onSelect(selection: StudioSelection): void;
  onToggleResolvedCollapsed(next: boolean): void;
  onUnignore(fingerprint: string): void;
}

const LIST_HEADER =
  "flex h-8 items-center gap-4 border-b border-border bg-muted/40 px-4 text-[0.7rem] font-medium text-muted-foreground";

export function ErrorsView({
  data,
  loading,
  selection,
  ui,
  resolvedAtByFingerprint,
  ignoredByFingerprint,
  resolvedCollapsed,
  onUiChange,
  onSelect,
  onToggleResolvedCollapsed,
  onUnignore,
}: ErrorsViewProps) {
  const groups = (data?.entries.filter((entry) => entry.kind === "error-group") as StudioErrorGroup[] | undefined) ?? [];
  const occurrences =
    (data?.entries.filter((entry) => entry.kind === "occurrence") as StudioErrorOccurrence[] | undefined) ?? [];
  const activeGroups = groups.filter(
    (group) =>
      !ignoredByFingerprint[group.fingerprint] &&
      !isGroupResolved(group, resolvedAtByFingerprint[group.fingerprint]),
  );
  const visibleResolvedGroups = groups.filter(
    (group) =>
      isGroupResolved(group, resolvedAtByFingerprint[group.fingerprint]) &&
      !ignoredByFingerprint[group.fingerprint],
  );
  const ignoredGroups = groups.filter((group) => Boolean(ignoredByFingerprint[group.fingerprint]));
  const hasEntries = Boolean(data?.entries.length);
  const sessionStart = data?.earliestTimestamp ?? null;

  const renderGroupRow = (group: StudioErrorGroup, keyPrefix = "") => (
    <li key={`${keyPrefix}${group.fingerprint}`}>
      <ErrorGroupRow
        group={group}
        selected={selection?.kind === "error-group" && selection.id === group.fingerprint}
        sessionStart={sessionStart}
        resolvedAt={resolvedAtByFingerprint[group.fingerprint] ?? null}
        ignored={Boolean(ignoredByFingerprint[group.fingerprint])}
        onSelect={(fingerprint) => onSelect({ kind: "error-group", id: fingerprint })}
      />
    </li>
  );

  return (
    <div className="space-y-4">
      <ErrorStatsBar
        stats={
          data?.stats ?? {
            uniqueErrorTypes: 0,
            totalOccurrences: 0,
            mostFrequentError: null,
            newErrorsComparedToPreviousSessions: { available: false, count: null },
          }
        }
      />
      <ErrorsToolbar
        viewMode={ui.view}
        sort={ui.sort}
        errorType={ui.type}
        sourceFile={ui.sourceFile}
        tag={ui.sectionTag}
        errorTypes={data?.availableTypes ?? []}
        sourceFiles={data?.availableSourceFiles ?? []}
        tags={(data?.availableSectionTags ?? []).map((value) => ({ id: value, label: value }))}
        sortDisabled={false}
        onViewModeChange={(view) => onUiChange({ ...ui, view })}
        onSortChange={(sort) => onUiChange({ ...ui, sort })}
        onErrorTypeChange={(type) => onUiChange({ ...ui, type })}
        onSourceFileChange={(sourceFile) => onUiChange({ ...ui, sourceFile })}
        onTagChange={(sectionTag) => onUiChange({ ...ui, sectionTag })}
        trailing={
          <>
            <ToolbarToggle
              pressed={ui.showResolved}
              onPressedChange={(showResolved) => onUiChange({ ...ui, showResolved })}
              icon={<CheckCircle2 />}
            >
              Show resolved
            </ToolbarToggle>
            <ToolbarToggle
              pressed={ui.showIgnored}
              onPressedChange={(showIgnored) => onUiChange({ ...ui, showIgnored })}
              icon={<EyeOff />}
            >
              Show ignored
            </ToolbarToggle>
          </>
        }
      />
      <Card className="@container/errors min-h-[36rem] gap-0 py-0">
        <PanelHeader
          className="py-3 [.border-b]:pb-3"
          title={ui.view === "grouped" ? "Grouped errors" : "Raw error events"}
          description={
            <span className="font-mono text-[0.7rem] tabular-nums">
              {`${data?.totalEntries ?? 0} visible entries from ${data?.totalMatched ?? 0} matched occurrences`}
            </span>
          }
          action={
            data?.truncated ? (
              <Badge variant="warning" title={`Scanned ${data.scannedRecords} records`}>
                Truncated
              </Badge>
            ) : null
          }
        />
        {loading && !hasEntries ? (
          <div className="p-4">
            <ListRowsSkeleton rows={7} />
          </div>
        ) : !hasEntries ? (
          <div className="p-4">
            <EmptyState
              icon={<ShieldCheck />}
              title="No errors matched"
              description="Try a different time range, file, or search term."
            />
          </div>
        ) : ui.view === "grouped" ? (
          <>
            <div aria-hidden className={LIST_HEADER}>
              <span className="min-w-0 flex-1">Issue</span>
              <span className={ERROR_GROUP_COLUMNS.trend}>Trend</span>
              <span className={ERROR_GROUP_COLUMNS.events}>Events</span>
              <span className={ERROR_GROUP_COLUMNS.seen}>Last · first</span>
            </div>
            {activeGroups.length > 0 ? (
              <ul aria-label="Grouped errors" className="divide-y divide-border/70">{activeGroups.map((group) => renderGroupRow(group))}</ul>
            ) : (
              <div className="p-4">
                <EmptyState
                  size="compact"
                  icon={<CheckCircle2 />}
                  title="No active error groups"
                  description="Every visible group is resolved or ignored."
                />
              </div>
            )}
            {ui.showResolved && visibleResolvedGroups.length > 0 ? (
              <section className="border-t border-border">
                <button
                  type="button"
                  aria-expanded={!resolvedCollapsed}
                  className="flex h-9 w-full items-center gap-2 bg-muted/30 px-4 text-left text-[0.75rem] font-medium text-foreground/90 outline-none transition-colors duration-150 hover:bg-muted/60 focus-visible:bg-muted"
                  onClick={() => onToggleResolvedCollapsed(!resolvedCollapsed)}
                >
                  <ChevronRight
                    aria-hidden
                    className={cn(
                      "size-3.5 text-muted-foreground transition-transform duration-150 ease-out-expo",
                      !resolvedCollapsed && "rotate-90",
                    )}
                  />
                  <span>{resolvedCollapsed ? "Show" : "Hide"} resolved</span>
                  <Badge variant="success">{visibleResolvedGroups.length}</Badge>
                </button>
                {!resolvedCollapsed ? (
                  <ul aria-label="Resolved errors" className="divide-y divide-border/70 border-t border-border/70">
                    {visibleResolvedGroups.map((group) => renderGroupRow(group, "resolved:"))}
                  </ul>
                ) : null}
              </section>
            ) : null}
            {ui.showIgnored && ignoredGroups.length > 0 ? (
              <section className="border-t border-border">
                <div className="flex h-9 items-center gap-2 bg-muted/30 px-4 text-[0.75rem] font-medium text-foreground/90">
                  <EyeOff aria-hidden className="size-3.5 text-muted-foreground" />
                  <span>Ignored</span>
                  <Badge variant="muted">{ignoredGroups.length}</Badge>
                </div>
                <ul aria-label="Ignored errors" className="border-t border-border/70">
                  {ignoredGroups.map((group) => {
                    const source = getErrorSourceLabel(group);
                    return (
                      <li
                        key={`ignored:${group.fingerprint}`}
                        className="flex items-center gap-3 border-b border-border/70 px-4 py-2 last:border-0"
                      >
                        <div className="min-w-0 flex-1 space-y-0.5 opacity-75">
                          <div className="truncate text-[0.8rem] font-medium">{group.errorType}</div>
                          <div className="truncate text-[0.75rem] text-muted-foreground">
                            {group.messageFirstLine}
                          </div>
                          {source ? (
                            <div className="truncate font-mono text-[0.68rem] text-muted-foreground/90">
                              {source}
                            </div>
                          ) : null}
                        </div>
                        <Button variant="outline" size="xs" onClick={() => onUnignore(group.fingerprint)}>
                          Unignore
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}
          </>
        ) : (
          <>
            <div aria-hidden className={cn(LIST_HEADER, "gap-3")}>
              <span className={ERROR_RAW_COLUMNS.time}>Time</span>
              <span className={ERROR_RAW_COLUMNS.level}>Level</span>
              <span className="min-w-0 flex-1">Event</span>
            </div>
            {occurrences.length > 0 ? (
              <ul aria-label="Raw error events" className="divide-y divide-border/70">
                {occurrences.map((occurrence) => (
                  <li key={occurrence.id}>
                    <ErrorRawRow
                      occurrence={occurrence}
                      selected={selection?.kind === "error-occurrence" && selection.id === occurrence.id}
                      onSelect={(id) => onSelect({ kind: "error-occurrence", id })}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-4">
                <EmptyState
                  size="compact"
                  icon={<Bug />}
                  title="No raw error events"
                  description="Switch back to grouped view or widen your filters."
                />
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

function isGroupResolved(group: StudioErrorGroup, resolvedAt: string | undefined): boolean {
  if (!resolvedAt) {
    return false;
  }

  const resolvedTime = Date.parse(resolvedAt);
  const lastSeenTime = group.lastSeenAt ? Date.parse(group.lastSeenAt) : Number.NaN;
  return Number.isFinite(resolvedTime) && (!Number.isFinite(lastSeenTime) || resolvedTime >= lastSeenTime);
}
