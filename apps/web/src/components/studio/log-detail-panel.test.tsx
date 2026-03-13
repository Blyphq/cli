// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { StudioRecord } from "@/lib/studio";

import { LogDetailPanel } from "./log-detail-panel";

describe("LogDetailPanel", () => {
  it("renders the empty state when no record is selected", () => {
    render(<LogDetailPanel record={null} />);

    expect(screen.getByText("Select a record")).toBeInTheDocument();
  });

  it("renders resolved source context for the selected record", () => {
    render(
      <LogDetailPanel
        record={createRecord()}
        source={{
          status: "resolved",
          reason: null,
          location: {
            absolutePath: "/tmp/project/src/routes/demo.ts",
            relativePath: "src/routes/demo.ts",
            line: 4,
            column: null,
            origin: "stack",
          },
          startLine: 1,
          endLine: 6,
          focusLine: 4,
          language: "ts",
          snippet: [
            "export function demo() {",
            "  const value = null;",
            "  if (!value) {",
            "    throw new Error('boom');",
            "  }",
            "}",
          ].join("\n"),
        }}
      />,
    );

    expect(screen.getByText("Source Context")).toBeInTheDocument();
    expect(screen.getAllByText("src/routes/demo.ts:4")).toHaveLength(2);
    expect(screen.getByText("throw new Error('boom');")).toBeInTheDocument();
    expect(screen.getByText("stack")).toBeInTheDocument();
  });

  it("renders unavailable source context copy", () => {
    render(
      <LogDetailPanel
        record={createRecord()}
        source={{
          status: "unavailable",
          reason: "node_modules",
          location: null,
          startLine: null,
          endLine: null,
          focusLine: null,
          language: null,
          snippet: null,
        }}
      />,
    );

    expect(screen.getByText("Source unavailable")).toBeInTheDocument();
    expect(
      screen.getAllByText("No in-project source location was found for this record."),
    ).toHaveLength(2);
  });
});

function createRecord(): StudioRecord {
  return {
    id: "record-1",
    timestamp: "2026-03-13T12:00:00.000Z",
    level: "error",
    message: "boom",
    source: "server",
    type: "app_error",
    caller: "src/routes/demo.ts:4",
    bindings: null,
    data: { traceId: "abc" },
    fileId: "file-1",
    fileName: "log.ndjson",
    filePath: "/tmp/project/logs/log.ndjson",
    lineNumber: 1,
    malformed: false,
    http: null,
    error: "boom",
    stack: "Error: boom",
    sourceLocation: {
      absolutePath: "/tmp/project/src/routes/demo.ts",
      relativePath: "src/routes/demo.ts",
      line: 4,
      column: null,
      origin: "caller",
    },
    raw: { message: "boom" },
  };
}
