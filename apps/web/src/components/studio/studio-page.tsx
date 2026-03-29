import { useEffect, useState } from "react";

import { BackgroundJobDetailPanel } from "@/components/studio/background-job-detail-panel";
import { BackgroundJobsView } from "@/components/studio/background-jobs-view";
import { ErrorsView } from "@/components/studio/errors-view";
import { AuthView } from "@/components/studio/auth-view";
import { AssistantSheet } from "@/components/studio/assistant-sheet";
import { DatabaseView } from "@/components/studio/database-view";
import { EmptyState } from "@/components/studio/empty-state";
import { ErrorDetailPanel } from "@/components/studio/error-detail-panel";
import { ErrorState } from "@/components/studio/error-state";
import { GroupDetailPanel } from "@/components/studio/group-detail-panel";
import { HttpView } from "@/components/studio/http-view";
import { LogDetailPanel } from "@/components/studio/log-detail-panel";
import { LogFilesPanel } from "@/components/studio/log-files-panel";
import { LogList } from "@/components/studio/log-list";
import { ProjectConfigPanel } from "@/components/studio/project-config-panel";
import { OverviewView } from "@/components/studio/overview-view";
import { PaymentsView } from "@/components/studio/payments-view";
import { SectionNavPanel } from "@/components/studio/section-nav-panel";
import { StudioShell } from "@/components/studio/studio-shell";
import { StudioToolbar } from "@/components/studio/studio-toolbar";
import { useAssistantChat } from "@/hooks/use-assistant-chat";
import {
  useErrorSessionState,
  DEFAULT_FILTERS,
  DEFAULT_HTTP_UI,
  useStudioFiltersAndSelection,
  useSyncErrorSelectionFromEntries,
  useSyncSelectionFromEntries,
} from "@/hooks";
import { useStudioData } from "@/hooks";
import {
  isAuthSection,
  isBackgroundSection,
  isDatabaseSection,
  isErrorsSection,
  isHttpSection,
  isOverviewSection,
  isPaymentsSection,
} from "@/lib/studio";
import { formatDurationMs } from "@/lib/studio";

export interface StudioPageProps {
  navigate: (opts: { search: { project?: string } }) => void;
  search: { project?: string };
}

export function StudioPage({ navigate, search }: StudioPageProps) {
  const projectPath = search.project ?? "";
  const [overviewConnectedAt, setOverviewConnectedAt] = useState(() =>
    new Date().toISOString(),
  );
  const [expandedBackgroundRunId, setExpandedBackgroundRunId] = useState<string | null>(null);
  const [expandedPaymentTraceId, setExpandedPaymentTraceId] = useState<string | null>(null);
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
    httpUi,
    setHttpUi,
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
    httpUi,
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
    !isOverviewSection(section) &&
    !isAuthSection(section) &&
    !isDatabaseSection(section) &&
    !isBackgroundSection(section) &&
    !isPaymentsSection(section) &&
    !isHttpSection(section) &&
    !isErrorsSection(section);
  useSyncSelectionFromEntries(entries, selection, setSelection, shouldSyncSelection);
  useSyncErrorSelectionFromEntries(
    studioData.errorsQuery.data?.entries ?? [],
    selection,
    setSelection,
    errorUi.view === "grouped",
    isErrorsSection(section),
  );

  useEffect(() => {
    if (!isHttpSection(section)) {
      return;
    }

    if (studioData.httpQuery.isLoading && !studioData.httpQuery.data) {
      return;
    }

    const requests = studioData.httpQuery.data?.requests ?? [];
    if (requests.length === 0) {
      setSelection(null);
      return;
    }

    const hasMatchingSelection =
      selection?.kind === "record" &&
      requests.some((request) => request.recordId === selection.id);

    if (!hasMatchingSelection) {
      setSelection({ kind: "record", id: requests[0]!.recordId });
    }
  }, [
    section,
    selection,
    setSelection,
    studioData.httpQuery.isLoading,
    studioData.httpQuery.data,
  ]);

  useEffect(() => {
    setOverviewConnectedAt(new Date().toISOString());
  }, [projectPath]);

  useEffect(() => {
    setOffset(0);
    setExpandedBackgroundRunId(null);
    setExpandedPaymentTraceId(null);
    if (section === "overview") {
      setOverviewConnectedAt(new Date().toISOString());
    }
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
    httpUi.method,
    httpUi.statusGroup,
    httpUi.route,
    httpUi.minDurationMs,
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
  const selectedBackgroundRun =
    selection?.kind === "background-run" ? studioData.selectedBackgroundRun : null;
  const selectedPaymentTrace =
    selection?.kind === "payment-trace" ? studioData.selectedPaymentTrace : null;
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

  const handleAskAiOnPaymentTrace = (trace = studioData.paymentTraceQuery.data?.trace) => {
    if (!trace) {
      return;
    }

    setSection("payments");
    setSelection({ kind: "payment-trace", id: trace.id });
    assistant.createSelectionChatAndSubmit(
      [
        "Diagnose this failed checkout/payment trace.",
        `Trace: ${trace.correlationLabel}`,
        `Trace ID: ${trace.id}`,
        `Status: ${trace.status}`,
        trace.userId ? `User ID: ${trace.userId}` : null,
        trace.amount ? `Amount: ${trace.amount.display}` : null,
        trace.durationMs != null ? `Duration: ${formatDurationMs(trace.durationMs)}` : null,
        trace.failureReason ? `Failure reason: ${trace.failureReason}` : null,
        `Webhook events: ${trace.webhookEventCount}`,
        "Use the full selected trace to identify the failing step, missing confirmation signals, likely root cause, and the smallest defensible fix.",
      ]
        .filter(Boolean)
        .join("\n\n"),
    );
  };

  const handleOpenOverviewTarget = (
    target: NonNullable<
      NonNullable<typeof studioData.overviewQuery.data>["liveFeed"][number]["target"]
    > | null,
  ) => {
    if (!target) {
      return;
    }

    setSection(target.sectionId);
    setSelection(target.selection);
  };

  const handleViewOverviewTrace = (
    item: NonNullable<typeof studioData.overviewQuery.data>["recentErrors"][number],
  ) => {
    if (item.traceReference) {
      setGrouping("grouped");
      setSection(item.traceReference.sectionId);
      setSelection(item.traceReference.selection);
      return;
    }

    setSection("errors");
    setSelection({ kind: "error-group", id: item.groupId });
  };

  const handleAskAiForOverviewError = (
    item: NonNullable<typeof studioData.overviewQuery.data>["recentErrors"][number],
  ) => {
    setSection("errors");
    setSelection({ kind: "error-occurrence", id: item.recordId });

    const prompt = [
      "Help me investigate this recent Studio error.",
      `Message: ${item.message}`,
      item.sourceFile
        ? `Source: ${item.sourceFile}${item.sourceLine ? `:${item.sourceLine}` : ""}`
        : null,
      item.timestamp ? `Last seen: ${item.timestamp}` : null,
      "Explain the likely cause, what to inspect next, and suggest a concrete fix if the signal is sufficient.",
    ]
      .filter(Boolean)
      .join("\n\n");

    assistant.createSelectionChatAndSubmit(prompt);
  };

  const handleViewHttpTrace = (traceGroupId: string) => {
    setGrouping("grouped");
    setSection("all-logs");
    setSelection({ kind: "group", id: traceGroupId });
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
                studioData.overviewQuery.error?.message ??
                studioData.authQuery.error?.message ??
                studioData.backgroundJobsQuery.error?.message ??
                studioData.httpQuery.error?.message ??
                studioData.backgroundJobRunQuery.error?.message ??
                studioData.paymentsQuery.error?.message ??
                studioData.paymentTraceQuery.error?.message ??
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
              overview={studioData.overviewQuery.data}
              connectedAt={overviewConnectedAt}
              onSelect={setSection}
              onSelectFeedTarget={handleOpenOverviewTarget}
              onViewTrace={handleViewOverviewTrace}
              onAskAiForError={handleAskAiForOverviewError}
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
          ) : isHttpSection(section) ? (
            <HttpView
              page={studioData.httpQuery.data}
              loading={studioData.httpQuery.isLoading}
              selectedRecordId={selection?.kind === "record" ? selection.id : null}
              httpUi={httpUi}
              onHttpUiChange={setHttpUi}
              onResetHttpFilters={() => setHttpUi(DEFAULT_HTTP_UI)}
              onSelectRecord={(recordId) => setSelection({ kind: "record", id: recordId })}
              onPageChange={setOffset}
              onSelectRoute={(route) => {
                setOffset(0);
                setHttpUi((current) => ({ ...current, route }));
              }}
              onViewTrace={handleViewHttpTrace}
            />
          ) : isPaymentsSection(section) ? (
            <PaymentsView
              page={studioData.paymentsQuery.data}
              loading={studioData.paymentsQuery.isLoading}
              selectedTraceId={selection?.kind === "payment-trace" ? selection.id : null}
              expandedTraceId={expandedPaymentTraceId}
              expandedTraceDetail={
                expandedPaymentTraceId &&
                selection?.kind === "payment-trace" &&
                expandedPaymentTraceId === selection.id
                  ? studioData.paymentTraceQuery.data
                  : null
              }
              expandedTraceLoading={
                Boolean(expandedPaymentTraceId) &&
                selection?.kind === "payment-trace" &&
                expandedPaymentTraceId === selection.id &&
                studioData.paymentTraceQuery.isLoading
              }
              onSelectTrace={(traceId) => {
                setExpandedPaymentTraceId(null);
                setSelection({ kind: "payment-trace", id: traceId });
              }}
              onToggleExpand={(traceId) => {
                const nextExpandedTraceId =
                  expandedPaymentTraceId === traceId ? null : traceId;
                setExpandedPaymentTraceId(nextExpandedTraceId);
                if (nextExpandedTraceId) {
                  setSelection({ kind: "payment-trace", id: nextExpandedTraceId });
                }
              }}
              onAskAi={handleAskAiOnPaymentTrace}
            />
          ) : isBackgroundSection(section) ? (
            <BackgroundJobsView
              page={studioData.backgroundJobsQuery.data}
              loading={studioData.backgroundJobsQuery.isLoading}
              selectedRunId={selection?.kind === "background-run" ? selection.id : null}
              expandedRunId={expandedBackgroundRunId}
              expandedRunDetail={
                expandedBackgroundRunId &&
                selection?.kind === "background-run" &&
                expandedBackgroundRunId === selection.id
                  ? studioData.backgroundJobRunQuery.data
                  : null
              }
              expandedRunLoading={
                Boolean(expandedBackgroundRunId) &&
                selection?.kind === "background-run" &&
                expandedBackgroundRunId === selection.id &&
                studioData.backgroundJobRunQuery.isLoading
              }
              onSelectRun={(runId) => {
                setExpandedBackgroundRunId(null);
                setSelection({ kind: "background-run", id: runId });
              }}
              onToggleExpand={(runId) => {
                const nextExpandedRunId =
                  expandedBackgroundRunId === runId ? null : runId;
                setExpandedBackgroundRunId(nextExpandedRunId);
                if (nextExpandedRunId) {
                  setSelection({ kind: "background-run", id: nextExpandedRunId });
                }
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
          isOverviewSection(section) ? null :
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
            selection?.kind === "background-run" ? (
              <BackgroundJobDetailPanel
                detail={selectedBackgroundRun}
                loading={studioData.backgroundJobRunQuery.isLoading}
                onAskAi={handleAskAiOnBackgroundRun}
              />
            ) : selection?.kind === "payment-trace" ? (
              <div className="space-y-4">
                <EmptyState
                  title={selectedPaymentTrace?.trace.correlationLabel ?? "Select a payment trace"}
                  description={
                    selectedPaymentTrace
                      ? `Status ${selectedPaymentTrace.trace.status}. Expand the trace in the Payments view to inspect the full timeline or ask AI for diagnosis.`
                      : "Choose a payment trace to inspect its lifecycle."
                  }
                  size="compact"
                  action={
                    selectedPaymentTrace &&
                    (selectedPaymentTrace.trace.status === "DECLINED" ||
                      selectedPaymentTrace.trace.status === "ERROR") ? (
                      <button
                        type="button"
                        className="text-xs font-medium text-primary"
                        onClick={() => handleAskAiOnPaymentTrace(selectedPaymentTrace.trace)}
                      >
                        Ask AI
                      </button>
                    ) : undefined
                  }
                />
              </div>
            ) : selection?.kind === "error-occurrence" ? (
              <ErrorDetailPanel
                group={null}
                occurrence={
                  studioData.errorsQuery.data?.occurrences.find(
                    (item) => item.id === selection.id,
                  ) ?? null
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
    params?: unknown;
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
