// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PaymentsView } from "./payments-view";

const paymentsData = {
  stats: {
    checkoutAttempts: 2,
    successRate: 0.5,
    successRateTrend: "flat" as const,
    successRateDeltaPercent: null,
    successRateComparisonWindowLabel: "vs previous session window",
    failedPayments: 1,
    mostCommonFailureReason: "Card declined",
    revenueProcessed: {
      value: 9999,
      currency: "USD",
      display: "$99.99",
      inferredMinorUnits: true,
    },
    currency: "USD",
    webhookEvents: 1,
  },
  traces: [
    {
      id: "payment:trace:trace-success",
      correlationLabel: "trace-success",
      userId: "1842",
      amount: {
        value: 9999,
        currency: "USD",
        display: "$99.99",
        inferredMinorUnits: true,
      },
      durationMs: 243,
      status: "COMPLETED" as const,
      startedAt: "2026-03-13T12:00:00.000Z",
      finishedAt: "2026-03-13T12:00:00.243Z",
      recordCount: 4,
      failureReason: null,
      webhookEventCount: 1,
      representativeRecordId: "record-1",
    },
    {
      id: "payment:trace:trace-declined",
      correlationLabel: "trace-declined",
      userId: "2112",
      amount: {
        value: 4200,
        currency: "USD",
        display: "$42.00",
        inferredMinorUnits: true,
      },
      durationMs: 243,
      status: "DECLINED" as const,
      startedAt: "2026-03-13T12:01:00.000Z",
      finishedAt: "2026-03-13T12:01:00.243Z",
      recordCount: 2,
      failureReason: "Card declined",
      webhookEventCount: 0,
      representativeRecordId: "record-2",
    },
  ],
  failures: [
    {
      reason: "Card declined",
      count: 1,
      mostRecentAt: "2026-03-13T12:01:00.243Z",
      affectedUserIds: ["2112"],
    },
  ],
  webhooks: [
    {
      id: "webhook-1",
      recordId: "record-webhook-1",
      timestamp: "2026-03-13T12:00:01.000Z",
      eventType: "payment_intent.succeeded",
      route: "/webhook/stripe",
      result: "success" as const,
      traceId: "payment:trace:trace-success",
      payloadPreview: "{\"event\":{\"id\":\"evt_1\"}}",
    },
  ],
  totalTraces: 2,
  offset: 0,
  limit: 100,
  truncated: false,
} as const;

const declinedDetail = {
  trace: paymentsData.traces[1],
  timeline: [
    {
      id: "timeline-1",
      recordId: "record-2",
      timestamp: "2026-03-13T12:01:00.243Z",
      offsetMs: 243,
      level: "error",
      message: "payment declined",
      kind: "ERROR" as const,
      status: "DECLINED" as const,
      route: "/payment/confirm",
      durationMs: 243,
      fields: [
        { key: "payment.status", value: "declined" },
        { key: "http.status", value: "402" },
      ],
    },
  ],
  webhooks: [],
  correlationSignals: [{ key: "traceId", value: "trace-declined" }],
} as const;

describe("PaymentsView", () => {
  it("renders stats, traces, failures, webhooks, and routes actions", async () => {
    const user = userEvent.setup();
    const onSelectTrace = vi.fn();
    const onToggleExpand = vi.fn();
    const onAskAi = vi.fn();

    render(
      <PaymentsView
        page={paymentsData as never}
        loading={false}
        selectedTraceId={null}
        expandedTraceId="payment:trace:trace-declined"
        expandedTraceDetail={declinedDetail as never}
        expandedTraceLoading={false}
        onSelectTrace={onSelectTrace}
        onToggleExpand={onToggleExpand}
        onAskAi={onAskAi}
      />,
    );

    expect(screen.getByText("Checkout attempts")).toBeInTheDocument();
    expect(screen.getByText("Revenue processed")).toBeInTheDocument();
    expect(screen.getByText("Checkout traces")).toBeInTheDocument();
    expect(screen.getByText("Payment failures")).toBeInTheDocument();
    expect(screen.getByText("Webhook events")).toBeInTheDocument();
    expect(screen.getByText("payment_intent.succeeded")).toBeInTheDocument();
    expect(screen.getByText("payment declined")).toBeInTheDocument();

    await user.click(screen.getByText("trace-success"));
    expect(onSelectTrace).toHaveBeenCalledWith("payment:trace:trace-success");

    await user.click(screen.getAllByRole("button", { name: /ask ai/i })[0]!);
    expect(onAskAi).toHaveBeenCalledWith(
      expect.objectContaining({ id: "payment:trace:trace-declined" }),
    );
  });

  it("shows the payment empty state when no traces match", () => {
    render(
      <PaymentsView
        page={{
          ...paymentsData,
          stats: {
            ...paymentsData.stats,
            checkoutAttempts: 0,
            failedPayments: 0,
            revenueProcessed: null,
            webhookEvents: 0,
          },
          traces: [],
          failures: [],
          webhooks: [],
          totalTraces: 0,
        } as never}
        loading={false}
        selectedTraceId={null}
        expandedTraceId={null}
        expandedTraceDetail={null}
        expandedTraceLoading={false}
        onSelectTrace={vi.fn()}
        onToggleExpand={vi.fn()}
        onAskAi={vi.fn()}
      />,
    );

    expect(screen.getByText(/No payment activity matched this scope/)).toBeInTheDocument();
  });
});
