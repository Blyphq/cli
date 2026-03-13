#!/usr/bin/env node

import { commandRegistry, resolveCommand } from "./commands/index.js";
import { buildHelpText } from "./commands/help.js";
import { CliError } from "./lib/errors.js";
import { showError, showIntro, showNote, showOutro } from "./lib/output.js";
import { getDefaultCwd } from "./lib/runtime.js";

import type { CommandContext } from "./types.js";

async function main(argv: readonly string[]): Promise<boolean> {
  const [commandName, ...commandArgs] = argv;
  const command = resolveCommand(commandName);

  if (!command) {
    showError(`Unknown command: ${commandName ?? "(empty)"}`);
    showNote("Usage", buildHelpText(commandRegistry));
    process.exitCode = 1;
    return false;
  }

  const context: CommandContext = {
    argv: commandArgs,
    cwd: getDefaultCwd(),
  };

  await command.run(context);
  return true;
}

async function run(): Promise<void> {
  showIntro();

  try {
    const success = await main(process.argv.slice(2));

    if (!success || (process.exitCode !== undefined && process.exitCode !== 0)) {
      return;
    }

    showOutro("Done");
  } catch (error: unknown) {
    if (error instanceof CliError) {
      showError(error.message);
      process.exit(error.exitCode);
    }

    const message = error instanceof Error ? error.message : "Unknown CLI error";
    showError(message);
    process.exit(1);
  }
}

void run();
