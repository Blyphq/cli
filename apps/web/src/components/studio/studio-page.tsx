import { useEffect, useState } from "react";

import { ErrorsView } from "@/components/studio/errors-view";
import { AuthView } from "@/components/studio/auth-view";
import { AssistantSheet } from "@/components/studio/assistant-sheet";
import { DatabaseView } from "@/components/studio/database-view";
import { EmptyState } from "@/components/studio/empty-state";
import { ErrorDetailPanel } from "@/components/studio/error-detail-panel";
import { ErrorState } from "@/components/studio/error-state";
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
  useErrorSessionState,
  DEFAULT_FILTERS,
  useStudioFiltersAndSelection,
  useSyncErrorSelectionFromEntries,
  useSyncSelectionFromEntries,
} from "@/hooks";
import { useStudioData } from "@/hooks";
import {
  isAuthSection,
  isDatabaseSection,
  isErrorsSection,
  isOverviewSection,
} from "@/lib/studio";
import { formatDurationMs } from "@/lib/studio";

export interface StudioPageProps {
  navigate: (opts: { search: { project?: string } }) => void;
  search: { project?: string };
}

export function StudioPage({ navigate, search }: StudioPageProps) {
  const projectPath = search.project ?? "";
  const [pendingDatabaseAiPrompt, setPendingDatabaseAiPrompt] = useState<{
    recordId: string;
    prompt: string;
  } | null>(null);

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
    errorUi,
    setErrorUi,
    draftProjectPath,
    setDraftProjectPath,
  } = useStudioFiltersAndSelection(projectPath);
  const errorSessionState = useErrorSessionState(projectPath);

  const studioData = useStudioData({
    projectPath,
    filters,
    offset,
    grouping,
    section,
    errorUi,
    authUserId: authUi.selectedUserId,
    selection,
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
    !isOverviewSection(section) && !isAuthSection(section) && !isDatabaseSection(section)  && !isErrorsSection(section);
  useSyncSelectionFromEntries(entries, selection, setSelection, shouldSyncSelection);
  useSyncErrorSelectionFromEntries(
    studioData.errorsQuery.data?.entries ?? [],
    selection,
    setSelection,
    errorUi.view === "grouped",
    isErrorsSection(section),
  );

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
    errorUi.view,
    errorUi.sort,
    errorUi.type,
    errorUi.sourceFile,
    errorUi.sectionTag,
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

  useEffect(() => {
    if (!pendingDatabaseAiPrompt) {
      return;
    }

    if (selection?.kind !== "record" || selection.id !== pendingDatabaseAiPrompt.recordId) {
      return;
    }

    const prompt = pendingDatabaseAiPrompt.prompt;
    setPendingDatabaseAiPrompt(null);

    if (!assistant.activeChatId || assistant.assistantScopeMode === "standalone") {
      assistant.createSelectionChatAndSubmit(prompt);
      return;
    }

    assistant.openAssistant();
    void assistant.submitAssistantPrompt(prompt, "chat", {
      scopeMode: "selection",
    });
  }, [
    assistant.activeChatId,
    assistant.assistantScopeMode,
    assistant.createSelectionChatAndSubmit,
    assistant.openAssistant,
    assistant.submitAssistantPrompt,
    pendingDatabaseAiPrompt,
    selection,
  ]);

  const canEdit = Boolean(projectPath && assistant.activeChatId);

  const handleReferenceSelect = (
    reference: Parameters<typeof assistant.handleReferenceSelect>[0],
  ) => {
    setSelection(assistant.handleReferenceSelect(reference));
  };

  const selectedRecord =
    selection?.kind === "record" || selection?.kind === "error-occurrence"
      ? studioData.selectedRecord
      : null;
  const selectedGroup =
    selection?.kind === "group" ? studioData.selectedGroup : null;
  const selectedErrorGroup =
    selection?.kind === "error-group" ? studioData.selectedErrorGroup : null;

  const describePrompt =
    "Describe the selected log or structured group like an observability copilot. Explain what happened, likely cause, related signals, and what to inspect next.";
  const currentSectionLabel =
    section === "all-logs"
      ? "All Logs"
      : metaQuery.data?.sections.find((item) => item.id === section)?.label ?? "Section";

  const handleAskAiToFix = () => {
    if (!selectedErrorGroup) {
      return;
    }

    const representative =
      selectedErrorGroup.occurrences.find(
        (item) => item.id === selectedErrorGroup.group.representativeOccurrenceId,
      ) ?? selectedErrorGroup.occurrences[0];
    if (!representative) {
      return;
    }

    const prompt = [
      "Help me fix this recurring error in my local Studio session.",
      `Fingerprint: ${selectedErrorGroup.group.fingerprint}`,
      `Type: ${selectedErrorGroup.group.errorType}`,
      `Message: ${selectedErrorGroup.group.messageFirstLine}`,
      `Count: ${selectedErrorGroup.group.occurrenceCount}`,
      `First seen: ${selectedErrorGroup.group.firstSeenAt ?? "unknown"}`,
      `Last seen: ${selectedErrorGroup.group.lastSeenAt ?? "unknown"}`,
      representative.fingerprintSource.relativePath
        ? `Source: ${representative.fingerprintSource.relativePath}${representative.fingerprintSource.line ? `:${representative.fingerprintSource.line}` : ""}`
        : null,
      representative.http
        ? `HTTP: ${[representative.http.method, representative.http.path ?? representative.http.url, representative.http.statusCode]
            .filter(Boolean)
            .join(" ")}`
        : null,
      `Structured fields: ${JSON.stringify(representative.structuredFields, null, 2)}`,
      representative.stack ? `Stack trace:\n${representative.stack}` : null,
      representative.messageFirstLine === selectedErrorGroup.group.messageFirstLine &&
      selectedErrorGroup.group.occurrenceCount === 1
        ? "This appears new in the current session."
        : "This is recurring in the current session.",
    ]
      .filter(Boolean)
      .join("\n\n");

    assistant.createSelectionChatAndSubmit(prompt);
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
                studioData.errorsQuery.error?.message ??
                studioData.authQuery.error?.message ??
                studioData.databaseQuery.error?.message ??
                groupQuery.error?.message ??
                studioData.errorGroupQuery.error?.message ??
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
          ) : isErrorsSection(section) ? (
            <ErrorsView
              data={studioData.errorsQuery.data}
              loading={studioData.errorsQuery.isLoading}
              selection={selection}
              ui={errorUi}
              resolvedAtByFingerprint={errorSessionState.state.resolvedAtByFingerprint}
              ignoredByFingerprint={errorSessionState.state.ignoredByFingerprint}
              resolvedCollapsed={errorSessionState.state.resolvedCollapsed}
              onUiChange={setErrorUi}
              onSelect={setSelection}
              onToggleResolvedCollapsed={errorSessionState.setResolvedCollapsed}
              onUnignore={errorSessionState.unignore}
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
          ) : section === "database" ? (
            <DatabaseView
              database={studioData.databaseQuery.data}
              loading={studioData.databaseQuery.isLoading}
              selectedRecordId={selection?.kind === "record" ? selection.id : null}
              onSelectRecord={(recordId) => setSelection({ kind: "record", id: recordId })}
              onAskAi={(query) => {
                const prompt = buildSlowQueryPrompt(query);
                setPendingDatabaseAiPrompt({
                  recordId: query.recordId,
                  prompt,
                });
                setSelection({ kind: "record", id: query.recordId });
              }}
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
          selection?.kind === "group" ? (
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
          ) : selection?.kind === "error-group" ? (
            <ErrorDetailPanel
              group={selectedErrorGroup}
              occurrence={null}
              record={null}
              loading={studioData.errorGroupQuery.isLoading}
              resolvedAt={
                errorSessionState.state.resolvedAtByFingerprint[selection.id] ?? null
              }
              ignored={Boolean(errorSessionState.state.ignoredByFingerprint[selection.id])}
              onAskAi={handleAskAiToFix}
              onMarkResolved={() => errorSessionState.markResolved(selection.id)}
              onIgnore={() => errorSessionState.ignore(selection.id)}
              onViewTrace={() => {
                const traceGroupId = selectedErrorGroup?.group.relatedTraceGroupId;
                if (!traceGroupId) {
                  return;
                }
                setGrouping("grouped");
                setSection("all-logs");
                setSelection({ kind: "group", id: traceGroupId });
              }}
            />
          ) : (
            selection?.kind === "error-occurrence" ? (
              <ErrorDetailPanel
                group={null}
                occurrence={
                  studioData.errorsQuery.data?.occurrences.find((item) => item.id === selection.id) ?? null
                }
                record={selectedRecord}
                recordSource={recordSourceQuery.data ?? null}
                recordSourceLoading={recordSourceQuery.isLoading}
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
          onDescribeSelection={() => {
            if (selection?.kind === "error-group") {
              handleAskAiToFix();
              return;
            }
            assistant.handleDescribeSelection(describePrompt);
          }}
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

function buildSlowQueryPrompt(
  query: {
    operation: string;
    modelOrTable: string | null;
    durationMs: number | null;
    requestId: string | null;
    traceId: string | null;
    queryText: string | null;
    params: unknown;
  },
): string {
  const context = [
    `Slow database query detected above the 100ms threshold.`,
    `Operation: ${query.operation}`,
    `Model or table: ${query.modelOrTable ?? "Unknown"}`,
    `Duration: ${formatDurationMs(query.durationMs)}`,
    query.requestId ? `Request ID: ${query.requestId}` : null,
    query.traceId ? `Trace ID: ${query.traceId}` : null,
    query.queryText ? `Query: ${query.queryText}` : null,
    query.params !== undefined && query.params !== null
      ? `Redacted params: ${safeStringify(query.params)}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `${context}\n\nSuggest likely causes, indexing or query-shape improvements, and what to inspect next. Keep recommendations grounded in the query details above.`;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
