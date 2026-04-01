import { describe, expect, it } from "vitest";

import { CliError } from "../lib/errors.js";
import { dbCommand } from "./db.js";
import { buildHelpText } from "./help.js";
import { commandRegistry, resolveCommand } from "./index.js";

describe("command registry", () => {
  it("resolves the db command", () => {
    const command = resolveCommand("db");

    expect(command?.name).toBe("db");
  });

  it("resolves the db:init command", () => {
    const command = resolveCommand("db:init");

    expect(command?.name).toBe("db:init");
  });

  it("includes database commands in global help output", () => {
    const helpText = buildHelpText(commandRegistry);

    expect(helpText).toContain("blyp skills install [source-or-skill-name|claude] [--force]");
    expect(helpText).toContain("blyp db <init|migrate|generate>");
    expect(helpText).toContain("blyp db:init");
    expect(helpText).toContain("blyp db:migrate");
    expect(helpText).toContain("blyp db:generate");
  });
});

describe("db command", () => {
  it("prints help for the root db command", async () => {
    await expect(
      dbCommand.run({
        argv: ["--help"],
        cwd: process.cwd(),
      }),
    ).resolves.toBeUndefined();
  });

  it("fails on missing or unknown subcommands", async () => {
    await expect(
      dbCommand.run({
        argv: [],
        cwd: process.cwd(),
      }),
    ).rejects.toThrowError(
      new CliError("Missing database subcommand.\nUsage: blyp db <init|migrate|generate>"),
    );

    await expect(
      dbCommand.run({
        argv: ["nope"],
        cwd: process.cwd(),
      }),
    ).rejects.toThrowError(
      new CliError("Unknown database subcommand: nope\nUsage: blyp db <init|migrate|generate>"),
    );
  });
});
