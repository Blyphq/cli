import { nanoid } from "nanoid";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { StudioChatMessage } from "@/lib/studio";
import { getMessageText } from "@/lib/studio";

export type AssistantScopeMode = "selection" | "standalone";

export interface StudioAssistantChatSession {
  id: string;
  title: string;
  messages: StudioChatMessage[];
  draft: string;
  selectedModel: string;
  scopeMode: AssistantScopeMode;
  createdAt: string;
  updatedAt: string;
}

export interface StudioAssistantProjectWorkspace {
  projectPath: string;
  chatIds: string[];
  activeChatId: string | null;
  assistantOpen: boolean;
  chatsById: Record<string, StudioAssistantChatSession>;
}

interface CreateChatOptions {
  activate?: boolean;
  scopeMode?: AssistantScopeMode;
}

interface ResetChatOptions {
  scopeMode?: AssistantScopeMode;
}

export interface StudioAssistantStore {
  hasHydrated: boolean;
  workspacesByProject: Record<string, StudioAssistantProjectWorkspace>;
  markHydrated(): void;
  ensureWorkspace(projectPath: string): void;
  createChat(projectPath: string, options?: CreateChatOptions): string;
  setActiveChat(projectPath: string, chatId: string): void;
  setAssistantOpen(projectPath: string, open: boolean): void;
  updateChatDraft(projectPath: string, chatId: string, draft: string): void;
  updateChatMessages(
    projectPath: string,
    chatId: string,
    messages: StudioChatMessage[],
  ): void;
  setChatTitle(projectPath: string, chatId: string, title: string): void;
  updateChatModel(projectPath: string, chatId: string, model: string): void;
  updateChatScopeMode(
    projectPath: string,
    chatId: string,
    scopeMode: AssistantScopeMode,
  ): void;
  resetChat(projectPath: string, chatId: string, options?: ResetChatOptions): void;
  generateChatTitle(projectPath: string, chatId: string): void;
  getWorkspace(projectPath: string): StudioAssistantProjectWorkspace | null;
  getActiveChat(projectPath: string): StudioAssistantChatSession | null;
}

const DEFAULT_CHAT_TITLE = "New chat";

export function sanitizePersistedMessages(
  messages: StudioChatMessage[],
): StudioChatMessage[] {
  return messages.map((message) => ({
    ...message,
    parts: message.parts.map((part) =>
      (part.type === "text" || part.type === "reasoning") &&
      part.state === "streaming"
        ? { ...part, state: "done" }
        : part,
    ),
  }));
}

function createChatSession(
  scopeMode: AssistantScopeMode = "standalone",
): StudioAssistantChatSession {
  const timestamp = new Date().toISOString();

  return {
    id: nanoid(),
    title: DEFAULT_CHAT_TITLE,
    messages: [],
    draft: "",
    selectedModel: "",
    scopeMode,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function createWorkspace(projectPath: string): StudioAssistantProjectWorkspace {
  const chat = createChatSession("standalone");

  return {
    projectPath,
    chatIds: [chat.id],
    activeChatId: chat.id,
    assistantOpen: false,
    chatsById: {
      [chat.id]: chat,
    },
  };
}

function resolveActiveChatId(
  workspace: StudioAssistantProjectWorkspace,
): string | null {
  if (
    workspace.activeChatId &&
    workspace.chatsById[workspace.activeChatId]
  ) {
    return workspace.activeChatId;
  }

  const chats = Object.values(workspace.chatsById);
  if (chats.length === 0) {
    return null;
  }

  return chats.sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  )[0]?.id ?? null;
}

function normalizeWorkspace(
  workspace: StudioAssistantProjectWorkspace,
): StudioAssistantProjectWorkspace {
  let nextWorkspace = { ...workspace };

  if (Object.keys(nextWorkspace.chatsById).length === 0) {
    const chat = createChatSession("standalone");
    nextWorkspace = {
      ...nextWorkspace,
      chatIds: [chat.id],
      activeChatId: chat.id,
      chatsById: {
        [chat.id]: chat,
      },
    };
  }

  const activeChatId = resolveActiveChatId(nextWorkspace);
  if (activeChatId !== nextWorkspace.activeChatId) {
    nextWorkspace = {
      ...nextWorkspace,
      activeChatId,
    };
  }

  return nextWorkspace;
}

function updateWorkspaceChat(
  workspace: StudioAssistantProjectWorkspace,
  chatId: string,
  updater: (chat: StudioAssistantChatSession) => StudioAssistantChatSession,
): StudioAssistantProjectWorkspace {
  const chat = workspace.chatsById[chatId];
  if (!chat) {
    return workspace;
  }

  return {
    ...workspace,
    chatsById: {
      ...workspace.chatsById,
      [chatId]: updater(chat),
    },
  };
}

function touchChat(
  chat: StudioAssistantChatSession,
): StudioAssistantChatSession {
  return {
    ...chat,
    updatedAt: new Date().toISOString(),
  };
}

function formatChatTitle(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= 48) {
    return normalized || DEFAULT_CHAT_TITLE;
  }

  return `${normalized.slice(0, 47).trimEnd()}…`;
}

export const useStudioAssistantStore = create<StudioAssistantStore>()(
  persist(
    (set, get) => ({
      hasHydrated: false,
      workspacesByProject: {},
      markHydrated: () => {
        set({ hasHydrated: true });
      },
      ensureWorkspace: (projectPath) => {
        if (!projectPath) {
          return;
        }

        set((state) => {
          const existing = state.workspacesByProject[projectPath];
          const workspace = existing
            ? normalizeWorkspace(existing)
            : createWorkspace(projectPath);

          return {
            workspacesByProject: {
              ...state.workspacesByProject,
              [projectPath]: workspace,
            },
          };
        });
      },
      createChat: (projectPath, options) => {
        if (!projectPath) {
          return "";
        }

        const chat = createChatSession(options?.scopeMode ?? "standalone");

        set((state) => {
          const baseWorkspace =
            state.workspacesByProject[projectPath] ?? createWorkspace(projectPath);
          const workspace = normalizeWorkspace(baseWorkspace);
          const nextWorkspace: StudioAssistantProjectWorkspace = {
            ...workspace,
            chatIds: workspace.chatIds.includes(chat.id)
              ? workspace.chatIds
              : [...workspace.chatIds, chat.id],
            activeChatId:
              options?.activate === false ? workspace.activeChatId : chat.id,
            chatsById: {
              ...workspace.chatsById,
              [chat.id]: chat,
            },
          };

          return {
            workspacesByProject: {
              ...state.workspacesByProject,
              [projectPath]: nextWorkspace,
            },
          };
        });

        return chat.id;
      },
      setActiveChat: (projectPath, chatId) => {
        if (!projectPath || !chatId) {
          return;
        }

        set((state) => {
          const workspace = state.workspacesByProject[projectPath];
          if (!workspace || !workspace.chatsById[chatId]) {
            return state;
          }

          return {
            workspacesByProject: {
              ...state.workspacesByProject,
              [projectPath]: updateWorkspaceChat(
                {
                  ...workspace,
                  activeChatId: chatId,
                },
                chatId,
                (chat) => touchChat(chat),
              ),
            },
          };
        });
      },
      setAssistantOpen: (projectPath, open) => {
        if (!projectPath) {
          return;
        }

        set((state) => {
          const workspace = state.workspacesByProject[projectPath];
          if (!workspace) {
            return state;
          }

          return {
            workspacesByProject: {
              ...state.workspacesByProject,
              [projectPath]: {
                ...workspace,
                assistantOpen: open,
              },
            },
          };
        });
      },
      updateChatDraft: (projectPath, chatId, draft) => {
        if (!projectPath || !chatId) {
          return;
        }

        set((state) => {
          const workspace = state.workspacesByProject[projectPath];
          if (!workspace) {
            return state;
          }

          return {
            workspacesByProject: {
              ...state.workspacesByProject,
              [projectPath]: updateWorkspaceChat(workspace, chatId, (chat) =>
                touchChat({
                  ...chat,
                  draft,
                }),
              ),
            },
          };
        });
      },
      updateChatMessages: (projectPath, chatId, messages) => {
        if (!projectPath || !chatId) {
          return;
        }

        set((state) => {
          const workspace = state.workspacesByProject[projectPath];
          if (!workspace) {
            return state;
          }

          return {
            workspacesByProject: {
              ...state.workspacesByProject,
              [projectPath]: updateWorkspaceChat(workspace, chatId, (chat) =>
                touchChat({
                  ...chat,
                  messages: sanitizePersistedMessages(messages),
                }),
              ),
            },
          };
        });
      },
      setChatTitle: (projectPath, chatId, title) => {
        if (!projectPath || !chatId) {
          return;
        }

        set((state) => {
          const workspace = state.workspacesByProject[projectPath];
          if (!workspace) {
            return state;
          }

          return {
            workspacesByProject: {
              ...state.workspacesByProject,
              [projectPath]: updateWorkspaceChat(workspace, chatId, (chat) =>
                touchChat({
                  ...chat,
                  title: formatChatTitle(title),
                }),
              ),
            },
          };
        });
      },
      updateChatModel: (projectPath, chatId, model) => {
        if (!projectPath || !chatId) {
          return;
        }

        set((state) => {
          const workspace = state.workspacesByProject[projectPath];
          if (!workspace) {
            return state;
          }

          return {
            workspacesByProject: {
              ...state.workspacesByProject,
              [projectPath]: updateWorkspaceChat(workspace, chatId, (chat) =>
                touchChat({
                  ...chat,
                  selectedModel: model,
                }),
              ),
            },
          };
        });
      },
      updateChatScopeMode: (projectPath, chatId, scopeMode) => {
        if (!projectPath || !chatId) {
          return;
        }

        set((state) => {
          const workspace = state.workspacesByProject[projectPath];
          if (!workspace) {
            return state;
          }

          return {
            workspacesByProject: {
              ...state.workspacesByProject,
              [projectPath]: updateWorkspaceChat(workspace, chatId, (chat) =>
                touchChat({
                  ...chat,
                  scopeMode,
                }),
              ),
            },
          };
        });
      },
      resetChat: (projectPath, chatId, options) => {
        if (!projectPath || !chatId) {
          return;
        }

        set((state) => {
          const workspace = state.workspacesByProject[projectPath];
          if (!workspace) {
            return state;
          }

          return {
            workspacesByProject: {
              ...state.workspacesByProject,
              [projectPath]: updateWorkspaceChat(workspace, chatId, (chat) =>
                touchChat({
                  ...chat,
                  draft: "",
                  messages: [],
                  scopeMode: options?.scopeMode ?? chat.scopeMode,
                }),
              ),
            },
          };
        });
      },
      generateChatTitle: (projectPath, chatId) => {
        if (!projectPath || !chatId) {
          return;
        }

        set((state) => {
          const workspace = state.workspacesByProject[projectPath];
          const chat = workspace?.chatsById[chatId];
          if (!workspace || !chat || chat.title !== DEFAULT_CHAT_TITLE) {
            return state;
          }

          const firstUserMessage = chat.messages.find(
            (message) => message.role === "user" && getMessageText(message),
          );
          if (!firstUserMessage) {
            return state;
          }

          return {
            workspacesByProject: {
              ...state.workspacesByProject,
              [projectPath]: updateWorkspaceChat(workspace, chatId, (current) =>
                touchChat({
                  ...current,
                  title: formatChatTitle(getMessageText(firstUserMessage)),
                }),
              ),
            },
          };
        });
      },
      getWorkspace: (projectPath) => {
        if (!projectPath) {
          return null;
        }

        return get().workspacesByProject[projectPath] ?? null;
      },
      getActiveChat: (projectPath) => {
        if (!projectPath) {
          return null;
        }

        const workspace = get().workspacesByProject[projectPath];
        if (!workspace?.activeChatId) {
          return null;
        }

        return workspace.chatsById[workspace.activeChatId] ?? null;
      },
    }),
    {
      name: "blyp-studio-assistant",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        workspacesByProject: state.workspacesByProject,
      }),
      onRehydrateStorage: () => (state) => {
        state?.markHydrated();
      },
    },
  ),
);
