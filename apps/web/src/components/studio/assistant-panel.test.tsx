// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { StudioAssistantStatus } from "@/lib/studio";

import { AssistantPanel } from "./assistant-panel";

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
});

describe("AssistantPanel", () => {
  it("disables send for blank drafts and calls quick actions", async () => {
    const onQuickAction = vi.fn();
    const user = userEvent.setup();

    render(
      <AssistantPanel
        canDescribeSelection
        draft="   "
        messages={[]}
        model="openai/gpt-5.4"
        scopeLabel="current filters"
        status={enabledStatus()}
        statusState="ready"
        onDescribeSelection={vi.fn()}
        onDraftChange={vi.fn()}
        onModelChange={vi.fn()}
        onQuickAction={onQuickAction}
        onReferenceSelect={vi.fn()}
        onSend={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    expect(screen.getByText("Current scope: current filters")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /find related logs/i }));
    expect(onQuickAction).toHaveBeenCalledWith(
      "Find related logs in the current scope.",
    );
  });

  it("shows the stop action only while streaming or submitted", async () => {
    const onStop = vi.fn();
    const user = userEvent.setup();

    render(
      <AssistantPanel
        canDescribeSelection
        draft="What happened?"
        messages={[]}
        model="openai/gpt-5.4"
        scopeLabel="selected log"
        status={enabledStatus()}
        statusState="streaming"
        onDescribeSelection={vi.fn()}
        onDraftChange={vi.fn()}
        onModelChange={vi.fn()}
        onQuickAction={vi.fn()}
        onReferenceSelect={vi.fn()}
        onSend={vi.fn()}
        onStop={onStop}
      />,
    );

    expect(screen.getByText("Current scope: selected log")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /stop/i }));
    expect(onStop).toHaveBeenCalled();
  });

  it("renders setup guidance when the assistant is disabled", () => {
    render(
      <AssistantPanel
        canDescribeSelection={false}
        draft=""
        messages={[]}
        model=""
        scopeLabel="no selection"
        status={{
          enabled: false,
          provider: "openrouter",
          model: null,
          availableModels: ["openai/gpt-5.4"],
          apiKeySource: "missing",
          modelSource: "missing",
          reason: "missing_api_key",
        }}
        statusState="ready"
        onDescribeSelection={vi.fn()}
        onDraftChange={vi.fn()}
        onModelChange={vi.fn()}
        onQuickAction={vi.fn()}
        onReferenceSelect={vi.fn()}
        onSend={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    expect(screen.getByText("Missing OPENROUTER_API_KEY")).toBeInTheDocument();
  });
});

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
