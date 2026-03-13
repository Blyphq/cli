// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  StudioAssistantStatus,
  StudioChatMessage,
  StudioChatStatus,
} from "@/lib/studio";

import { AssistantSheet } from "./assistant-sheet";

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
});

beforeEach(() => {
  vi.useRealTimers();
});

describe("AssistantSheet", () => {
  it("opens expanded and collapses after pointer leave on desktop", () => {
    vi.useFakeTimers();
    mockMatchMedia(true);

    render(<TestAssistantSheet open />);

    const sheet = screen.getByTestId("assistant-sheet");
    expect(sheet).toHaveAttribute("data-expanded", "true");

    fireEvent.mouseLeave(sheet);
    vi.advanceTimersByTime(180);

    expect(sheet).toHaveAttribute("data-expanded", "false");

    fireEvent.mouseEnter(sheet);
    expect(sheet).toHaveAttribute("data-expanded", "true");
  });

  it("closes when the close button is pressed", () => {
    mockMatchMedia(true);
    const onOpenChange = vi.fn();

    render(<TestAssistantSheet open onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByRole("button", { name: /close assistant/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("renders the chat switcher and new chat action", async () => {
    mockMatchMedia(true);
    const onCreateChat = vi.fn();
    const onSelectChat = vi.fn();
    const user = userEvent.setup();

    render(
      <TestAssistantSheet
        open
        onCreateChat={onCreateChat}
        onSelectChat={onSelectChat}
      />,
    );

    expect(screen.getByRole("button", { name: /new chat/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /new chat/i }));
    expect(onCreateChat).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("combobox", { name: /choose chat/i }));
    fireEvent.click(screen.getByRole("option", { name: /current filters chat/i }));
    expect(onSelectChat).toHaveBeenCalledWith("chat-1");
  });

  it("renders setup guidance when disabled", () => {
    mockMatchMedia(true);

    render(
      <TestAssistantSheet
        open
        status={{
          enabled: false,
          provider: "openrouter",
          model: null,
          availableModels: ["openai/gpt-5.4"],
          apiKeySource: "missing",
          modelSource: "missing",
          reason: "missing_api_key",
        }}
      />,
    );

    expect(screen.getByText("Missing OPENROUTER_API_KEY")).toBeInTheDocument();
  });
});

function TestAssistantSheet({
  open,
  onOpenChange = vi.fn(),
  onCreateChat = vi.fn(),
  onSelectChat = vi.fn(),
  status = enabledStatus(),
  statusState = "ready",
}: {
  open: boolean;
  onOpenChange?: (next: boolean) => void;
  onCreateChat?: () => void;
  onSelectChat?: (chatId: string) => void;
  status?: StudioAssistantStatus;
  statusState?: StudioChatStatus;
}) {
  return (
    <AssistantSheet
      open={open}
      activeChatId="chat-1"
      canDescribeSelection
      chatSessions={[
        {
          id: "chat-1",
          title: "Current filters chat",
          updatedAt: "2026-03-13T00:00:00.000Z",
        },
      ]}
      draft=""
      messages={[] as StudioChatMessage[]}
      model="openai/gpt-5.4"
      scopeLabel="current filters"
      status={status}
      statusState={statusState}
      onCreateChat={onCreateChat}
      onDescribeSelection={vi.fn()}
      onDraftChange={vi.fn()}
      onModelChange={vi.fn()}
      onOpenChange={onOpenChange}
      onQuickAction={vi.fn()}
      onReferenceSelect={vi.fn()}
      onSelectChat={onSelectChat}
      onSend={vi.fn()}
      onStop={vi.fn()}
    />
  );
}

function enabledStatus(): StudioAssistantStatus {
  return {
    enabled: true,
    provider: "openrouter",
    model: "openai/gpt-5.4",
    availableModels: ["openai/gpt-5.4"],
    apiKeySource: "process-env",
    modelSource: "process-env",
    reason: null,
  };
}

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches,
      media: "(min-width: 1024px)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}
