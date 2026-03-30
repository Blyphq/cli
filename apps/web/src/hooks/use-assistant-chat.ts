import { DefaultChatTransport } from "ai";
import { useChat } from "@ai-sdk/react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  type AssistantScopeMode,
  useStudioAssistantStore,
} from "@/lib/studio-assistant-store";
import type {
  StudioAssistantReference,
  StudioChatMessage,
  StudioFilters,
  StudioSelection,
} from "@/lib/studio";
import { getMessageText } from "@/lib/studio";
import type { StudioAssistantStatus } from "@/lib/studio";
import { useTRPCClient } from "@/utils/trpc";

export interface UseAssistantChatParams {
  projectPath: string;
  filters: StudioFilters;
  deferredSearch: string;
  selection: StudioSelection;
  fallbackModel: string;
  assistantStatusData: StudioAssistantStatus | undefined;
}

export function useAssistantChat({
  projectPath,
  filters,
  deferredSearch,
  selection,
  fallbackModel,
  assistantStatusData,
}: UseAssistantChatParams) {
  const trpcClient = useTRPCClient();
  const [pendingPrompt, setPendingPrompt] = useState<{
    chatId: string;
    content: string;
    model?: string;
    mode: "chat" | "describe-selection";
  } | null>(null);
  const loadingChatIdRef = useRef<string | null>(null);
  const titleRequestChatIdRef = useRef<string | null>(null);

  const hasHydrated = useStudioAssistantStore((state) => state.hasHydrated);
  const workspace = useStudioAssistantStore((state) =>
    projectPath ? state.workspacesByProject[projectPath] ?? null : null,
  );
  const ensureWorkspace = useStudioAssistantStore((state) => state.ensureWorkspace);
  const createChat = useStudioAssistantStore((state) => state.createChat);
  const setActiveChat = useStudioAssistantStore((state) => state.setActiveChat);
  const setAssistantOpen = useStudioAssistantStore((state) => state.setAssistantOpen);
  const updateChatDraft = useStudioAssistantStore((state) => state.updateChatDraft);
  const updateChatMessages = useStudioAssistantStore(
    (state) => state.updateChatMessages,
  );
  const setChatTitle = useStudioAssistantStore((state) => state.setChatTitle);
  const updateChatModel = useStudioAssistantStore((state) => state.updateChatModel);
  const updateChatScopeMode = useStudioAssistantStore(
    (state) => state.updateChatScopeMode,
  );
  const resetChat = useStudioAssistantStore((state) => state.resetChat);
  const generateChatTitle = useStudioAssistantStore(
    (state) => state.generateChatTitle,
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
          selectedBackgroundRunId:
            assistantScopeMode === "selection" && selection?.kind === "background-run"
              ? selection.id
              : undefined,
          selectedPaymentTraceId:
            assistantScopeMode === "selection" && selection?.kind === "payment-trace"
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
          : selection?.kind === "background-run"
            ? "selected background run"
            : selection?.kind === "payment-trace"
              ? "selected payment trace"
              : "no selection";

  useEffect(() => {
    if (!hasHydrated || !projectPath) return;
    ensureWorkspace(projectPath);
  }, [ensureWorkspace, hasHydrated, projectPath]);

  useEffect(() => {
    if (
      !hasHydrated ||
      !projectPath ||
      !activeChat ||
      !assistantStatusData ||
      !fallbackModel
    )
      return;
    if (
      activeChat.selectedModel &&
      assistantStatusData.availableModels.includes(activeChat.selectedModel)
    )
      return;
    updateChatModel(projectPath, activeChat.id, fallbackModel);
  }, [
    activeChat,
    assistantStatusData,
    fallbackModel,
    hasHydrated,
    projectPath,
    updateChatModel,
  ]);

  useEffect(() => {
    if (!hasHydrated || !activeChat) return;
    loadingChatIdRef.current = activeChat.id;
    setMessages(activeChat.messages);
  }, [activeChat?.id, hasHydrated, setMessages]);

  useEffect(() => {
    if (!hasHydrated || !projectPath || !activeChatId) return;
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
    if (
      !hasHydrated ||
      !projectPath ||
      !activeChatId ||
      activeChat?.title !== "New chat"
    )
      return;
    const firstUserMessage = messages.find(
      (m) => m.role === "user" && getMessageText(m),
    );
    const prompt = firstUserMessage ? getMessageText(firstUserMessage) : "";
    if (!prompt || titleRequestChatIdRef.current === activeChatId) return;
    titleRequestChatIdRef.current = activeChatId;
    let cancelled = false;
    const run = async () => {
      try {
        const result = await trpcClient.studio.generateChatTitle.mutate({
          projectPath,
          prompt,
        });
        if (!cancelled) setChatTitle(projectPath, activeChatId, result.title);
      } catch {
        if (!cancelled) generateChatTitle(projectPath, activeChatId);
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
    if (
      !pendingPrompt ||
      !hasHydrated ||
      !projectPath ||
      !activeChatId ||
      pendingPrompt.chatId !== activeChatId
    )
      return;
    let cancelled = false;
    const run = async () => {
      try {
        await sendMessage(
          { text: pendingPrompt.content },
          { body: { mode: pendingPrompt.mode, model: pendingPrompt.model } },
        );
        if (!cancelled) {
          updateChatDraft(projectPath, activeChatId, "");
          setPendingPrompt(null);
        }
      } catch (error) {
        if (!cancelled) {
          setPendingPrompt(null);
          // Error will be available via assistantError from useChat
        }
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

  const handleReferenceSelect = (reference: StudioAssistantReference) => ({
    kind:
      reference.kind === "group"
        ? "group" as const
        : reference.kind === "background-run"
          ? "background-run" as const
          : reference.kind === "payment-trace"
            ? "payment-trace" as const
            : "record" as const,
    id: reference.id,
  });

  const openAssistant = () => {
    if (projectPath) setAssistantOpen(projectPath, true);
  };

  const closeAssistant = () => {
    if (projectPath) setAssistantOpen(projectPath, false);
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
    if (!projectPath || !activeChatId) return;
    const value = content.trim();
    if (!value) return;
    const scopeMode = options?.scopeMode ?? assistantScopeMode;
    const targetChatId = options?.chatId ?? activeChatId;
    if (options?.resetConversation) {
      resetChat(projectPath, targetChatId, { scopeMode });
      if (targetChatId === activeChatId) setMessages([]);
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
      { text: value },
      { body: { mode, model: selectedModel || undefined } },
    );
    updateChatDraft(projectPath, targetChatId, "");
  };

  const createStandaloneChat = () => {
    if (!projectPath) return;
    stopAssistant();
    clearAssistantError();
    ensureWorkspace(projectPath);
    if (isBlankStandaloneChat()) {
      setAssistantOpen(projectPath, true);
      return;
    }
    const chatId = createChat(projectPath, { scopeMode: "standalone" });
    if (!chatId) return;
    if (fallbackModel) updateChatModel(projectPath, chatId, fallbackModel);
    setAssistantOpen(projectPath, true);
  };

  const createSelectionChatAndSubmit = (prompt: string) => {
    if (!projectPath) return;
    stopAssistant();
    clearAssistantError();
    ensureWorkspace(projectPath);
    const chatId = createChat(projectPath, { scopeMode: "selection" });
    if (!chatId) return;
    if (fallbackModel) updateChatModel(projectPath, chatId, fallbackModel);
    setAssistantOpen(projectPath, true);
    setPendingPrompt({
      chatId,
      content: prompt,
      model: fallbackModel || undefined,
      mode: "describe-selection",
    });
  };

  const switchAssistantChat = (chatId: string) => {
    if (!projectPath || !chatId) return;
    stopAssistant();
    clearAssistantError();
    setActiveChat(projectPath, chatId);
    setAssistantOpen(projectPath, true);
  };

  const handleDescribeSelection = (prompt: string) => {
    if (!selection) return;
    if (assistantScopeMode === "standalone") {
      createSelectionChatAndSubmit(prompt);
      return;
    }
    void submitAssistantPrompt(prompt, "describe-selection", {
      scopeMode: "selection",
    });
  };

  return {
    hasHydrated,
    activeChatId,
    assistantDraft,
    assistantOpen,
    assistantScopeMode,
    selectedModel,
    assistantError,
    messages,
    assistantStatus,
    chatSessions,
    scopeLabel,
    clearAssistantError,
    stopAssistant,
    openAssistant,
    closeAssistant,
    submitAssistantPrompt,
    createStandaloneChat,
    createSelectionChatAndSubmit,
    switchAssistantChat,
    handleDescribeSelection,
    handleReferenceSelect,
    updateChatDraft,
    updateChatModel,
  };
}
