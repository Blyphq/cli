import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { DefaultChatTransport } from "ai";
import { useChat } from "@ai-sdk/react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

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
import {
  type AssistantScopeMode,
  useStudioAssistantStore,
} from "@/lib/studio-assistant-store";
import type {
  StudioAssistantReference,
  StudioChatMessage,
  StudioFilters,
  StudioGroupingMode,
  StudioSelection,
} from "@/lib/studio";
import { getMessageText, isGroupEntry } from "@/lib/studio";
import { useTRPC, useTRPCClient } from "@/utils/trpc";

export const Route = createFileRoute("/")({
  validateSearch: z.object({
    project: z.string().optional(),
  }),
  component: StudioRoute,
});

const DEFAULT_FILTERS: StudioFilters = {
  level: "",
  type: "",
  search: "",
  fileId: "",
  from: "",
  to: "",
};

function StudioRoute() {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  const projectPath = search.project ?? "";
  const [draftProjectPath, setDraftProjectPath] = useState(projectPath);
  const [filters, setFilters] = useState<StudioFilters>(DEFAULT_FILTERS);
  const [selection, setSelection] = useState<StudioSelection>(null);
  const [offset, setOffset] = useState(0);
  const [grouping, setGrouping] = useState<StudioGroupingMode>("grouped");
  const [pendingPrompt, setPendingPrompt] = useState<{
    chatId: string;
    content: string;
    model?: string;
    mode: "chat" | "describe-selection";
  } | null>(null);
  const loadingChatIdRef = useRef<string | null>(null);
  const titleRequestChatIdRef = useRef<string | null>(null);
  const deferredSearch = useDeferredValue(filters.search);
  const hasHydrated = useStudioAssistantStore((state) => state.hasHydrated);
  const workspace = useStudioAssistantStore((state) =>
    projectPath ? state.workspacesByProject[projectPath] ?? null : null,
  );
  const ensureWorkspace = useStudioAssistantStore((state) => state.ensureWorkspace);
  const createChat = useStudioAssistantStore((state) => state.createChat);
  const setActiveChat = useStudioAssistantStore((state) => state.setActiveChat);
  const setAssistantOpen = useStudioAssistantStore((state) => state.setAssistantOpen);
  const updateChatDraft = useStudioAssistantStore((state) => state.updateChatDraft);
  const updateChatMessages = useStudioAssistantStore((state) => state.updateChatMessages);
  const setChatTitle = useStudioAssistantStore((state) => state.setChatTitle);
  const updateChatModel = useStudioAssistantStore((state) => state.updateChatModel);
  const updateChatScopeMode = useStudioAssistantStore(
    (state) => state.updateChatScopeMode,
  );
  const resetChat = useStudioAssistantStore((state) => state.resetChat);
  const generateChatTitle = useStudioAssistantStore(
    (state) => state.generateChatTitle,
  );

  useEffect(() => {
    setDraftProjectPath(projectPath);
  }, [projectPath]);

  const metaQuery = useQuery(trpc.studio.meta.queryOptions({ projectPath }));

  const configQuery = useQuery({
    ...trpc.studio.config.queryOptions({ projectPath }),
    enabled: metaQuery.isSuccess && metaQuery.data.project.valid,
  });

  const filesQuery = useQuery({
    ...trpc.studio.files.queryOptions({ projectPath }),
    enabled: metaQuery.isSuccess && metaQuery.data.project.valid,
  });

  const facetsQuery = useQuery({
    ...trpc.studio.facets.queryOptions({
      projectPath,
      level: filters.level || undefined,
      search: deferredSearch || undefined,
      fileId: filters.fileId || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
    }),
    enabled: metaQuery.isSuccess && metaQuery.data.project.valid,
  });

  const logsQuery = useQuery({
    ...trpc.studio.logs.queryOptions({
      projectPath,
      offset,
      limit: 100,
      grouping,
      level: filters.level || undefined,
      type: filters.type || undefined,
      search: deferredSearch || undefined,
      fileId: filters.fileId || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
    }),
    enabled: metaQuery.isSuccess && metaQuery.data.project.valid,
  });

  const groupQuery = useQuery({
    ...trpc.studio.group.queryOptions({
      projectPath,
      groupId: selection?.kind === "group" ? selection.id : "",
    }),
    enabled:
      metaQuery.isSuccess &&
      metaQuery.data.project.valid &&
      selection?.kind === "group",
  });

  const recordQuery = useQuery({
    ...trpc.studio.record.queryOptions({
      projectPath,
      recordId: selection?.kind === "record" ? selection.id : "",
    }),
    enabled:
      metaQuery.isSuccess &&
      metaQuery.data.project.valid &&
      selection?.kind === "record",
  });
  const recordSourceQuery = useQuery({
    ...trpc.studio.recordSource.queryOptions({
      projectPath,
      recordId: selection?.kind === "record" ? selection.id : "",
    }),
    enabled:
      metaQuery.isSuccess &&
      metaQuery.data.project.valid &&
      selection?.kind === "record",
  });

  const assistantStatusQuery = useQuery(
    trpc.studio.assistantStatus.queryOptions({ projectPath }),
  );
  const activeChat = workspace?.activeChatId
    ? workspace.chatsById[workspace.activeChatId] ?? null
    : null;
  const activeChatId = activeChat?.id ?? null;
  const assistantDraft = activeChat?.draft ?? "";
  const assistantOpen = hasHydrated ? workspace?.assistantOpen ?? false : false;
  const assistantScopeMode = activeChat?.scopeMode ?? "standalone";
  const selectedModel = activeChat?.selectedModel ?? "";
  const assistantChatId = activeChatId ?? "studio-assistant-transient";
  const assistantTransport = useMemo(
    () =>
      new DefaultChatTransport<StudioChatMessage>({
        api: "/api/chat",
        body: {
          projectPath,
          filters: {
            level: filters.level || undefined,
            type: filters.type || undefined,
            search: deferredSearch || undefined,
            fileId: filters.fileId || undefined,
            from: filters.from || undefined,
            to: filters.to || undefined,
          },
          selectedRecordId:
            assistantScopeMode === "selection" && selection?.kind === "record"
              ? selection.id
              : undefined,
          selectedGroupId:
            assistantScopeMode === "selection" && selection?.kind === "group"
              ? selection.id
              : undefined,
          model: selectedModel || undefined,
        },
      }),
    [
      deferredSearch,
      filters.fileId,
      filters.from,
      filters.level,
      filters.to,
      filters.type,
      projectPath,
      selectedModel,
      assistantScopeMode,
      selection,
    ],
  );
  const {
    clearError: clearAssistantError,
    error: assistantError,
    messages,
    sendMessage,
    setMessages,
    status: assistantStatus,
    stop: stopAssistant,
  } = useChat<StudioChatMessage>({
    id: assistantChatId,
    transport: assistantTransport,
    experimental_throttle: 50,
  });

  const files = filesQuery.data?.files ?? [];
  const entries = logsQuery.data?.entries ?? [];
  const selectedRecord = selection?.kind === "record" ? recordQuery.data ?? null : null;
  const selectedGroup = selection?.kind === "group" ? groupQuery.data ?? null : null;
  const isLoadingMeta = !metaQuery.data && metaQuery.isLoading;
  const isProjectInvalid = Boolean(metaQuery.data && !metaQuery.data.project.valid);
  const projectError =
    metaQuery.data?.project.error ?? "Studio could not inspect the requested path.";
  const hasLogsError =
    filesQuery.isError ||
    logsQuery.isError ||
    groupQuery.isError ||
    recordQuery.isError;
  const hasBackendError = metaQuery.isError || configQuery.isError || hasLogsError;
  const fallbackModel =
    assistantStatusQuery.data?.model ??
    assistantStatusQuery.data?.availableModels[0] ??
    "";
  const chatSessions = useMemo(
    () =>
      workspace
        ? Object.values(workspace.chatsById)
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
            .map((chat) => ({
              id: chat.id,
              title: chat.title,
              updatedAt: chat.updatedAt,
            }))
        : [],
    [workspace],
  );
  const scopeLabel =
    assistantScopeMode === "standalone"
      ? "current filters"
      : selection?.kind === "record"
        ? "selected log"
        : selection?.kind === "group"
          ? "selected structured group"
          : "no selection";

  useEffect(() => {
    if (!hasHydrated || !projectPath) {
      return;
    }

    ensureWorkspace(projectPath);
  }, [ensureWorkspace, hasHydrated, projectPath]);

  useEffect(() => {
    if (!hasHydrated || !projectPath || !activeChat || !assistantStatusQuery.data) {
      return;
    }

    if (!fallbackModel) {
      return;
    }

    if (
      activeChat.selectedModel &&
      assistantStatusQuery.data.availableModels.includes(activeChat.selectedModel)
    ) {
      return;
    }

    updateChatModel(projectPath, activeChat.id, fallbackModel);
  }, [
    activeChat,
    assistantStatusQuery.data,
    fallbackModel,
    hasHydrated,
    projectPath,
    updateChatModel,
  ]);

  useEffect(() => {
    if (!hasHydrated || !activeChat) {
      return;
    }

    loadingChatIdRef.current = activeChat.id;
    setMessages(activeChat.messages);
  }, [activeChat?.id, hasHydrated, setMessages]);

  useEffect(() => {
    if (!hasHydrated || !projectPath || !activeChatId) {
      return;
    }

    if (loadingChatIdRef.current === activeChatId) {
      loadingChatIdRef.current = null;
      return;
    }

    updateChatMessages(projectPath, activeChatId, messages);
  }, [
    activeChatId,
    hasHydrated,
    messages,
    projectPath,
    updateChatMessages,
  ]);

  useEffect(() => {
    if (!hasHydrated || !projectPath || !activeChatId || activeChat?.title !== "New chat") {
      return;
    }

    const firstUserMessage = messages.find(
      (message) => message.role === "user" && getMessageText(message),
    );
    const prompt = firstUserMessage ? getMessageText(firstUserMessage) : "";

    if (!prompt || titleRequestChatIdRef.current === activeChatId) {
      return;
    }

    titleRequestChatIdRef.current = activeChatId;
    let cancelled = false;

    const run = async () => {
      try {
        const result = await trpcClient.studio.generateChatTitle.mutate({
          projectPath,
          prompt,
        });

        if (!cancelled) {
          setChatTitle(projectPath, activeChatId, result.title);
        }
      } catch {
        if (!cancelled) {
          generateChatTitle(projectPath, activeChatId);
        }
      } finally {
        if (!cancelled && titleRequestChatIdRef.current === activeChatId) {
          titleRequestChatIdRef.current = null;
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      if (titleRequestChatIdRef.current === activeChatId) {
        titleRequestChatIdRef.current = null;
      }
    };
  }, [
    activeChat?.title,
    activeChatId,
    generateChatTitle,
    hasHydrated,
    messages,
    projectPath,
    setChatTitle,
    trpcClient,
  ]);

  useEffect(() => {
    if (!logsQuery.data?.entries.length) {
      setSelection(null);
      return;
    }

    if (!selection || !logsQuery.data.entries.some((entry) => entry.id === selection.id)) {
      const firstEntry = logsQuery.data.entries[0];
      if (!firstEntry) {
        setSelection(null);
        return;
      }

      setSelection(
        isGroupEntry(firstEntry)
          ? { kind: "group", id: firstEntry.id }
          : { kind: "record", id: firstEntry.id },
      );
    }
  }, [logsQuery.data?.entries, selection]);

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
  ]);

  useEffect(() => {
    if (
      !pendingPrompt ||
      !hasHydrated ||
      !projectPath ||
      !activeChatId ||
      pendingPrompt.chatId !== activeChatId
    ) {
      return;
    }

    let cancelled = false;

    const run = async () => {
      await sendMessage(
        {
          text: pendingPrompt.content,
        },
        {
          body: {
            mode: pendingPrompt.mode,
            model: pendingPrompt.model,
          },
        },
      );

      if (!cancelled) {
        updateChatDraft(projectPath, activeChatId, "");
        setPendingPrompt(null);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [
    activeChatId,
    hasHydrated,
    pendingPrompt,
    projectPath,
    sendMessage,
    updateChatDraft,
  ]);

  const handleReferenceSelect = (reference: StudioAssistantReference) => {
    setSelection({
      kind: reference.kind === "group" ? "group" : "record",
      id: reference.id,
    });
  };

  const openAssistant = () => {
    if (!projectPath) {
      return;
    }

    setAssistantOpen(projectPath, true);
  };

  const closeAssistant = () => {
    if (!projectPath) {
      return;
    }

    setAssistantOpen(projectPath, false);
  };

  const isBlankStandaloneChat = () =>
    Boolean(
      activeChat &&
        activeChat.scopeMode === "standalone" &&
        activeChat.messages.length === 0 &&
        activeChat.draft.trim().length === 0,
    );

  const submitAssistantPrompt = async (
    content: string,
    mode: "chat" | "describe-selection" = "chat",
    options?: {
      scopeMode?: AssistantScopeMode;
      chatId?: string;
      resetConversation?: boolean;
    },
  ) => {
    if (!projectPath || !activeChatId) {
      return;
    }

    const value = content.trim();
    if (!value) {
      return;
    }

    const scopeMode = options?.scopeMode ?? assistantScopeMode;
    const targetChatId = options?.chatId ?? activeChatId;

    if (options?.resetConversation) {
      resetChat(projectPath, targetChatId, { scopeMode });
      if (targetChatId === activeChatId) {
        setMessages([]);
      }
    }

    updateChatScopeMode(projectPath, targetChatId, scopeMode);
    clearAssistantError();
    setAssistantOpen(projectPath, true);

    if (targetChatId !== activeChatId) {
      setPendingPrompt({
        chatId: targetChatId,
        content: value,
        model: selectedModel || undefined,
        mode,
      });
      return;
    }

    await sendMessage(
      {
        text: value,
      },
      {
        body: {
          mode,
          model: selectedModel || undefined,
        },
      },
    );
    updateChatDraft(projectPath, targetChatId, "");
  };

  const createStandaloneChat = () => {
    if (!projectPath) {
      return;
    }

    stopAssistant();
    clearAssistantError();
    ensureWorkspace(projectPath);

    if (isBlankStandaloneChat()) {
      setAssistantOpen(projectPath, true);
      return;
    }

    const chatId = createChat(projectPath, { scopeMode: "standalone" });
    if (!chatId) {
      return;
    }

    if (fallbackModel) {
      updateChatModel(projectPath, chatId, fallbackModel);
    }

    setAssistantOpen(projectPath, true);
  };

  const createSelectionChatAndSubmit = (prompt: string) => {
    if (!projectPath) {
      return;
    }

    stopAssistant();
    clearAssistantError();
    ensureWorkspace(projectPath);

    const chatId = createChat(projectPath, { scopeMode: "selection" });
    if (!chatId) {
      return;
    }

    if (fallbackModel) {
      updateChatModel(projectPath, chatId, fallbackModel);
    }

    updateChatScopeMode(projectPath, chatId, "selection");
    setAssistantOpen(projectPath, true);
    setPendingPrompt({
      chatId,
      content: prompt,
      model: fallbackModel || undefined,
      mode: "describe-selection",
    });
  };

  const switchAssistantChat = (chatId: string) => {
    if (!projectPath || !chatId) {
      return;
    }

    stopAssistant();
    clearAssistantError();
    setActiveChat(projectPath, chatId);
    setAssistantOpen(projectPath, true);
  };

  const handleDescribeSelection = (prompt: string) => {
    if (!selection) {
      return;
    }

    if (assistantScopeMode === "standalone") {
      createSelectionChatAndSubmit(prompt);
      return;
    }

    void submitAssistantPrompt(prompt, "describe-selection", {
      scopeMode: "selection",
    });
  };

  return (
    <>
      <StudioShell
        toolbar={
          <StudioToolbar
            draftProjectPath={draftProjectPath}
            facets={facetsQuery.data}
            filters={filters}
            grouping={grouping}
            meta={metaQuery.data}
            files={files}
            onDraftProjectPathChange={setDraftProjectPath}
            onInspect={() =>
              navigate({
                search: {
                  project: draftProjectPath || undefined,
                },
              })
            }
            onStartStandaloneChat={createStandaloneChat}
            onFilterChange={setFilters}
            onGroupingChange={setGrouping}
            onResetFilters={() => setFilters(DEFAULT_FILTERS)}
          />
        }
        sidebar={
          <>
            {metaQuery.data ? (
              <ProjectConfigPanel meta={metaQuery.data} config={configQuery.data} />
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
                onSelectFile={(fileId) =>
                  setFilters((current) => ({ ...current, fileId }))
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
            <ErrorState title="Target project is invalid" description={projectError} />
          ) : isLoadingMeta ? (
            <EmptyState
              title="Loading Studio"
              description="Resolving project metadata, config, and logs."
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
          selection?.kind === "group" ? (
            <GroupDetailPanel
              group={selectedGroup}
              loading={groupQuery.isLoading}
              onDescribeWithAi={() => {
                handleDescribeSelection(
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
                handleDescribeSelection(
                  "Describe the selected log like an observability copilot. Explain what happened, likely cause, related signals, and what to inspect next.",
                );
              }}
            />
          )
        }
      />
      {hasBackendError || isProjectInvalid || isLoadingMeta ? null : (
        <AssistantSheet
          open={assistantOpen}
          activeChatId={activeChatId}
          canDescribeSelection={selection !== null}
          chatError={assistantError}
          chatSessions={chatSessions}
          draft={assistantDraft}
          messages={messages}
          model={selectedModel}
          scopeLabel={scopeLabel}
          statusState={assistantStatus}
          status={assistantStatusQuery.data}
          onCreateChat={createStandaloneChat}
          onDraftChange={(value) => {
            if (!projectPath || !activeChatId) {
              return;
            }

            updateChatDraft(projectPath, activeChatId, value);
          }}
          onModelChange={(value) => {
            if (!projectPath || !activeChatId) {
              return;
            }

            updateChatModel(projectPath, activeChatId, value);
          }}
          onDescribeSelection={() => {
            handleDescribeSelection(
              "Describe the selected log or structured group like an observability copilot. Explain what happened, likely cause, related signals, and what to inspect next.",
            );
          }}
          onOpenChange={(next) => {
            if (next) {
              openAssistant();
              return;
            }

            closeAssistant();
          }}
          onQuickAction={(prompt) => {
            void submitAssistantPrompt(prompt, "chat", {
              scopeMode: assistantScopeMode,
            });
          }}
          onReferenceSelect={handleReferenceSelect}
          onSelectChat={switchAssistantChat}
          onSend={() => {
            void submitAssistantPrompt(assistantDraft, "chat", {
              scopeMode: assistantScopeMode,
            });
          }}
          onStop={stopAssistant}
        />
      )}
    </>
  );
}
