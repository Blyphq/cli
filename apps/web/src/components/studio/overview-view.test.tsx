// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OverviewView } from "./overview-view";

const overview = {
  connectedAt: "2026-03-13T11:59:00.000Z",
  generatedAt: "2026-03-13T12:00:00.000Z",
  stats: {
    totalEvents: {
      value: 120,
      label: "Total events",
      status: "healthy" as const,
      helperText: "Count of all events in the current overview scope.",
    },
    errorRate: {
      value: 5,
      label: "Error rate",
      status: "critical" as const,
      helperText: "6 errors in 120 events.",
      trend: "up" as const,
      deltaPercent: 20,
      comparisonWindowLabel: "vs last 10 min",
    },
    activeTraces: {
      value: 2,
      label: "Active traces",
      status: "healthy" as const,
      helperText: "Recently started traces without a completion signal yet.",
    },
    warnings: {
      value: 3,
      label: "Warnings",
      status: "warning" as const,
      helperText: "Warning-level events in the last 15 minutes.",
    },
    avgResponseTime: {
      value: 612,
      label: "Avg response time",
      status: "warning" as const,
      helperText: "p50 across HTTP logs in the current overview scope.",
    },
    uptime: {
      value: 0,
      label: "Uptime",
      status: "healthy" as const,
      helperText: "Time since Studio connected to this project.",
    },
  },
  liveFeed: [
    {
      recordId: "record-1",
      timestamp: "2026-03-13T11:59:59.000Z",
      level: "error",
      message: "checkout failed",
      summaryFields: [
        { key: "HTTP", value: "POST /checkout" },
        { key: "Status", value: "500" },
      ],
      target: {
        sectionId: "payments" as const,
        selection: { kind: "record" as const, id: "record-1" },
      },
    },
  ],
  sections: [
    {
      id: "payments" as const,
      label: "Payments",
      icon: "💳",
      eventCount: 12,
      errorCount: 1,
      lastEventAt: "2026-03-13T11:59:59.000Z",
      status: "critical" as const,
    },
  ],
  recentErrors: Array.from({ length: 6 }, (_, index) => ({
    groupId: `group-${index + 1}`,
    recordId: `record-${index + 1}`,
    message: `error ${index + 1}`,
    timestamp: "2026-03-13T11:59:59.000Z",
    sourceFile: "src/routes/checkout.ts",
    sourceLine: 4,
    traceReference: {
      kind: "record" as const,
      id: `record-${index + 1}`,
      sectionId: "payments" as const,
      label: "Payments trace",
    },
  })).slice(0, 5),
};

afterEach(() => {
  vi.useRealTimers();
});

describe("OverviewView", () => {
  it("renders all six stat cards and overview panels", () => {
    render(
      <OverviewView
        overview={overview as never}
        connectedAt="2026-03-13T11:59:00.000Z"
        onSelect={vi.fn()}
        onSelectFeedTarget={vi.fn()}
        onViewTrace={vi.fn()}
        onAskAiForError={vi.fn()}
      />,
    );

    expect(screen.getByText("Total events")).toBeInTheDocument();
    expect(screen.getByText("Error rate")).toBeInTheDocument();
    expect(screen.getByText("Active traces")).toBeInTheDocument();
    expect(screen.getByText("Warnings")).toBeInTheDocument();
    expect(screen.getByText("Avg response time")).toBeInTheDocument();
    expect(screen.getByText("Uptime")).toBeInTheDocument();
    expect(screen.getByText("Live activity feed")).toBeInTheDocument();
    expect(screen.getByText("Recent errors")).toBeInTheDocument();
  });

  it("opens feed targets, section cards, trace links, and ask-ai actions", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onSelectFeedTarget = vi.fn();
    const onViewTrace = vi.fn();
    const onAskAiForError = vi.fn();

    render(
      <OverviewView
        overview={overview as never}
        connectedAt="2026-03-13T11:59:00.000Z"
        onSelect={onSelect}
        onSelectFeedTarget={onSelectFeedTarget}
        onViewTrace={onViewTrace}
        onAskAiForError={onAskAiForError}
      />,
    );

    await user.click(screen.getByRole("button", { name: /open$/i }));
    expect(onSelectFeedTarget).toHaveBeenCalledWith(
      expect.objectContaining({ sectionId: "payments" }),
    );

    await user.click(screen.getByRole("button", { name: /open section/i }));
    expect(onSelect).toHaveBeenCalledWith("payments");

    await user.click(screen.getAllByRole("button", { name: /view trace/i })[0]!);
    expect(onViewTrace).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: "group-1" }),
    );

    await user.click(screen.getAllByRole("button", { name: /ask ai/i })[0]!);
    expect(onAskAiForError).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: "group-1" }),
    );
  });

  it("shows calm empty states when overview data is empty", () => {
    render(
      <OverviewView
        overview={{
          ...overview,
          stats: {
            ...overview.stats,
            totalEvents: {
              ...overview.stats.totalEvents,
              value: 0,
              status: "warning",
            },
          },
          liveFeed: [],
          sections: [],
          recentErrors: [],
        } as never}
        connectedAt="2026-03-13T11:59:00.000Z"
        onSelect={vi.fn()}
        onSelectFeedTarget={vi.fn()}
        onViewTrace={vi.fn()}
        onAskAiForError={vi.fn()}
      />,
    );

    expect(screen.getByText(/Recent events will stream here/)).toBeInTheDocument();
    expect(screen.getByText(/No sections detected yet/)).toBeInTheDocument();
    expect(screen.getByText(/No recent errors matched/)).toBeInTheDocument();
  });

  it("pauses the feed auto-scroll on hover", () => {
    vi.useFakeTimers();

    render(
      <OverviewView
        overview={overview as never}
        connectedAt="2026-03-13T11:59:00.000Z"
        onSelect={vi.fn()}
        onSelectFeedTarget={vi.fn()}
        onViewTrace={vi.fn()}
        onAskAiForError={vi.fn()}
      />,
    );

    const feed = screen.getByText("Live activity feed").closest("[data-slot='card']")!;
    const scrollRegion = feed.querySelector(".overflow-y-auto") as HTMLDivElement;
    fireEvent.mouseEnter(scrollRegion);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText(/Auto-scroll paused/)).toBeInTheDocument();
  });
});
