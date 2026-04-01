import { describe, expect, it } from "vitest";

import {
  buildAssistantReplyPrompt,
  buildDescribeSelectionPrompt,
} from "./assistant-prompt";

describe("assistant prompt", () => {
  it("keeps selected agent task evidence aligned with the prompt header", () => {
    const input = {
      projectPath: "/tmp/project",
      projectContextMarkdown: null,
      selectedRecord: null,
      selectedRecordSource: null,
      selectedGroup: null,
      selectedBackgroundRun: {
        run: {
          id: "run-1",
          jobName: "Background Sync",
          runId: "run-1",
          status: "FAILED" as const,
          startedAt: "2026-03-13T10:00:00.000Z",
          finishedAt: "2026-03-13T10:00:10.000Z",
          durationMs: 10_000,
          outputFields: [],
          failure: null,
          recordCount: 2,
        },
        timeline: [],
      },
      selectedAgentTask: {
        task: {
          id: "agent:task:123",
          title: "Summarise feedback",
          status: "FAILED" as const,
          startedAt: "2026-03-13T11:00:00.000Z",
          finishedAt: "2026-03-13T11:00:04.000Z",
          durationMs: 4_000,
          stepCount: 2,
          llmCallCount: 1,
          toolCallCount: 1,
          retrievalCount: 0,
          totalTokens: 1800,
          failureKind: "tool" as const,
          failureMessage: "db unavailable",
          recordIds: ["r1", "r2"],
          correlationSource: "task_id" as const,
        },
        steps: [],
        failure: null,
      },
      selectedPaymentTrace: null,
      records: [],
      references: [],
      userQuestion: "What failed?",
      history: [],
      filtersSummary: "none",
    };

    const replyPrompt = buildAssistantReplyPrompt(input);
    const describePrompt = buildDescribeSelectionPrompt(input);

    expect(replyPrompt).toContain("Selected agent task: Summarise feedback");
    expect(replyPrompt).toContain("\"agentTask\"");
    expect(replyPrompt).not.toContain("\"backgroundRun\"");

    expect(describePrompt).toContain("Explain this agent task: Summarise feedback");
    expect(describePrompt).toContain("\"agentTask\"");
    expect(describePrompt).not.toContain("\"backgroundRun\"");
  });
});
