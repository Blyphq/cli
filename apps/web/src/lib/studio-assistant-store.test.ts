// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it } from "vitest";

import type { StudioChatMessage } from "@/lib/studio";

import {
  sanitizePersistedMessages,
  useStudioAssistantStore,
} from "./studio-assistant-store";

describe("studio assistant store", () => {
  beforeEach(() => {
    localStorage.clear();
    useStudioAssistantStore.setState({
      hasHydrated: true,
      workspacesByProject: {},
    });
  });

  it("creates a workspace with a default blank chat", () => {
    useStudioAssistantStore.getState().ensureWorkspace("/project/a");

    const workspace = useStudioAssistantStore.getState().getWorkspace("/project/a");
    expect(workspace).not.toBeNull();
    expect(workspace?.activeChatId).toBeTruthy();
    expect(workspace?.assistantOpen).toBe(false);
    expect(workspace?.chatIds).toHaveLength(1);
  });

  it("creates and switches chats without losing previous chats", () => {
    const store = useStudioAssistantStore.getState();
    store.ensureWorkspace("/project/a");

    const firstChatId = store.getActiveChat("/project/a")?.id ?? "";
    const secondChatId = store.createChat("/project/a", { scopeMode: "standalone" });
    store.setActiveChat("/project/a", firstChatId);

    const workspace = useStudioAssistantStore.getState().getWorkspace("/project/a");
    expect(workspace?.chatIds).toContain(firstChatId);
    expect(workspace?.chatIds).toContain(secondChatId);
    expect(workspace?.activeChatId).toBe(firstChatId);
  });

  it("sanitizes streaming message parts before persisting", () => {
    const store = useStudioAssistantStore.getState();
    store.ensureWorkspace("/project/a");
    const chatId = store.getActiveChat("/project/a")?.id ?? "";
    store.updateChatMessages("/project/a", chatId, [buildStreamingMessage()]);

    const persisted = useStudioAssistantStore
      .getState()
      .getActiveChat("/project/a")?.messages ?? [];

    expect(persisted[0]?.parts[0]).toMatchObject({
      type: "text",
      state: "done",
    });
  });

  it("derives a chat title from the first user message once", () => {
    const store = useStudioAssistantStore.getState();
    store.ensureWorkspace("/project/a");
    const chatId = store.getActiveChat("/project/a")?.id ?? "";
    store.updateChatMessages("/project/a", chatId, [
      buildUserMessage("Investigate repeated checkout timeout failures in prod"),
    ]);
    store.generateChatTitle("/project/a", chatId);
    store.updateChatMessages("/project/a", chatId, [
      buildUserMessage("A different prompt should not rename the chat"),
    ]);
    store.generateChatTitle("/project/a", chatId);

    const title = useStudioAssistantStore.getState().getActiveChat("/project/a")?.title;
    expect(title).toMatch(/^Investigate repeated checkout timeout failures/);
  });

  it("keeps chats isolated per project", () => {
    const store = useStudioAssistantStore.getState();
    store.ensureWorkspace("/project/a");
    store.ensureWorkspace("/project/b");

    const workspaceA = store.getWorkspace("/project/a");
    const workspaceB = store.getWorkspace("/project/b");

    expect(workspaceA?.activeChatId).not.toBe(workspaceB?.activeChatId);
    expect(workspaceA?.projectPath).toBe("/project/a");
    expect(workspaceB?.projectPath).toBe("/project/b");
  });

  it("normalizes streaming messages with the helper", () => {
    const messages = sanitizePersistedMessages([buildStreamingMessage()]);

    expect(messages[0]?.parts[0]).toMatchObject({
      type: "text",
      state: "done",
    });
  });
});

function buildStreamingMessage(): StudioChatMessage {
  return {
    id: "assistant-1",
    role: "assistant",
    parts: [
      {
        type: "text",
        text: "Streaming reply",
        state: "streaming",
      },
    ],
    metadata: {
      references: [],
      model: "openai/gpt-5.4",
    },
  } as StudioChatMessage;
}

function buildUserMessage(text: string): StudioChatMessage {
  return {
    id: `user-${text}`,
    role: "user",
    parts: [
      {
        type: "text",
        text,
        state: "done",
      },
    ],
  } as StudioChatMessage;
}
