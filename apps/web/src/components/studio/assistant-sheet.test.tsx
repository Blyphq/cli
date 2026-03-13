// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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
  status = enabledStatus(),
  statusState = "ready",
}: {
  open: boolean;
  onOpenChange?: (next: boolean) => void;
  status?: StudioAssistantStatus;
  statusState?: StudioChatStatus;
}) {
  return (
    <AssistantSheet
      open={open}
      canDescribeSelection
      draft=""
      messages={[] as StudioChatMessage[]}
      model="openai/gpt-5.4"
      selectionLabel="Selected log"
      status={status}
      statusState={statusState}
      onDescribeSelection={vi.fn()}
      onDraftChange={vi.fn()}
      onModelChange={vi.fn()}
      onOpenChange={onOpenChange}
      onQuickAction={vi.fn()}
      onReferenceSelect={vi.fn()}
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
