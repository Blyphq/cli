// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DatabaseView } from "./database-view";
import { SectionNavPanel } from "./section-nav-panel";

const databaseData = {
  stats: {
    totalQueries: 3,
    slowQueries: 2,
    failedQueries: 1,
    avgQueryTimeMs: 208.3,
    activeTransactions: 1,
  },
  queries: [
    {
      id: "q-1",
      recordId: "record-1",
      timestamp: "2026-03-13T10:00:00.000Z",
      operation: "SELECT",
      modelOrTable: "User",
      durationMs: 101,
      status: "slow",
      transactionId: "tx-1",
      requestId: "req-1",
      traceId: "trace-1",
      queryText: "SELECT * FROM users",
      params: { id: "user-1" },
      errorMessage: null,
      durationBreakdown: { db: 101 },
      adapter: "prisma",
    },
    {
      id: "q-2",
      recordId: "record-2",
      timestamp: "2026-03-13T10:00:01.000Z",
      operation: "UPDATE",
      modelOrTable: "Order",
      durationMs: 501,
      status: "slow",
      transactionId: "tx-1",
      requestId: null,
      traceId: null,
      queryText: "UPDATE orders SET status = $1",
      params: null,
      errorMessage: null,
      durationBreakdown: null,
      adapter: "drizzle",
    },
  ],
  totalQueries: 2,
  slowQueries: [
    {
      id: "q-2",
      recordId: "record-2",
      timestamp: "2026-03-13T10:00:01.000Z",
      operation: "UPDATE",
      modelOrTable: "Order",
      durationMs: 501,
      status: "slow",
      transactionId: "tx-1",
      requestId: null,
      traceId: null,
      queryText: "UPDATE orders SET status = $1",
      params: null,
      errorMessage: null,
      durationBreakdown: null,
      adapter: "drizzle",
    },
    {
      id: "q-1",
      recordId: "record-1",
      timestamp: "2026-03-13T10:00:00.000Z",
      operation: "SELECT",
      modelOrTable: "User",
      durationMs: 101,
      status: "slow",
      transactionId: "tx-1",
      requestId: "req-1",
      traceId: "trace-1",
      queryText: "SELECT * FROM users",
      params: { id: "user-1" },
      errorMessage: null,
      durationBreakdown: { db: 101 },
      adapter: "prisma",
    },
  ],
  transactions: [
    {
      id: "tx-1",
      startRecordId: "record-start",
      timestampStart: "2026-03-13T10:00:00.000Z",
      timestampEnd: null,
      durationMs: null,
      result: "open",
      requestId: "req-1",
      traceId: "trace-1",
      queries: [
        {
          id: "q-1",
          recordId: "record-1",
          timestamp: "2026-03-13T10:00:00.000Z",
          operation: "SELECT",
          modelOrTable: "User",
          durationMs: 101,
          status: "slow",
          transactionId: "tx-1",
          requestId: "req-1",
          traceId: "trace-1",
          queryText: "SELECT * FROM users",
          params: { id: "user-1" },
          errorMessage: null,
          durationBreakdown: null,
          adapter: "prisma",
        },
      ],
    },
  ],
  migrationEvents: [
    {
      id: "m-1",
      recordId: "record-migration",
      timestamp: "2026-03-13T09:55:00.000Z",
      name: "add_users",
      version: "20260313_add_users",
      durationMs: 800,
      success: false,
      errorMessage: "migration failed",
    },
  ],
} as const;

describe("DatabaseView", () => {
  it("renders stats, sorts slow queries, and routes actions", async () => {
    const user = userEvent.setup();
    const onSelectRecord = vi.fn();
    const onAskAi = vi.fn();

    render(
      <DatabaseView
        database={databaseData as never}
        loading={false}
        selectedRecordId={null}
        onSelectRecord={onSelectRecord}
        onAskAi={onAskAi}
      />,
    );

    expect(screen.getByText("Total queries")).toBeInTheDocument();
    expect(screen.getByText("Avg query time")).toBeInTheDocument();
    expect(screen.getAllByText("101ms").length).toBeGreaterThan(0);
    expect(screen.getAllByText("501ms").length).toBeGreaterThan(0);

    const slowQueryButtons = screen.getAllByRole("button", { name: /ask ai/i });
    await user.click(slowQueryButtons[0]!);
    expect(onAskAi).toHaveBeenCalledWith(
      expect.objectContaining({ recordId: "record-2", durationMs: 501 }),
    );

    await user.click(screen.getByRole("button", { name: /^select$/i }));
    expect(onSelectRecord).toHaveBeenCalledWith("record-1");

    expect(screen.getByText("migration failed")).toBeInTheDocument();
  });

  it("shows the database empty state when no queries match", () => {
    render(
      <DatabaseView
        database={{
          ...databaseData,
          queries: [],
          totalQueries: 0,
          slowQueries: [],
          transactions: [],
          migrationEvents: [],
        } as never}
        loading={false}
        selectedRecordId={null}
        onSelectRecord={vi.fn()}
        onAskAi={vi.fn()}
      />,
    );

    expect(
      screen.getByText("No database queries matched the current filters"),
    ).toBeInTheDocument();
  });
});

describe("Database section nav", () => {
  it("shows Database only when meta exposes the section", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    const { rerender } = render(
      <SectionNavPanel
        projectPath="/project"
        meta={{
          project: {} as never,
          config: {} as never,
          sections: [],
          logs: {} as never,
        }}
        section="overview"
        visitedAtBySection={{}}
        onSelect={onSelect}
      />,
    );

    expect(screen.queryByText("Database")).not.toBeInTheDocument();

    rerender(
      <SectionNavPanel
        projectPath="/project"
        meta={{
          project: {} as never,
          config: {} as never,
          sections: [
            {
              id: "database",
              label: "Database",
              count: 4,
              icon: "🗄",
              kind: "builtin",
              highlighted: false,
              unreadErrorCount: 1,
              lastMatchedAt: "2026-03-13T10:00:00.000Z",
              lastErrorAt: "2026-03-13T10:00:00.000Z",
            },
          ],
          logs: {} as never,
        }}
        section="overview"
        visitedAtBySection={{}}
        onSelect={onSelect}
      />,
    );

    await user.click(screen.getByRole("button", { name: /database/i }));
    expect(onSelect).toHaveBeenCalledWith("database");
  });
});
