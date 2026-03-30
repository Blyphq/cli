import { describe, expect, it } from "vitest";

import { analyzeAgentRecords, getAgentTaskDetail } from "./agents";

import type { StudioNormalizedRecord } from "./types";

describe("agents analyzer", () => {
  it("groups by explicit task id and extracts llm/tool/token data", () => {
    const overview = analyzeAgentRecords({
      records: [
        record("1", "2026-03-13T10:00:00.000Z", {
          message: "agent task started",
          raw: { agent: { task_id: "task-1", taskName: "Summarise feedback", status: "started" } },
        }),
        record("2", "2026-03-13T10:00:00.012Z", {
          message: "tool call",
          raw: { agent: { task_id: "task-1" }, tool: { name: "retrieve_documents", durationMs: 12, success: true } },
        }),
        record("3", "2026-03-13T10:00:00.300Z", {
          message: "completion",
          raw: {
            agent: { task_id: "task-1" },
            llm: { model: "anthropic/claude-3.5-sonnet", durationMs: 300 },
            tokens: { prompt: 1000, completion: 500, total: 1500 },
          },
        }),
        record("4", "2026-03-13T10:00:00.800Z", {
          message: "agent task completed",
          raw: { agent: { task_id: "task-1", status: "completed" } },
        }),
      ],
      query: {},
    });

    expect(overview.stats).toMatchObject({
      agentTasks: 1,
      llmCalls: 1,
      toolCalls: 1,
      failedTasks: 0,
      totalTokens: 1500,
    });
    expect(overview.tasks[0]).toMatchObject({
      title: "Summarise feedback",
      status: "COMPLETED",
      correlationSource: "task_id",
    });
    expect(overview.llmCalls[0]).toMatchObject({
      model: "anthropic/claude-3.5-sonnet",
      totalTokens: 1500,
      durationMs: 300,
    });
  });

  it("falls back to trace grouping and marks tool failures", () => {
    const overview = analyzeAgentRecords({
      records: [
        record("1", "2026-03-13T10:00:00.000Z", {
          message: "tool call",
          raw: { traceId: "trace-1", tool: { name: "search_database", durationMs: 800, status: "failed" }, error: { message: "db unavailable" } },
        }),
      ],
      query: {},
    });

    expect(overview.tasks[0]).toMatchObject({
      status: "FAILED",
      correlationSource: "trace_id",
    });
    expect(overview.failures[0]).toMatchObject({
      errorKind: "tool",
      errorMessage: "db unavailable",
    });
  });

  it("falls back to session proximity grouping and splits tasks after idle gaps", () => {
    const overview = analyzeAgentRecords({
      records: [
        record("1", "2026-03-13T10:00:00.000Z", {
          message: "agent task started",
          raw: { sessionId: "session-1", agent: { status: "started" } },
        }),
        record("2", "2026-03-13T10:00:05.000Z", {
          message: "completion",
          raw: { sessionId: "session-1", llm: { model: "openai/gpt-4o-mini" } },
        }),
        record("3", "2026-03-13T10:00:25.500Z", {
          message: "agent task started",
          raw: { sessionId: "session-1", agent: { status: "started" } },
        }),
      ],
      query: {},
    });

    expect(overview.totalTasks).toBe(2);
    expect(overview.tasks.every((task) => task.correlationSource === "session_proximity")).toBe(true);
  });

  it("returns task detail with failure step and timeout status", () => {
    const records = [
      record("1", "2026-03-13T10:00:00.000Z", {
        message: "agent task started",
        raw: { sessionId: "session-timeout", agent: { status: "started" } },
      }),
      record("2", "2026-03-13T10:11:00.000Z", {
        message: "agent task started",
        raw: { sessionId: "session-timeout", agent: { status: "started" } },
      }),
    ];

    const overview = analyzeAgentRecords({ records, query: {} });
    const timedOut = overview.tasks.find((task) => task.status === "TIMEOUT");
    const detail = timedOut
      ? getAgentTaskDetail({
          records,
          taskId: timedOut.id,
        })
      : null;

    expect(timedOut?.status).toBe("TIMEOUT");
    expect(detail?.failure).toMatchObject({
      status: "TIMEOUT",
    });
  });

  it("finds task detail beyond the default overview pagination window", () => {
    const records = Array.from({ length: 101 }, (_, index) =>
      record(
        String(index + 1),
        new Date(Date.UTC(2026, 2, 13, 10, index, 0, 0)).toISOString(),
        {
        message: "agent task started",
        raw: {
          agent: {
            task_id: `task-${index + 1}`,
            taskName: `Task ${index + 1}`,
            status: "started",
          },
        },
      },
      ),
    );

    const detail = getAgentTaskDetail({
      records,
      taskId: "agent:task:task-101",
    });

    expect(detail?.task).toMatchObject({
      id: "agent:task:task-101",
      title: "Task 101",
    });
  });
});

function record(
  id: string,
  timestamp: string,
  input: { message: string; raw: Record<string, unknown> },
): StudioNormalizedRecord {
  return {
    id,
    timestamp,
    level: "info",
    message: input.message,
    source: "structured",
    type: null,
    caller: null,
    bindings: null,
    data: null,
    fileId: "file-1",
    fileName: "log.ndjson",
    filePath: "/tmp/log.ndjson",
    lineNumber: Number(id),
    malformed: false,
    http: null,
    error: (input.raw.error as unknown) ?? null,
    stack: null,
    sourceLocation: null,
    raw: input.raw,
  };
}
