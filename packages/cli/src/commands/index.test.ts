import { describe, expect, it } from "vitest";

import { buildHelpText } from "./help.js";
import { commandRegistry, resolveCommand } from "./index.js";

describe("command registry", () => {
  it("resolves the skills command", () => {
    const command = resolveCommand("skills");

    expect(command?.name).toBe("skills");
  });

  it("includes skills in global help output", () => {
    const helpText = buildHelpText(commandRegistry);

    expect(helpText).toContain("skills");
    expect(helpText).toContain("blyphq skills install [source-or-skill-name] [--force]");
  });
});
