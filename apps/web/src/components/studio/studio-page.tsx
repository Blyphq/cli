import { useEffect, useMemo, useState } from "react";

import { AuthView } from "@/components/studio/auth-view";
import { BackgroundJobDetailPanel } from "@/components/studio/background-job-detail-panel";
import { BackgroundJobsView } from "@/components/studio/background-jobs-view";
import { AssistantSheet } from "@/components/studio/assistant-sheet";
import { EmptyState } from "@/components/studio/empty-state";
import { ErrorDetailPanel } from "@/components/studio/error-detail-panel";
import { ErrorState } from "@/components/studio/error-state";
import { ErrorsView } from "@/components/studio/errors-view";
import { GroupDetailPanel } from "@/components/studio/group-detail-panel";
import { LogDetailPanel } from "@/components/studio/log-detail-panel";
import { LogFilesPanel } from "@/components/studio/log-files-panel";
import { LogList } from "@/components/studio/log-list";
import { ProjectConfigPanel } from "@/components/studio/project-config-panel";
import { OverviewView } from "@/components/studio/overview-view";
import { SectionNavPanel } from "@/components/studio/section-nav-panel";
import { StudioShell } from "@/components/studio/studio-shell";
import { StudioToolbar } from "@/components/studio/studio-toolbar";
import { useAssistantChat } from "@/hooks/use-assistant-chat";
import {
  DEFAULT_FILTERS,
  useStudioFiltersAndSelection,
  useSyncSelectionFromEntries,
} from "@/hooks";
import { useStudioData } from "@/hooks";
import {
  isAuthSection,
  isBackgroundSection,
  isErrorsSection,
  isOverviewSection,
} from "@/lib/studio";

export interface StudioPageProps {
  navigate: (opts: { search: { project?: string } }) => void;
  search: { project?: string };
}

export function StudioPage({ navigate, search }: StudioPageProps) {
  const projectPath = search.project ?? "";
  const [errorView, setErrorView] = useState<"grouped" | "raw">("grouped");
  const [errorSort, setErrorSort] = useState<"most-recent" | "most-frequent" | "first-seen">("most-recent");
  const [errorType, setErrorType] = useState("");
  const [errorSourceFile, setErrorSourceFile] = useState("");
  const [errorTag, setErrorTag] = useState("");
  const [selectedErrorGroupId, setSelectedErrorGroupId] = useState<string | null>(null);
  const [resolvedGroupIds, setResolvedGroupIds] = useState<Set<string>>(new Set());
  const [ignoredGroupIds, setIgnoredGroupIds] = useState<Set<string>>(new Set());
  const [expandedBackgroundRunId, setExpandedBackgroundRunId] = useState<string | null>(null);

  const {
    filters,
    setFilters,
    selection,
    setSelection,
    offset,
    setOffset,
    grouping,
    setGrouping,
    section,
    setSection,
    visitedAtBySection,
    authUi,
    setAuthUi,
    draftProjectPath,
    setDraftProjectPath,
  } = useStudioFiltersAndSelection(projectPath);

  const studioData = useStudioData({
    projectPath,
    filters,
    offset,
    grouping,
    section,
    authUserId: authUi.selectedUserId,
    selection,
    errorView,
    errorSort,
    errorType,
    errorSourceFile,
    errorTag,
    errorGroupId: selectedErrorGroupId,
  });

  const {
    entries,
    files,
    metaQuery,
    configQuery,
    filesQuery,
    logsQuery,
    groupQuery,
    recordQuery,
    recordSourceQuery,
    isLoadingMeta,
    isProjectInvalid,
    projectError,
    hasBackendError,
    fallbackModel,
    deferredSearch,
  } = studioData;

  const shouldSyncSelection =
    !isOverviewSection(section) &&
    !isAuthSection(section) &&
    !isErrorsSection(section) &&
    !isBackgroundSection(section);
  useSyncSelectionFromEntries(entries, selection, setSelection, shouldSyncSelection);

  useEffect(() => {
    setResolvedGroupIds(new Set());
    setIgnoredGroupIds(new Set());
    setSelectedErrorGroupId(null);
    setErrorView("grouped");
    setErrorSort("most-recent");
    setErrorType("");
    setErrorSourceFile("");
    setErrorTag("");
    setExpandedBackgroundRunId(null);
  }, [projectPath]);

  useEffect(() => {
    setOffset(0);
  }, [
    filters.level,
    filters.type,
    deferredSearch,
    filters.fileId,
    filters.from,
    filters.to,
    authUi.selectedUserId,
    projectPath,
    section,
    grouping,
    errorView,
    errorSort,
    errorType,
    errorSourceFile,
    errorTag,
    setOffset,
  ]);

  useEffect(() => {
    if (!studioData.metaQuery.isSuccess) {
      return;
    }

    const validSections = new Set([
      "overview",
      "all-logs",
      ...(studioData.metaQuery.data?.sections.map((item) => item.id) ?? []),
    ]);
    if (!validSections.has(section)) {
      setSection("overview");
    }
  }, [section, setSection, studioData.metaQuery.isSuccess, studioData.metaQuery.data?.sections]);

  const assistant = useAssistantChat({
    projectPath,
    filters,
    deferredSearch,
    selection,
    fallbackModel,
    assistantStatusData: studioData.assistantStatusQuery.data,
  });

  const canEdit = Boolean(projectPath && assistant.activeChatId);

  const handleReferenceSelect = (
    reference: Parameters<typeof assistant.handleReferenceSelect>[0],
  ) => {
    setSelection(assistant.handleReferenceSelect(reference));
  };

  const selectedRecord =
    selection?.kind === "record" ? studioData.selectedRecord : null;
  const selectedGroup =
    selection?.kind === "group" ? studioData.selectedGroup : null;
  const selectedBackgroundRun =
    selection?.kind === "background-run" ? studioData.selectedBackgroundRun : null;
  const visibleErrorGroups = useMemo(
    () =>
      (studioData.errorsQuery.data?.groups ?? []).filter(
        (group) => !ignoredGroupIds.has(group.id) && !resolvedGroupIds.has(group.id),
      ),
    [ignoredGroupIds, resolvedGroupIds, studioData.errorsQuery.data?.groups],
  );
  const resolvedErrorGroups = useMemo(
    () =>
      (studioData.errorsQuery.data?.groups ?? []).filter((group) => resolvedGroupIds.has(group.id)),
    [resolvedGroupIds, studioData.errorsQuery.data?.groups],
  );
  const selectedErrorGroup =
    (visibleErrorGroups.find((group) => group.id === selectedErrorGroupId) ??
      resolvedErrorGroups.find((group) => group.id === selectedErrorGroupId) ??
      null);

  useEffect(() => {
    if (section !== "errors" || errorView !== "grouped") {
      return;
    }

    if (!selectedErrorGroupId || !selectedErrorGroup) {
      const first = visibleErrorGroups[0] ?? resolvedErrorGroups[0] ?? null;
      setSelectedErrorGroupId(first?.id ?? null);
    }
  }, [
    errorView,
    resolvedErrorGroups,
    section,
    selectedErrorGroup,
    selectedErrorGroupId,
    visibleErrorGroups,
  ]);

  useEffect(() => {
    if (section !== "errors" || errorView !== "raw") {
      return;
    }

    const rawRecords = studioData.errorsQuery.data?.rawRecords ?? [];
    if (!rawRecords.length) {
      setSelection(null);
      return;
    }

    if (selection?.kind !== "record" || !rawRecords.some((item) => item.record.id === selection.id)) {
      setSelection({ kind: "record", id: rawRecords[0]!.record.id });
    }
  }, [errorView, section, selection, setSelection, studioData.errorsQuery.data?.rawRecords]);

  const describePrompt =
    "Describe the selected log or structured group like an observability copilot. Explain what happened, likely cause, related signals, and what to inspect next.";
  const currentSectionLabel =
    section === "all-logs"
      ? "All Logs"
      : metaQuery.data?.sections.find((item) => item.id === section)?.label ?? "Section";

  const handleResolveErrorGroup = (groupId: string) => {
    setResolvedGroupIds((current) => new Set(current).add(groupId));
  };

  const handleIgnoreErrorGroup = (groupId: string) => {
    setIgnoredGroupIds((current) => new Set(current).add(groupId));
    if (selectedErrorGroupId === groupId) {
      setSelectedErrorGroupId(null);
    }
  };

  const handleAskAiToFixError = () => {
    const detail = studioData.errorGroupQuery.data;
    if (!detail) {
      return;
    }

    if (detail.traceReference?.kind === "group") {
      setSection(detail.traceReference.sectionId);
      setSelection({ kind: "group", id: detail.traceReference.id });
    } else {
      setSelection({ kind: "record", id: detail.group.representativeRecordId });
    }

    const sourceText = detail.group.sourceFile
      ? ` Source: ${detail.group.sourceFile}:${detail.group.sourceLine ?? "?"}.`
      : "";
    assistant.createSelectionChatAndSubmit(
      `Diagnose this Studio error group and propose a concrete fix. Explain the likely root cause, the code path implicated by the stack trace, and the smallest defensible code change to resolve it.${sourceText} Error type: ${detail.group.errorType ?? "Unknown"}. Message: ${detail.group.message}. Occurrences this session: ${detail.group.occurrenceCount}. The selected Studio context includes the stack trace and source snippet.`,
    );
  };

  const handleAskAiOnBackgroundRun = () => {
    const detail = studioData.backgroundJobRunQuery.data;
    if (!detail) {
      return;
    }

    setSection("background");
    setSelection({ kind: "background-run", id: detail.run.id });
    assistant.createSelectionChatAndSubmit(
      `Diagnose this failed background job run. Use the full run timeline, identify the failing step, explain the likely root cause, and propose the smallest defensible fix. Job: ${detail.run.jobName}. Status: ${detail.run.status}. Failure: ${detail.run.failure?.message ?? "Unknown failure"}.`,
    );
  };

  return (
    <>
      <StudioShell
        toolbar={
          <StudioToolbar
            draftProjectPath={draftProjectPath}
            facets={studioData.facetsQuery.data}
            filters={filters}
            grouping={grouping}
            meta={metaQuery.data}
            section={section}
            files={files}
            onDraftProjectPathChange={setDraftProjectPath}
            onInspect={() =>
              navigate({ search: { project: draftProjectPath || undefined } })
            }
            onStartStandaloneChat={assistant.createStandaloneChat}
            onFilterChange={setFilters}
            onGroupingChange={setGrouping}
            onResetFilters={() => setFilters(DEFAULT_FILTERS)}
          />
        }
        sidebar={
          <>
            <SectionNavPanel
              projectPath={projectPath}
              meta={metaQuery.data}
              section={section}
              visitedAtBySection={visitedAtBySection}
              onSelect={setSection}
            />
            {metaQuery.data ? (
              <ProjectConfigPanel
                meta={metaQuery.data}
                config={configQuery.data}
              />
            ) : (
              <EmptyState
                title="Loading project metadata"
                description="Resolving the target project and Blyp config."
                size="compact"
              />
            )}
            {filesQuery.isError ? (
              <ErrorState
                title="Log discovery failed"
                description={filesQuery.error.message}
                size="compact"
              />
            ) : (
              <LogFilesPanel
                files={files}
                activeFileId={filters.fileId}
                mode={metaQuery.data?.logs.mode ?? "file"}
                onSelectFile={(fileId) =>
                  setFilters((current: typeof filters) => ({ ...current, fileId }))
                }
              />
            )}
          </>
        }
        content={
          hasBackendError ? (
            <ErrorState
              title="Studio backend failed"
              description={
                metaQuery.error?.message ??
                configQuery.error?.message ??
                filesQuery.error?.message ??
                logsQuery.error?.message ??
                studioData.authQuery.error?.message ??
                studioData.backgroundJobsQuery.error?.message ??
                studioData.backgroundJobRunQuery.error?.message ??
                groupQuery.error?.message ??
                recordQuery.error?.message ??
                "Unknown Studio error"
              }
            />
          ) : isProjectInvalid ? (
            <ErrorState
              title="Target project is invalid"
              description={projectError}
            />
          ) : isLoadingMeta ? (
            <EmptyState
              title="Loading Studio"
              description="Resolving project metadata, config, and logs."
            />
          ) : isOverviewSection(section) ? (
            <OverviewView
              sections={metaQuery.data?.sections ?? []}
              onSelect={setSection}
            />
          ) : section === "auth" ? (
            <AuthView
              auth={studioData.authQuery.data}
              loading={studioData.authQuery.isLoading}
              offset={offset}
              limit={100}
              selectedRecordId={selection?.kind === "record" ? selection.id : null}
              selectedUserId={authUi.selectedUserId}
              selectedPatternId={authUi.selectedPatternId}
              onPageChange={setOffset}
              onSelectRecord={(recordId) => setSelection({ kind: "record", id: recordId })}
              onSelectUser={(userId) => {
                setAuthUi((current) => ({
                  ...current,
                  selectedUserId: userId,
                }));
                setOffset(0);
              }}
              onResetUser={() => {
                setAuthUi((current) => ({
                  ...current,
                  selectedUserId: null,
                }));
                setOffset(0);
              }}
              onSelectPattern={(pattern) => {
                setAuthUi((current) => ({
                  ...current,
                  selectedPatternId: pattern.id,
                }));
                const firstRecordId = pattern.recordIds[0];
                if (firstRecordId) {
                  setSelection({ kind: "record", id: firstRecordId });
                }
              }}
            />
          ) : section === "background" ? (
            <BackgroundJobsView
              page={studioData.backgroundJobsQuery.data}
              loading={studioData.backgroundJobsQuery.isLoading}
              selectedRunId={selection?.kind === "background-run" ? selection.id : null}
              expandedRunId={expandedBackgroundRunId}
              expandedRunDetail={
                expandedBackgroundRunId === selection?.id
                  ? studioData.backgroundJobRunQuery.data
                  : null
              }
              expandedRunLoading={
                expandedBackgroundRunId === selection?.id
                  ? studioData.backgroundJobRunQuery.isLoading
                  : false
              }
              onSelectRun={(runId) => setSelection({ kind: "background-run", id: runId })}
              onToggleExpand={(runId) => {
                const nextExpanded = expandedBackgroundRunId === runId ? null : runId;
                setExpandedBackgroundRunId(nextExpanded);
                if (nextExpanded) {
                  setSelection({ kind: "background-run", id: nextExpanded });
                }
              }}
            />
          ) : section === "errors" ? (
            <ErrorsView
              page={studioData.errorsQuery.data}
              loading={studioData.errorsQuery.isLoading}
              offset={studioData.errorsQuery.data?.offset ?? offset}
              limit={studioData.errorsQuery.data?.limit ?? 100}
              viewMode={errorView}
              sort={errorSort}
              errorType={errorType}
              sourceFile={errorSourceFile}
              tag={errorTag}
              selectedGroupId={selectedErrorGroupId}
              selection={selection}
              resolvedGroupIds={resolvedGroupIds}
              ignoredGroupIds={ignoredGroupIds}
              onViewModeChange={setErrorView}
              onSortChange={setErrorSort}
              onErrorTypeChange={setErrorType}
              onSourceFileChange={setErrorSourceFile}
              onTagChange={setErrorTag}
              onSelectGroup={setSelectedErrorGroupId}
              onSelectRawRecord={setSelection}
              onResolveGroup={handleResolveErrorGroup}
              onIgnoreGroup={handleIgnoreErrorGroup}
              onPageChange={setOffset}
            />
          ) : (
            <LogList
              entries={entries}
              selection={selection}
              offset={logsQuery.data?.offset ?? offset}
              limit={logsQuery.data?.limit ?? 100}
              totalEntries={logsQuery.data?.totalEntries ?? 0}
              totalMatched={logsQuery.data?.totalMatched ?? 0}
              truncated={logsQuery.data?.truncated ?? false}
              loading={logsQuery.isLoading}
              title={currentSectionLabel}
              emptyTitle="No records matched this section"
              emptyDescription="This section hides when there is no signal. Try a different file, date range, or search term."
              onSelect={setSelection}
              onPageChange={setOffset}
            />
          )
        }
        detail={
          section === "errors" && errorView === "grouped" ? (
            <ErrorDetailPanel
              detail={studioData.errorGroupQuery.data ?? null}
              loading={studioData.errorGroupQuery.isLoading}
              statusLabel={
                selectedErrorGroup
                  ? resolvedGroupIds.has(selectedErrorGroup.id)
                    ? "Resolved"
                    : selectedErrorGroup.statusHint === "new"
                      ? "New"
                      : "Recurring"
                  : undefined
              }
              onAskAi={handleAskAiToFixError}
              onViewTrace={
                studioData.errorGroupQuery.data?.traceReference
                  ? () => {
                      const traceReference = studioData.errorGroupQuery.data?.traceReference;
                      if (!traceReference) {
                        return;
                      }
                      setSection(traceReference.sectionId);
                      setSelection(
                        traceReference.kind === "group"
                          ? { kind: "group", id: traceReference.id }
                          : { kind: "record", id: traceReference.id },
                      );
                    }
                  : undefined
              }
            />
          ) : section === "background" ? (
            <BackgroundJobDetailPanel
              detail={selectedBackgroundRun}
              loading={studioData.backgroundJobRunQuery.isLoading}
              onAskAi={handleAskAiOnBackgroundRun}
            />
          ) : selection?.kind === "group" ? (
            <GroupDetailPanel
              group={selectedGroup}
              loading={groupQuery.isLoading}
              onDescribeWithAi={() => {
                assistant.handleDescribeSelection(
                  "Describe the selected structured group like an observability copilot. Explain what happened, likely cause, related signals, and what to inspect next.",
                );
              }}
              onSelectRecord={(recordId) => {
                setSelection({ kind: "record", id: recordId });
              }}
            />
          ) : (
            <LogDetailPanel
              record={selectedRecord}
              source={recordSourceQuery.data ?? null}
              sourceLoading={recordSourceQuery.isLoading}
              onDescribeWithAi={() => {
                assistant.handleDescribeSelection(
                  "Describe the selected log like an observability copilot. Explain what happened, likely cause, related signals, and what to inspect next.",
                );
              }}
            />
          )
        }
      />
      {!hasBackendError && !isProjectInvalid && !isLoadingMeta && (
        <AssistantSheet
          open={assistant.assistantOpen}
          activeChatId={assistant.activeChatId}
          canDescribeSelection={selection !== null}
          canEdit={canEdit}
          chatError={assistant.assistantError}
          chatSessions={assistant.chatSessions}
          draft={assistant.assistantDraft}
          messages={assistant.messages}
          model={assistant.selectedModel}
          scopeLabel={assistant.scopeLabel}
          statusState={assistant.assistantStatus}
          status={studioData.assistantStatusQuery.data}
          onCreateChat={assistant.createStandaloneChat}
          onDraftChange={(value) => {
            if (canEdit) {
              assistant.updateChatDraft(projectPath, assistant.activeChatId!, value);
            }
          }}
          onModelChange={(value) => {
            if (canEdit) {
              assistant.updateChatModel(projectPath, assistant.activeChatId!, value);
            }
          }}
          onDescribeSelection={() => assistant.handleDescribeSelection(describePrompt)}
          onOpenChange={(next) => (next ? assistant.openAssistant() : assistant.closeAssistant())}
          onQuickAction={(prompt) => {
            void assistant.submitAssistantPrompt(prompt, "chat", {
              scopeMode: assistant.assistantScopeMode,
            });
          }}
          onReferenceSelect={handleReferenceSelect}
          onSelectChat={assistant.switchAssistantChat}
          onSend={() => {
            void assistant.submitAssistantPrompt(assistant.assistantDraft, "chat", {
              scopeMode: assistant.assistantScopeMode,
            });
          }}
          onStop={assistant.stopAssistant}
        />
      )}
    </>
  );
}
