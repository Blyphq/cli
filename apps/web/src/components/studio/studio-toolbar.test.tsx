// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { StudioToolbar } from "./studio-toolbar";

describe("StudioToolbar", () => {
  it("renders the Chat with Blyp button and triggers standalone chat", async () => {
    const onStartStandaloneChat = vi.fn();
    const user = userEvent.setup();

    render(
      <StudioToolbar
        draftProjectPath=""
        facets={undefined}
        files={[]}
        filters={{
          level: "",
          type: "",
          search: "",
          fileId: "",
          from: "",
          to: "",
        }}
        grouping="grouped"
        meta={undefined}
        onDraftProjectPathChange={vi.fn()}
        onFilterChange={vi.fn()}
        onGroupingChange={vi.fn()}
        onInspect={vi.fn()}
        onResetFilters={vi.fn()}
        onStartStandaloneChat={onStartStandaloneChat}
      />,
    );

    const button = screen.getByRole("button", { name: /chat with blyp/i });
    expect(button).toBeInTheDocument();
    await user.click(button);
    expect(onStartStandaloneChat).toHaveBeenCalled();
  });
});
