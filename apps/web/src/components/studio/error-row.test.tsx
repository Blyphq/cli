// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ErrorGroupRow } from "./error-group-row";
import { ErrorRawRow } from "./error-raw-row";

afterEach(() => {
  cleanup();
});

describe("Error row HTTP summaries", () => {
  it("preserves grouped error status code 0", () => {
    render(
      <ErrorGroupRow
        group={{
          fingerprint: "fp-0",
          errorType: "CheckoutError",
          message: "status zero",
          messageFirstLine: "status zero",
          occurrenceCount: 1,
          firstSeenAt: "2026-03-13T10:00:00.000Z",
          lastSeenAt: "2026-03-13T10:00:00.000Z",
          sourceLocation: null,
          fingerprintSource: {
            key: "src/routes/checkout.ts:4",
            kind: "caller",
            relativePath: "src/routes/checkout.ts",
            line: 4,
            column: null,
          },
          http: { method: "POST", path: "/checkout", statusCode: 0, url: null },
          sectionTags: [],
          sparklineBuckets: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          representativeOccurrenceId: "record-1",
          relatedTraceGroupId: null,
        }}
        selected={false}
        sessionStart="2026-03-13T10:00:00.000Z"
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("POST /checkout 0")).toBeInTheDocument();
  });

  it("preserves raw error status code 0", () => {
    render(
      <ErrorRawRow
        occurrence={{
          id: "occurrence-0",
          fingerprint: "fp-0",
          timestamp: "2026-03-13T10:00:00.000Z",
          level: "error",
          type: "CheckoutError",
          message: "status zero",
          messageFirstLine: "status zero",
          fileId: "file-1",
          fileName: "log.ndjson",
          filePath: "/tmp/log.ndjson",
          lineNumber: 1,
          caller: null,
          stack: null,
          stackFrames: [],
          http: { method: "POST", path: "/checkout", statusCode: 0, url: null },
          sourceLocation: null,
          fingerprintSource: {
            key: "src/routes/checkout.ts:4",
            kind: "caller",
            relativePath: "src/routes/checkout.ts",
            line: 4,
            column: null,
          },
          sectionTags: [],
          relatedTraceGroupId: null,
          structuredFields: {},
          raw: {},
        }}
        selected={false}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("POST /checkout 0")).toBeInTheDocument();
  });
});
