import type { CommandDefinition } from "../types.js";
import { createHelpCommand } from "./help.js";
import { healthCommand } from "./health.js";
import { studioCommand } from "./studio.js";

const baseCommands = [studioCommand, healthCommand] as const;

export const commandRegistry: readonly CommandDefinition[] = [
  ...baseCommands,
  createHelpCommand(baseCommands),
];

export function resolveCommand(name: string | undefined): CommandDefinition | null {
  if (!name) {
    return commandRegistry.find((command) => command.name === "help") ?? null;
  }

  if (name === "-h" || name === "--help") {
    return commandRegistry.find((command) => command.name === "help") ?? null;
  }

  return (
    commandRegistry.find(
      (command) =>
        command.name === name || command.aliases?.includes(name) === true,
    ) ?? null
  );
}
