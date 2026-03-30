// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AgentsView } from "./agents-view";

const agentsData = {
  stats: {
    agentTasks: 2,
    llmCalls: 3,
    avgTaskDurationMs: 4200,
    toolCalls: 4,
    failedTasks: 1,
    totalTokens: 5120,
  },
  tasks: [
    {
      id: "agent:task:task-1",
      title: "Summarise user feedback",
      status: "FAILED",
      startedAt: "2026-03-13T10:00:00.000Z",
      finishedAt: "2026-03-13T10:00:04.200Z",
      durationMs: 4200,
      stepCount: 6,
      llmCallCount: 2,
      toolCallCount: 2,
      retrievalCount: 1,
      totalTokens: 2800,
      failureKind: "tool",
      failureMessage: "database unavailable",
      recordIds: ["r1"],
      correlationSource: "task_id",
    },
  ],
  totalTasks: 1,
  offset: 0,
  limit: 100,
  truncated: false,
  llmCalls: [
    {
      id: "llm-1",
      taskId: "agent:task:task-1",
      taskTitle: "Summarise user feedback",
      recordId: "r2",
      timestamp: "2026-03-13T10:00:00.340Z",
      model: "anthropic/claude-3.5-sonnet",
      promptTokens: 1000,
      completionTokens: 800,
      totalTokens: 1800,
      durationMs: 540,
      approxCostUsd: 0.015,
    },
  ],
  toolCalls: [
    {
      id: "tool-1",
      taskId: "agent:task:task-1",
      taskTitle: "Summarise user feedback",
      recordId: "r3",
      timestamp: "2026-03-13T10:00:01.000Z",
      name: "search_database",
      durationMs: 800,
      outcome: "failure",
      errorMessage: "database unavailable",
    },
  ],
  toolSummary: {
    mostFrequentlyCalled: [{ name: "search_database", count: 2 }],
    slowestByP95: [{ name: "search_database", p95DurationMs: 800, sampleCount: 2 }],
  },
  failures: [
    {
      taskId: "agent:task:task-1",
      taskTitle: "Summarise user feedback",
      status: "FAILED",
      errorKind: "tool",
      errorMessage: "database unavailable",
      failedStepId: "step-1",
      failedStepName: "search_database",
      failedAt: "2026-03-13T10:00:01.000Z",
    },
  ],
} as const;

describe("AgentsView", () => {
  it("renders stats, task list, breakdowns, and failure Ask AI", async () => {
    const user = userEvent.setup();
    const onSelectTask = vi.fn();
    const onAskAi = vi.fn();

    render(
      <AgentsView
        agents={agentsData as never}
        loading={false}
        selectedTaskId={null}
        onSelectTask={onSelectTask}
        onAskAi={onAskAi}
      />,
    );

    expect(screen.getByText("Agent tasks")).toBeInTheDocument();
    expect(screen.getByText("LLM call breakdown")).toBeInTheDocument();
    expect(screen.getByText("Tool call breakdown")).toBeInTheDocument();
    expect(screen.getByText("Summarise user feedback")).toBeInTheDocument();
    expect(screen.getByText("FAILED")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /ask ai/i }));
    expect(onAskAi).toHaveBeenCalledWith("agent:task:task-1");

    await user.click(screen.getByRole("button", { name: /summarise user feedback/i }));
    expect(onSelectTask).toHaveBeenCalledWith("agent:task:task-1");
  });
});
