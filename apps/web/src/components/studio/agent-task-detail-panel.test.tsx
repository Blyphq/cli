// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AgentTaskDetailPanel } from "./agent-task-detail-panel";

const detail = {
  task: {
    id: "agent:task:task-1",
    title: "Summarise user feedback",
    status: "FAILED",
    startedAt: "2026-03-13T10:00:00.000Z",
    finishedAt: "2026-03-13T10:00:04.200Z",
    durationMs: 4200,
    stepCount: 3,
    llmCallCount: 1,
    toolCallCount: 1,
    retrievalCount: 0,
    totalTokens: 1800,
    failureKind: "tool",
    failureMessage: "database unavailable",
    recordIds: ["r1", "r2", "r3"],
    correlationSource: "task_id",
  },
  steps: [
    {
      id: "step-1",
      recordId: "r1",
      timestamp: "2026-03-13T10:00:00.000Z",
      offsetMs: 0,
      type: "AGENT",
      name: "task started",
      summary: "task started",
      durationMs: 12,
      durationSource: "inferred-next-step",
      status: "started",
      model: null,
      toolName: null,
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      resultCount: null,
      inputPreview: "Summarise feedback",
      outputPreview: null,
      errorMessage: null,
      rawDetails: { input: "Summarise feedback" },
    },
    {
      id: "step-2",
      recordId: "r2",
      timestamp: "2026-03-13T10:00:00.340Z",
      offsetMs: 340,
      type: "LLM",
      name: "anthropic/claude-3.5-sonnet",
      summary: "completion",
      durationMs: 540,
      durationSource: "explicit",
      status: "success",
      model: "anthropic/claude-3.5-sonnet",
      toolName: null,
      promptTokens: 1000,
      completionTokens: 800,
      totalTokens: 1800,
      resultCount: null,
      inputPreview: "prompt preview",
      outputPreview: "output preview",
      errorMessage: null,
      rawDetails: { tokens: { total: 1800 } },
    },
    {
      id: "step-3",
      recordId: "r3",
      timestamp: "2026-03-13T10:00:01.000Z",
      offsetMs: 1000,
      type: "TOOL",
      name: "search_database",
      summary: "tool call",
      durationMs: 800,
      durationSource: "explicit",
      status: "failed",
      model: null,
      toolName: "search_database",
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      resultCount: null,
      inputPreview: "search input",
      outputPreview: null,
      errorMessage: "database unavailable",
      rawDetails: { tool: { name: "search_database" } },
    },
  ],
  failure: {
    taskId: "agent:task:task-1",
    taskTitle: "Summarise user feedback",
    status: "FAILED",
    errorKind: "tool",
    errorMessage: "database unavailable",
    failedStepId: "step-3",
    failedStepName: "search_database",
    failedAt: "2026-03-13T10:00:01.000Z",
  },
} as const;

describe("AgentTaskDetailPanel", () => {
  it("renders task detail, expandable step details, and Ask AI for failed tasks", async () => {
    const user = userEvent.setup();
    const onAskAi = vi.fn();

    render(
      <AgentTaskDetailPanel
        detail={detail as never}
        loading={false}
        onAskAi={onAskAi}
      />,
    );

    expect(screen.getByText("Summarise user feedback")).toBeInTheDocument();
    expect(screen.getByText("FAILED")).toBeInTheDocument();
    expect(screen.getByText("search_database")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^ask ai$/i }));
    expect(onAskAi).toHaveBeenCalled();

    await user.click(screen.getAllByRole("button", { name: /^details$/i })[1]!);
    expect(screen.getByText(/prompt preview/i)).toBeInTheDocument();
    expect(screen.getByText(/output preview/i)).toBeInTheDocument();
    expect(screen.getByText(/database unavailable/i)).toBeInTheDocument();
  });
});
