import { describe, expect, it } from "vitest";

import { buildErrorGroupDetail, buildErrorsPage, extractErrorMessageFirstLine } from "./errors";
import type { StudioNormalizedRecord } from "./types";

describe("studio errors aggregation", () => {
  it("groups repeated identical errors by type, message, and source line", () => {
    const records = [
      makeRecord({
        id: "a",
        timestamp: "2026-03-20T10:00:00.000Z",
        type: "TypeError",
        message: "Cannot read properties of undefined",
        line: 12,
      }),
      makeRecord({
        id: "b",
        timestamp: "2026-03-20T10:01:00.000Z",
        type: "TypeError",
        message: "Cannot read properties of undefined",
        line: 12,
      }),
      makeRecord({
        id: "c",
        timestamp: "2026-03-20T10:02:00.000Z",
        type: "TypeError",
        message: "Cannot read properties of undefined",
        line: 14,
      }),
    ];

    const page = buildErrorsPage({
      records,
      input: { view: "grouped", sort: "most-frequent" },
      projectPath: "/project",
    });

    expect(page.totalGroups).toBe(2);
    expect(page.groups[0]).toMatchObject({
      occurrenceCount: 2,
      sourceLine: 12,
      statusHint: "recurring",
    });
    expect(page.groups[1]).toMatchObject({
      occurrenceCount: 1,
      sourceLine: 14,
      statusHint: "new",
    });
  });

  it("extracts the first non-empty line from an error message and builds chronological detail", () => {
    const records = [
      makeRecord({
        id: "a",
        timestamp: "2026-03-20T10:00:00.000Z",
        message: "Primary line\n    at stack frame",
      }),
      makeRecord({
        id: "b",
        timestamp: "2026-03-20T10:03:00.000Z",
        message: "Primary line\n    at newer stack frame",
      }),
    ];

    expect(extractErrorMessageFirstLine(records[0]!)).toBe("Primary line");

    const grouped = buildErrorsPage({
      records,
      input: { view: "grouped" },
      projectPath: "/project",
    });
    const detail = buildErrorGroupDetail({
      groupId: grouped.groups[0]!.id,
      records,
      projectPath: "/project",
    });

    expect(detail?.occurrences.map((item) => item.record.id)).toEqual(["a", "b"]);
    expect(detail?.structuredFields.some((field) => field.key === "error.message")).toBe(true);
  });
});

function makeRecord(input: {
  id: string;
  timestamp: string;
  type?: string;
  message: string;
  line?: number;
}): StudioNormalizedRecord {
  return {
    id: input.id,
    timestamp: input.timestamp,
    level: "error",
    message: input.message,
    source: "server",
    type: input.type ?? "TypeError",
    caller: `src/routes/example.ts:${input.line ?? 12}`,
    bindings: null,
    data: null,
    fileId: "file-1",
    fileName: "log.ndjson",
    filePath: "/project/logs/log.ndjson",
    lineNumber: 1,
    malformed: false,
    http: null,
    error: {
      name: input.type ?? "TypeError",
      message: input.message,
      stack: `${input.type ?? "TypeError"}: ${input.message}\n    at src/routes/example.ts:${input.line ?? 12}:1`,
    },
    stack: `${input.type ?? "TypeError"}: ${input.message}\n    at src/routes/example.ts:${input.line ?? 12}:1`,
    sourceLocation: {
      absolutePath: "/project/src/routes/example.ts",
      relativePath: "src/routes/example.ts",
      line: input.line ?? 12,
      column: 1,
      origin: "stack",
    },
    raw: {
      message: input.message,
      error: {
        name: input.type ?? "TypeError",
        message: input.message,
      },
    },
  };
}
