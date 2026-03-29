// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ErrorsView } from "./errors-view";

const page = {
  groups: [
    {
      id: "group-1",
      fingerprint: "TypeError::checkout failed::src/routes/checkout.ts:4",
      errorType: "TypeError",
      message: "checkout failed",
      occurrenceCount: 2,
      firstSeen: "2026-03-13T12:00:00.000Z",
      lastSeen: "2026-03-13T12:01:00.000Z",
      sourceFile: "src/routes/checkout.ts",
      sourceLine: 4,
      sourceColumn: 1,
      http: { method: "POST", route: "/checkout", statusCode: 500 },
      tags: [{ id: "payments", label: "Payments" }],
      statusHint: "recurring" as const,
      sparkline: [
        { bucketStart: "2026-03-13T12:00:00.000Z", count: 1 },
        { bucketStart: "2026-03-13T12:01:00.000Z", count: 1 },
      ],
      representativeRecordId: "record-2",
      traceId: null,
      correlationId: null,
    },
  ],
  rawRecords: [
    {
      record: {
        id: "record-2",
        timestamp: "2026-03-13T12:01:00.000Z",
        level: "error",
        message: "checkout failed",
        source: "server",
        type: "TypeError",
        caller: "src/routes/checkout.ts:4",
        bindings: null,
        data: null,
        fileId: "file-1",
        fileName: "log.ndjson",
        filePath: "/project/logs/log.ndjson",
        lineNumber: 2,
        malformed: false,
        http: null,
        error: null,
        stack: null,
        sourceLocation: null,
        raw: {},
      },
      errorType: "TypeError",
      message: "checkout failed",
      sourceFile: "src/routes/checkout.ts",
      sourceLine: 4,
      sourceColumn: 1,
      http: null,
    },
  ],
  stats: {
    totalUniqueErrorTypes: 1,
    totalErrorOccurrences: 2,
    mostFrequentError: {
      errorType: "TypeError",
      message: "checkout failed",
      count: 2,
    },
    newErrorsThisSession: 0,
  },
  totalGroups: 1,
  totalRawRecords: 1,
  offset: 0,
  limit: 100,
  truncated: false,
} as const;

describe("ErrorsView", () => {
  it("renders grouped errors and forwards resolve/ignore actions", async () => {
    const user = userEvent.setup();
    const onResolveGroup = vi.fn();
    const onIgnoreGroup = vi.fn();

    render(
      <ErrorsView
        page={page as never}
        loading={false}
        offset={0}
        limit={100}
        viewMode="grouped"
        sort="most-recent"
        errorType=""
        sourceFile=""
        tag=""
        selectedGroupId="group-1"
        selection={null}
        resolvedGroupIds={new Set()}
        ignoredGroupIds={new Set()}
        onViewModeChange={vi.fn()}
        onSortChange={vi.fn()}
        onErrorTypeChange={vi.fn()}
        onSourceFileChange={vi.fn()}
        onTagChange={vi.fn()}
        onSelectGroup={vi.fn()}
        onSelectRawRecord={vi.fn()}
        onResolveGroup={onResolveGroup}
        onIgnoreGroup={onIgnoreGroup}
        onPageChange={vi.fn()}
      />,
    );

    expect(screen.getByText("TypeError")).toBeInTheDocument();
    expect(screen.getByText("Error occurrences")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /resolve typeerror/i }));
    expect(onResolveGroup).toHaveBeenCalledWith("group-1");

    await user.click(screen.getByRole("button", { name: /ignore typeerror/i }));
    expect(onIgnoreGroup).toHaveBeenCalledWith("group-1");
  });

  it("renders raw error mode as a flat log list", () => {
    render(
      <ErrorsView
        page={page as never}
        loading={false}
        offset={0}
        limit={100}
        viewMode="raw"
        sort="most-recent"
        errorType=""
        sourceFile=""
        tag=""
        selectedGroupId={null}
        selection={{ kind: "record", id: "record-2" }}
        resolvedGroupIds={new Set()}
        ignoredGroupIds={new Set()}
        onViewModeChange={vi.fn()}
        onSortChange={vi.fn()}
        onErrorTypeChange={vi.fn()}
        onSourceFileChange={vi.fn()}
        onTagChange={vi.fn()}
        onSelectGroup={vi.fn()}
        onSelectRawRecord={vi.fn()}
        onResolveGroup={vi.fn()}
        onIgnoreGroup={vi.fn()}
        onPageChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Raw error events")).toBeInTheDocument();
    expect(screen.getAllByText("checkout failed").length).toBeGreaterThan(0);
  });
});
