// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HttpView } from "./http-view";

const page = {
  stats: {
    totalRequests: 12,
    errorRate: 0.125,
    p50DurationMs: 120,
    p95DurationMs: 1500,
    requestsPerMinute: 3.2,
    statusGroups: {
      "2xx": 9,
      "3xx": 1,
      "4xx": 1,
      "5xx": 1,
    },
  },
  requests: [
    {
      id: "http:record-1",
      recordId: "record-1",
      timestamp: "2026-03-13T10:05:00.000Z",
      method: "GET",
      route: "/api/users/:id",
      rawPath: "/api/users/123",
      statusCode: 503,
      statusGroup: "5xx" as const,
      durationMs: 1500,
      traceGroupId: "group-1",
      traceId: "trace-1",
      requestId: "req-1",
    },
  ],
  totalRequests: 1,
  offset: 0,
  limit: 100,
  truncated: false,
  performance: [
    {
      route: "/api/users/:id",
      requests: 4,
      p50DurationMs: 140,
      p95DurationMs: 1500,
      errorRate: 0.25,
      lastSeenAt: "2026-03-13T10:05:00.000Z",
      highlight: "error" as const,
    },
  ],
  timeseries: [
    {
      start: "2026-03-13T10:00:00.000Z",
      end: "2026-03-13T10:01:00.000Z",
      counts: { "2xx": 2, "3xx": 0, "4xx": 0, "5xx": 1 },
    },
  ],
  facets: {
    methods: ["GET", "POST"],
    routes: ["/api/users/:id", "/api/orders/:id"],
    statusGroups: ["2xx", "3xx", "4xx", "5xx"] as const,
    durationRange: { min: 45, max: 1500 },
  },
} as const;

afterEach(() => {
  cleanup();
});

describe("HttpView", () => {
  it("renders stats, filters, chart, performance, and request table", () => {
    render(
      <HttpView
        page={page as never}
        loading={false}
        selectedRecordId={page.requests[0].recordId}
        httpUi={{ method: "", statusGroup: "", route: "", minDurationMs: "" }}
        onHttpUiChange={vi.fn()}
        onResetHttpFilters={vi.fn()}
        onSelectRecord={vi.fn()}
        onPageChange={vi.fn()}
        onSelectRoute={vi.fn()}
        onViewTrace={vi.fn()}
      />,
    );

    expect(screen.getByText("Total requests")).toBeInTheDocument();
    expect(screen.getByText("Status code distribution")).toBeInTheDocument();
    expect(screen.getByText("Endpoint performance")).toBeInTheDocument();
    expect(screen.getByText("Request log")).toBeInTheDocument();
    expect(screen.getAllByText("/api/users/:id").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /view trace/i })).toBeInTheDocument();
  });

  it("routes request, trace, and performance actions through callbacks", async () => {
    const user = userEvent.setup();
    const onSelectRecord = vi.fn();
    const onViewTrace = vi.fn();
    const onSelectRoute = vi.fn();

    render(
      <HttpView
        page={page as never}
        loading={false}
        selectedRecordId={null}
        httpUi={{ method: "", statusGroup: "", route: "", minDurationMs: "" }}
        onHttpUiChange={vi.fn()}
        onResetHttpFilters={vi.fn()}
        onSelectRecord={onSelectRecord}
        onPageChange={vi.fn()}
        onSelectRoute={onSelectRoute}
        onViewTrace={onViewTrace}
      />,
    );

    await user.click(screen.getByRole("button", { name: /view trace/i }));
    expect(onViewTrace).toHaveBeenCalledWith("group-1");

    await user.click(screen.getByRole("button", { name: /filter route \/api\/users\/:id/i }));
    expect(onSelectRoute).toHaveBeenCalledWith("/api/users/:id");

    await user.click(screen.getAllByRole("button", { name: /get \/api\/users\/:id/i })[0]!);
    expect(onSelectRecord).toHaveBeenCalledWith("record-1");
  });
});
