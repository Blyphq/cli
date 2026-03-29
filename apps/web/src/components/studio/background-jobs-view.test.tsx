// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BackgroundJobDetailPanel } from "./background-job-detail-panel";
import { BackgroundJobsView } from "./background-jobs-view";

const page = {
  stats: {
    jobsDetected: 2,
    totalRuns: 3,
    successRate: 2 / 3,
    failedRuns: 1,
    mostCommonFailureReason: "database unavailable",
    avgDurationMs: 22000,
  },
  runs: [
    {
      id: "background:nightly-sync:run-2",
      jobName: "Nightly Sync",
      runId: "run-2",
      status: "FAILED" as const,
      startedAt: "2026-03-13T13:10:00.000Z",
      finishedAt: "2026-03-13T13:10:20.000Z",
      durationMs: 20000,
      outputFields: [{ key: "records_processed", value: "42" }],
      failure: {
        message: "database unavailable",
        reasonKey: "database unavailable",
        step: "store",
        stack: "Error: database unavailable\n at storeRecords",
      },
      recordCount: 2,
    },
  ],
  performance: [
    {
      jobName: "Nightly Sync",
      totalRuns: 3,
      successRate: 2 / 3,
      avgDurationMs: 20000,
      p95DurationMs: 25000,
      lastRunTimestamp: "2026-03-13T13:10:20.000Z",
      trend: "slower" as const,
    },
  ],
  totalRuns: 1,
  offset: 0,
  limit: 100,
  truncated: false,
} as const;

const detail = {
  run: page.runs[0],
  timeline: [
    {
      id: "event-1",
      recordId: "record-1",
      timestamp: "2026-03-13T13:10:00.000Z",
      level: "info",
      message: "nightly sync job started",
      status: "IN_PROGRESS" as const,
      step: "fetch",
      structuredFields: [],
    },
    {
      id: "event-2",
      recordId: "record-2",
      timestamp: "2026-03-13T13:10:20.000Z",
      level: "error",
      message: "nightly sync job failed",
      status: "FAILED" as const,
      step: "store",
      structuredFields: [{ key: "records_processed", value: "42" }],
    },
  ],
} as const;

afterEach(() => {
  cleanup();
});

describe("BackgroundJobsView", () => {
  it("renders stats, performance, and expandable run cards", async () => {
    const user = userEvent.setup();
    const onSelectRun = vi.fn();
    const onToggleExpand = vi.fn();

    render(
      <BackgroundJobsView
        page={page as never}
        loading={false}
        selectedRunId={page.runs[0].id}
        expandedRunId={page.runs[0].id}
        expandedRunDetail={detail as never}
        expandedRunLoading={false}
        onSelectRun={onSelectRun}
        onToggleExpand={onToggleExpand}
      />,
    );

    expect(screen.getByText("Jobs detected")).toBeInTheDocument();
    expect(screen.getByText("Job performance")).toBeInTheDocument();
    expect(screen.getAllByText("Nightly Sync").length).toBeGreaterThan(0);
    expect(screen.getAllByText("database unavailable").length).toBeGreaterThan(0);
    expect(screen.getByText("Slower")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /nightly sync/i }));
    expect(onSelectRun).toHaveBeenCalledWith(page.runs[0].id);

    await user.click(screen.getByRole("button", { name: /hide timeline/i }));
    expect(onToggleExpand).toHaveBeenCalledWith(page.runs[0].id);
  });
});

describe("BackgroundJobDetailPanel", () => {
  it("shows failure detail and Ask AI for failed runs", async () => {
    const user = userEvent.setup();
    const onAskAi = vi.fn();

    render(
      <BackgroundJobDetailPanel
        detail={detail as never}
        loading={false}
        onAskAi={onAskAi}
      />,
    );

    expect(screen.getByText("Failure detail")).toBeInTheDocument();
    expect(screen.getByText("Failed step: store")).toBeInTheDocument();
    expect(screen.getByText("Timeline")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /ask ai/i }));
    expect(onAskAi).toHaveBeenCalled();
  });

  it("hides failure detail for completed runs", () => {
    render(
      <BackgroundJobDetailPanel
        detail={{
          ...detail,
          run: {
            ...detail.run,
            status: "COMPLETED",
            failure: null,
          },
        } as never}
        loading={false}
        onAskAi={vi.fn()}
      />,
    );

    expect(screen.queryByText("Failure detail")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ask ai/i })).not.toBeInTheDocument();
  });
});
