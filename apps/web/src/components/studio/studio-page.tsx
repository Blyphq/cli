import { useEffect } from "react";

import { AuthView } from "@/components/studio/auth-view";
import { AssistantSheet } from "@/components/studio/assistant-sheet";
import { EmptyState } from "@/components/studio/empty-state";
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
  DEFAULT_FILTERS,
  useStudioFiltersAndSelection,
  useSyncSelectionFromEntries,
} from "@/hooks";
import { useStudioData } from "@/hooks";
import {
  isAllLogsSection,
  isAuthSection,
  isOverviewSection,
} from "@/lib/studio";

export interface StudioPageProps {
  navigate: (opts: { search: { project?: string } }) => void;
  search: { project?: string };
}

export function StudioPage({ navigate, search }: StudioPageProps) {
  const projectPath = search.project ?? "";

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
    !isOverviewSection(section) && !isAuthSection(section);
  useSyncSelectionFromEntries(entries, selection, setSelection, shouldSyncSelection);

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
    setOffset,
  ]);

  useEffect(() => {
    const validSections = new Set([
      "overview",
      "all-logs",
      ...(studioData.metaQuery.data?.sections.map((item) => item.id) ?? []),
    ]);
    if (!validSections.has(section)) {
      setSection("overview");
    }
  }, [section, setSection, studioData.metaQuery.data?.sections]);

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

  const describePrompt =
    "Describe the selected log or structured group like an observability copilot. Explain what happened, likely cause, related signals, and what to inspect next.";
  const currentSectionLabel =
    section === "all-logs"
      ? "All Logs"
      : metaQuery.data?.sections.find((item) => item.id === section)?.label ?? "Section";

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
