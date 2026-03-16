import { describe, expect, it } from "vitest";

import { buildHelpText } from "./help.js";
import { commandRegistry, resolveCommand } from "./index.js";

describe("command registry", () => {
  it("resolves the db:init command", () => {
    const command = resolveCommand("db:init");

    expect(command?.name).toBe("db:init");
  });

  it("includes database commands in global help output", () => {
    const helpText = buildHelpText(commandRegistry);

    expect(helpText).toContain("blyphq skills install [source-or-skill-name] [--force]");
    expect(helpText).toContain("db:init");
    expect(helpText).toContain("blyphq db:init");
    expect(helpText).toContain("blyphq db:migrate");
    expect(helpText).toContain("blyphq db:generate");
  });
});
