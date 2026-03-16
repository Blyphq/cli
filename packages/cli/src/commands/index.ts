import type { CommandDefinition } from "../types.js";
import { createHelpCommand } from "./help.js";
import { healthCommand } from "./health.js";
import { logsCommand } from "./logs.js";
import { skillsCommand } from "./skills.js";
import { studioCommand } from "./studio.js";
import { versionCommand } from "./version.js";

const baseCommands = [
  studioCommand,
  healthCommand,
  skillsCommand,
  logsCommand,
] as const;

export const commandRegistry: readonly CommandDefinition[] = [
  ...baseCommands,
  createHelpCommand(baseCommands),
  versionCommand,
];

export function resolveCommand(name: string | undefined): CommandDefinition | null {
  if (!name) {
    return commandRegistry.find((command) => command.name === "help") ?? null;
  }

  if (name === "-h" || name === "--help") {
    return commandRegistry.find((command) => command.name === "help") ?? null;
  }

  if (name === "-V" || name === "--version") {
    return commandRegistry.find((command) => command.name === "version") ?? null;
  }

  return (
    commandRegistry.find(
      (command) =>
        command.name === name || command.aliases?.includes(name) === true,
    ) ?? null
  );
}
