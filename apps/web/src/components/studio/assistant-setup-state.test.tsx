// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AssistantSetupState } from "./assistant-setup-state";

describe("AssistantSetupState", () => {
  it("renders the missing api key guidance", () => {
    render(
      <AssistantSetupState
        status={{
          enabled: false,
          provider: "openrouter",
          model: null,
          apiKeySource: "missing",
          modelSource: "missing",
          reason: "missing_api_key",
        }}
      />,
    );

    expect(screen.getByText("Assistant")).toBeInTheDocument();
    expect(screen.getByText("Missing OPENROUTER_API_KEY")).toBeInTheDocument();
    expect(screen.getByText(/selected model/i)).toBeInTheDocument();
  });
});
