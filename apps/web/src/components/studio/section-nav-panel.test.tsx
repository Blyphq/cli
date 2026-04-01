// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SectionNavPanel } from "./section-nav-panel";

const invalidateQueries = vi.fn(() => Promise.resolve());
const queryFilter = vi.fn((input: { projectPath: string }) => ({
  queryKey: [["studio", "meta"], { input }],
}));

vi.mock("@tanstack/react-query", () => ({
  useMutation: (options: { onSuccess?: () => Promise<void> | void }) => ({
    isPending: false,
    mutate: async () => {
      await options.onSuccess?.();
    },
  }),
  useQueryClient: () => ({
    invalidateQueries,
  }),
}));

vi.mock("@/utils/trpc", () => ({
  useTRPC: () => ({
    studio: {
      addCustomSection: {
        mutationOptions: (options: unknown) => options,
      },
      meta: {
        queryFilter,
      },
    },
  }),
}));

describe("SectionNavPanel", () => {
  it("invalidates only the studio meta query after adding a section", async () => {
    const user = userEvent.setup();

    render(
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
        onSelect={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /add section/i }));
    await user.type(screen.getByPlaceholderText("Section name"), "KYC");
    await user.click(screen.getByRole("button", { name: /save section/i }));

    await waitFor(() => {
      expect(queryFilter).toHaveBeenCalledWith({ projectPath: "/project" });
      expect(invalidateQueries).toHaveBeenCalledWith(
        queryFilter.mock.results[0]?.value,
      );
    });
  });
});
