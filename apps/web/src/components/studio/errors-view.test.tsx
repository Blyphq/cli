// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ErrorsView } from "./errors-view";

const baseData = {
  entries: [
    {
      kind: "error-group",
      fingerprint: "fp-1",
      errorType: "CheckoutError",
      message: "CheckoutError: checkout failed",
      messageFirstLine: "CheckoutError: checkout failed",
      occurrenceCount: 2,
      firstSeenAt: "2026-03-13T10:00:00.000Z",
      lastSeenAt: "2026-03-13T10:02:00.000Z",
      sourceLocation: null,
      fingerprintSource: {
        key: "src/routes/checkout.ts:4",
        kind: "caller",
        relativePath: "src/routes/checkout.ts",
        line: 4,
        column: null,
      },
      http: { method: "POST", path: "/checkout", statusCode: 500, url: null },
      sectionTags: ["errors", "payments"],
      sparklineBuckets: [0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0],
      representativeOccurrenceId: "rec-1",
      relatedTraceGroupId: "group-1",
    },
    {
      kind: "error-group",
      fingerprint: "fp-2",
      errorType: "AuthError",
      message: "AuthError: unauthorized",
      messageFirstLine: "AuthError: unauthorized",
      occurrenceCount: 1,
      firstSeenAt: "2026-03-13T10:03:00.000Z",
      lastSeenAt: "2026-03-13T10:03:00.000Z",
      sourceLocation: null,
      fingerprintSource: {
        key: "src/auth.ts:10",
        kind: "caller",
        relativePath: "src/auth.ts",
        line: 10,
        column: null,
      },
      http: { method: "POST", path: "/auth/login", statusCode: 401, url: null },
      sectionTags: ["errors", "auth"],
      sparklineBuckets: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      representativeOccurrenceId: "rec-2",
      relatedTraceGroupId: null,
    },
  ],
  groups: [],
  occurrences: [
    {
      kind: "occurrence",
      id: "rec-1",
      fingerprint: "fp-1",
      timestamp: "2026-03-13T10:02:00.000Z",
      level: "error",
      type: "CheckoutError",
      message: "CheckoutError: checkout failed",
      messageFirstLine: "CheckoutError: checkout failed",
      fileId: "file-1",
      fileName: "log.ndjson",
      filePath: "/tmp/log.ndjson",
      lineNumber: 1,
      caller: null,
      stack: "stack",
      stackFrames: [],
      http: null,
      sourceLocation: null,
      fingerprintSource: {
        key: "src/routes/checkout.ts:4",
        kind: "caller",
        relativePath: "src/routes/checkout.ts",
        line: 4,
        column: null,
      },
      sectionTags: ["errors", "payments"],
      relatedTraceGroupId: "group-1",
      structuredFields: {},
      raw: {},
    },
  ],
  stats: {
    uniqueErrorTypes: 2,
    totalOccurrences: 3,
    mostFrequentError: {
      fingerprint: "fp-1",
      type: "CheckoutError",
      messageFirstLine: "CheckoutError: checkout failed",
      count: 2,
    },
    newErrorsComparedToPreviousSessions: {
      available: false,
      count: null,
    },
  },
  totalMatched: 3,
  totalEntries: 2,
  scannedRecords: 3,
  returnedCount: 2,
  offset: 0,
  limit: 100,
  truncated: false,
  earliestTimestamp: "2026-03-13T10:00:00.000Z",
  latestTimestamp: "2026-03-13T10:03:00.000Z",
  availableTypes: ["AuthError", "CheckoutError"],
  availableSourceFiles: ["src/auth.ts", "src/routes/checkout.ts"],
  availableSectionTags: ["auth", "errors", "payments"],
} as const;

describe("ErrorsView", () => {
  it("renders grouped errors and can switch to raw mode", async () => {
    const user = userEvent.setup();
    const onUiChange = vi.fn();

    render(
      <ErrorsView
        data={baseData as never}
        loading={false}
        selection={{ kind: "error-group", id: "fp-1" }}
        ui={{
          view: "grouped",
          sort: "most-recent",
          type: "",
          sourceFile: "",
          sectionTag: "",
          showResolved: false,
          showIgnored: false,
        }}
        resolvedAtByFingerprint={{}}
        ignoredByFingerprint={{}}
        resolvedCollapsed={true}
        onUiChange={onUiChange}
        onSelect={vi.fn()}
        onToggleResolvedCollapsed={vi.fn()}
        onUnignore={vi.fn()}
      />,
    );

    expect(screen.getByText("CheckoutError")).toBeInTheDocument();
    await user.click(screen.getAllByRole("combobox")[0]!);
    expect(screen.getByText("Grouped errors")).toBeInTheDocument();
  });

  it("shows the resolved section when toggled on", () => {
    render(
      <ErrorsView
        data={baseData as never}
        loading={false}
        selection={{ kind: "error-group", id: "fp-1" }}
        ui={{
          view: "grouped",
          sort: "most-recent",
          type: "",
          sourceFile: "",
          sectionTag: "",
          showResolved: true,
          showIgnored: false,
        }}
        resolvedAtByFingerprint={{ "fp-1": "2026-03-13T10:05:00.000Z" }}
        ignoredByFingerprint={{}}
        resolvedCollapsed={false}
        onUiChange={vi.fn()}
        onSelect={vi.fn()}
        onToggleResolvedCollapsed={vi.fn()}
        onUnignore={vi.fn()}
      />,
    );

    expect(screen.getByText(/hide resolved/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /resolve checkouterror/i })).not.toBeInTheDocument();
  });
});
