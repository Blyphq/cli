import type { CommandContext, CommandDefinition } from "../types.js";
import { showNote } from "../lib/output.js";

export function createHelpCommand(
  commands: readonly CommandDefinition[],
): CommandDefinition {
  return {
    name: "help",
    description: "Show available commands and usage.",
    usage: "blyphq [command]",
    async run(_context: CommandContext): Promise<void> {
      showNote("Usage", buildHelpText(commands));
    },
  };
}

export function buildHelpText(commands: readonly CommandDefinition[]): string {
  const commandLines = commands
    .map((command) => {
      const usageSuffix = command.usage ? `\n    ${command.usage}` : "";
      return `  ${command.name.padEnd(8)} ${command.description}${usageSuffix}`;
    })
    .join("\n");

  return [
    "blyphq is the Blyp local workflow CLI.",
    "",
    "Usage:",
    "  blyphq <command>",
    "",
    "Commands:",
    commandLines,
  ].join("\n");
}
