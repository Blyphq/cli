import { useEffect } from "react";

import { DeliveryStatusPanel } from "@/components/studio/delivery-status-panel";
import { DeliveryStatusSidebarCard } from "@/components/studio/delivery-status-sidebar-card";
import { AssistantSheet } from "@/components/studio/assistant-sheet";
import { EmptyState } from "@/components/studio/empty-state";
import { ErrorState } from "@/components/studio/error-state";
import { GroupDetailPanel } from "@/components/studio/group-detail-panel";
import { LogDetailPanel } from "@/components/studio/log-detail-panel";
import { LogFilesPanel } from "@/components/studio/log-files-panel";
import { LogList } from "@/components/studio/log-list";
import { ProjectConfigPanel } from "@/components/studio/project-config-panel";
import { StudioShell } from "@/components/studio/studio-shell";
import { StudioToolbar } from "@/components/studio/studio-toolbar";
import { useAssistantChat } from "@/hooks/use-assistant-chat";
import {
  DEFAULT_FILTERS,
  useStudioFiltersAndSelection,
  useSyncSelectionFromEntries,
} from "@/hooks";
import { useStudioData } from "@/hooks";

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
    draftProjectPath,
    setDraftProjectPath,
  } = useStudioFiltersAndSelection(projectPath);

  const studioData = useStudioData({
    projectPath,
    filters,
    offset,
    grouping,
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

  useSyncSelectionFromEntries(entries, selection, setSelection);

  useEffect(() => {
    setOffset(0);
  }, [
    filters.level,
    filters.type,
    deferredSearch,
    filters.fileId,
    filters.from,
    filters.to,
    projectPath,
    grouping,
    setOffset,
  ]);

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
  const selectedConnectorKey =
    selection?.kind === "delivery" ? selection.connectorKey : undefined;

  const describePrompt =
    "Describe the selected log or structured group like an observability copilot. Explain what happened, likely cause, related signals, and what to inspect next.";

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
            <DeliveryStatusSidebarCard
              deliveryStatus={studioData.deliveryStatusQuery.data}
              loading={studioData.deliveryStatusQuery.isLoading}
              onOpen={(connectorKey) => {
                setSelection({ kind: "delivery", connectorKey });
              }}
            />
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
          ) : selection?.kind === "delivery" ? (
            <DeliveryStatusPanel
              deliveryStatus={studioData.deliveryStatusQuery.data}
              loading={studioData.deliveryStatusQuery.isLoading}
              activeConnectorKey={selectedConnectorKey}
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
              onSelect={setSelection}
              onPageChange={setOffset}
            />
          )
        }
        detail={
          selection?.kind === "delivery" ? (
            <EmptyState
              title="Delivery panel open"
              description="Connector delivery status is shown in the main panel."
              size="compact"
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
