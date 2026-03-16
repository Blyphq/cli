import { spinner } from "@clack/prompts";

import type { CommandContext, CommandDefinition } from "../types.js";
import { CliError } from "../lib/errors.js";
import {
  buildLogsHelpText,
  formatLogsInitializationResult,
  getLogsInitUsage,
  initializeLogsProject,
  parseLogsInitArgs,
} from "../lib/logs.js";
import { showNote, showSuccess } from "../lib/output.js";

export const logsCommand: CommandDefinition = {
  name: "logs",
  description: "Bootstrap blyp-js database logging schema and migrations.",
  usage: "blyphq logs init --adapter <prisma|drizzle> --dialect <postgres|mysql>",
  async run(context: CommandContext): Promise<void> {
    const [subcommand, ...subcommandArgs] = context.argv;

    if (subcommand === "-h" || subcommand === "--help" || !subcommand) {
      showNote("Logs", buildLogsHelpText());
      return;
    }

    if (subcommand !== "init") {
      throw new CliError(getLogsInitUsage());
    }

    if (
      subcommandArgs.includes("-h") ||
      subcommandArgs.includes("--help")
    ) {
      showNote("Logs", buildLogsHelpText());
      return;
    }

    const args = parseLogsInitArgs(subcommandArgs);
    const status = spinner();

    status.start(
      `Initializing Blyp database logging for ${args.adapter} (${args.dialect})`,
    );

    try {
      const result = await initializeLogsProject({
        cwd: context.cwd,
        adapter: args.adapter,
        dialect: args.dialect,
      });

      status.stop(
        result.status === "initialized"
          ? "Blyp database logging initialized"
          : "Blyp database logging already initialized",
      );
      showSuccess(
        result.status === "initialized"
          ? `Initialized database logging with ${result.adapter}.`
          : `Database logging is already initialized for ${result.adapter}.`,
      );
      showNote("Logs", formatLogsInitializationResult(result));
    } catch (error) {
      status.stop("Blyp database logging initialization failed");
      throw error;
    }
  },
};
