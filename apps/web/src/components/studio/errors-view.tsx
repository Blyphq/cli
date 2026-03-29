import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  StudioErrorGroup,
  StudioErrorOccurrence,
  StudioErrorSort,
  StudioErrorUiState,
  StudioErrorsPage,
  StudioSelection,
} from "@/lib/studio";

import { EmptyState } from "./empty-state";
import { ErrorGroupRow } from "./error-group-row";
import { ErrorRawRow } from "./error-raw-row";
import { ErrorStatsBar } from "./error-stats-bar";
import { PanelHeader } from "./panel-header";

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

const ALL_TYPES = "__all_types__";
const ALL_SOURCES = "__all_sources__";
const ALL_TAGS = "__all_tags__";

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
  const activeGroups = groups.filter((group) => {
    const ignored = Boolean(ignoredByFingerprint[group.fingerprint]);
    if (ignored) {
      return false;
    }
    const resolvedAt = resolvedAtByFingerprint[group.fingerprint];
    const isResolved = isGroupResolved(group, resolvedAt);
    if (isResolved) {
      return false;
    }
    return true;
  });
  const resolvedGroups = groups.filter((group) => isGroupResolved(group, resolvedAtByFingerprint[group.fingerprint]));
  const ignoredGroups = groups.filter((group) => Boolean(ignoredByFingerprint[group.fingerprint]));

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
      <Card size="sm">
        <PanelHeader
          title="Errors"
          description="Grouped error triage for the current inspected session."
        />
        <CardContent className="space-y-3 p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <ControlSelect
              label="View"
              value={ui.view}
              onValueChange={(value) =>
                onUiChange({ ...ui, view: value as StudioErrorUiState["view"] })
              }
              options={[
                { value: "grouped", label: "Grouped" },
                { value: "raw", label: "Raw" },
              ]}
            />
            <ControlSelect
              label="Sort"
              value={ui.sort}
              onValueChange={(value) =>
                onUiChange({ ...ui, sort: value as StudioErrorSort })
              }
              options={[
                { value: "most-recent", label: "Most recent" },
                { value: "most-frequent", label: "Most frequent" },
                { value: "first-seen", label: "First seen" },
              ]}
            />
            <ControlSelect
              label="Type"
              value={ui.type || ALL_TYPES}
              onValueChange={(value) =>
                onUiChange({ ...ui, type: value === ALL_TYPES ? "" : value })
              }
              options={[
                { value: ALL_TYPES, label: "All types" },
                ...(data?.availableTypes ?? []).map((value) => ({ value, label: value })),
              ]}
            />
            <ControlSelect
              label="Source file"
              value={ui.sourceFile || ALL_SOURCES}
              onValueChange={(value) =>
                onUiChange({ ...ui, sourceFile: value === ALL_SOURCES ? "" : value })
              }
              options={[
                { value: ALL_SOURCES, label: "All sources" },
                ...(data?.availableSourceFiles ?? []).map((value) => ({ value, label: value })),
              ]}
            />
            <ControlSelect
              label="Section tag"
              value={ui.sectionTag || ALL_TAGS}
              onValueChange={(value) =>
                onUiChange({ ...ui, sectionTag: value === ALL_TAGS ? "" : value })
              }
              options={[
                { value: ALL_TAGS, label: "All tags" },
                ...(data?.availableSectionTags ?? []).map((value) => ({ value, label: value })),
              ]}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
            <Button
              variant={ui.showResolved ? "secondary" : "outline"}
              size="sm"
              className="min-w-[9.5rem]"
              onClick={() => onUiChange({ ...ui, showResolved: !ui.showResolved })}
            >
              Show resolved
            </Button>
            <Button
              variant={ui.showIgnored ? "secondary" : "outline"}
              size="sm"
              className="min-w-[9.5rem]"
              onClick={() => onUiChange({ ...ui, showIgnored: !ui.showIgnored })}
            >
              Show ignored
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card className="min-h-[36rem]">
        <PanelHeader
          title={ui.view === "grouped" ? "Grouped errors" : "Raw error events"}
          description={
            loading
              ? "Loading errors..."
              : `${data?.totalEntries ?? 0} visible entries from ${data?.totalMatched ?? 0} matched occurrences`
          }
        />
        <CardContent className="p-0">
          {!loading && !data?.entries.length ? (
            <EmptyState
              title="No errors matched"
              description="Try a different time range, file, or search term."
            />
          ) : ui.view === "grouped" ? (
            <>
              <div>
                {activeGroups.map((group) => (
                  <ErrorGroupRow
                    key={group.fingerprint}
                    group={group}
                    selected={selection?.kind === "error-group" && selection.id === group.fingerprint}
                    sessionStart={data?.earliestTimestamp ?? null}
                    resolvedAt={resolvedAtByFingerprint[group.fingerprint] ?? null}
                    ignored={Boolean(ignoredByFingerprint[group.fingerprint])}
                    onSelect={(fingerprint) => onSelect({ kind: "error-group", id: fingerprint })}
                  />
                ))}
              </div>
              {ui.showResolved && resolvedGroups.length > 0 ? (
                <div className="border-t border-border/60 p-4">
                  <button
                    type="button"
                    className="flex items-center gap-2 text-sm font-medium"
                    onClick={() => onToggleResolvedCollapsed(!resolvedCollapsed)}
                  >
                    <span>{resolvedCollapsed ? "Show" : "Hide"} resolved</span>
                    <Badge variant="secondary">{resolvedGroups.length}</Badge>
                  </button>
                  {!resolvedCollapsed ? (
                    <div className="mt-3">
                      {resolvedGroups.map((group) => (
                        <ErrorGroupRow
                          key={`resolved:${group.fingerprint}`}
                          group={group}
                          selected={selection?.kind === "error-group" && selection.id === group.fingerprint}
                          sessionStart={data?.earliestTimestamp ?? null}
                          resolvedAt={resolvedAtByFingerprint[group.fingerprint] ?? null}
                          ignored={Boolean(ignoredByFingerprint[group.fingerprint])}
                          onSelect={(fingerprint) => onSelect({ kind: "error-group", id: fingerprint })}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {ui.showIgnored && ignoredGroups.length > 0 ? (
                <div className="border-t border-border/60 p-4">
                  <div className="mb-3 text-sm font-medium">Ignored</div>
                  <div className="space-y-2">
                    {ignoredGroups.map((group) => (
                      <div
                        key={`ignored:${group.fingerprint}`}
                        className="flex items-center justify-between rounded border border-border/60 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm">{group.errorType}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {group.messageFirstLine}
                          </div>
                        </div>
                        <Button variant="outline" size="xs" onClick={() => onUnignore(group.fingerprint)}>
                          Unignore
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div>
              {occurrences.map((occurrence) => (
                <ErrorRawRow
                  key={occurrence.id}
                  occurrence={occurrence}
                  selected={selection?.kind === "error-occurrence" && selection.id === occurrence.id}
                  onSelect={(id) => onSelect({ kind: "error-occurrence", id })}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ControlSelect(props: {
  label: string;
  value: string;
  onValueChange(value: string): void;
  options: Array<{ value: string; label: string }>;
}) {
  const selectedLabel =
    props.options.find((option) => option.value === props.value)?.label ?? props.value;

  return (
    <div className="space-y-2">
      <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        {props.label}
      </div>
      <Select value={props.value} onValueChange={props.onValueChange}>
        <SelectTrigger>
          <SelectValue>{selectedLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {props.options.map((option) => (
            <SelectItem key={`${props.label}:${option.value}`} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
