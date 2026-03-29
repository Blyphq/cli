import { describe, expect, it } from "vitest";

import {
  formatDuration,
  getAssistantStatusLabel,
  shouldShowProjectContextAdvisory,
  type StudioAssistantStatus,
} from "./studio";

const configuredStatus: StudioAssistantStatus = {
  enabled: true,
  provider: "openrouter",
  model: "openai/gpt-5.4",
  availableModels: ["openai/gpt-5.4"],
  apiKeySource: "process-env",
  modelSource: "process-env",
  reason: null,
  projectContext: {
    claudeMdPresent: false,
    claudeMdPath: null,
  },
};

describe("studio assistant status helpers", () => {
  it("labels missing AI configuration states", () => {
    expect(
      getAssistantStatusLabel({
        ...configuredStatus,
        enabled: false,
        reason: "missing_api_key",
      }),
    ).toBe("Missing OPENROUTER_API_KEY");

    expect(
      getAssistantStatusLabel({
        ...configuredStatus,
        enabled: false,
        reason: "missing_model",
      }),
    ).toBe("Missing AI model");
  });

  it("shows the CLAUDE.md advisory only when AI is enabled and project context is missing", () => {
    expect(shouldShowProjectContextAdvisory(configuredStatus)).toBe(true);
    expect(
      shouldShowProjectContextAdvisory({
        ...configuredStatus,
        projectContext: {
          claudeMdPresent: true,
          claudeMdPath: "/project/CLAUDE.md",
        },
      }),
    ).toBe(false);
    expect(
      shouldShowProjectContextAdvisory({
        ...configuredStatus,
        enabled: false,
        reason: "missing_api_key",
      }),
    ).toBe(false);
  });
});

describe("formatDuration", () => {
  it("normalizes rounded minute-second output", () => {
    expect(formatDuration(119_600)).toBe("2m 0s");
  });
});
