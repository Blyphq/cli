// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { GroupSummaryRow } from "./group-summary-row";

describe("GroupSummaryRow", () => {
  it("renders grouped metadata and triggers selection", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();

    render(
      <table>
        <tbody>
          <GroupSummaryRow
            group={{
              kind: "structured-group",
              id: "group-1",
              groupKey: "checkout-1",
              groupingReason: "request-id",
              title: "checkout_flow",
              type: "checkout_flow",
              source: "structured",
              recordCount: 3,
              matchedRecordCount: 2,
              timestampStart: "2026-03-13T10:00:00.000Z",
              timestampEnd: "2026-03-13T10:00:03.000Z",
              levelSummary: ["error", "info"],
              fileIds: ["file-1"],
              fileNames: ["log.ndjson"],
              representativeRecordId: "record-1",
              previewMessages: ["checkout failed", "retry scheduled"],
            }}
            selected={false}
            onSelect={onSelect}
          />
        </tbody>
      </table>,
    );

    expect(screen.getAllByText("checkout_flow")).toHaveLength(2);
    expect(screen.getByText("3 logs")).toBeInTheDocument();
    await user.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledWith("group-1");
  });
});
