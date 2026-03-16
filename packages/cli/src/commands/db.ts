import { cancel, isCancel, select, spinner } from "@clack/prompts";

import type { CommandContext, CommandDefinition } from "../types.js";
import { CliError } from "../lib/errors.js";
import {
  detectConfiguredDatabaseAdapter,
  formatLogsInitializationResult,
  initializeLogsProject,
  runDatabaseGenerate,
  runDatabaseMigrate,
  writeBlypConfigFile,
} from "../lib/logs.js";
import { showNote, showSuccess } from "../lib/output.js";

function buildDbInitHelpText(): string {
  return [
    "Guided Blyp database logging setup.",
    "",
    "Usage: blyp db:init",
    "This command prompts for the adapter and dialect, scaffolds Blyp logging schema,",
    "runs migrations, and writes blyp.config.ts for you.",
  ].join("\n");
}

function buildDbMigrateHelpText(): string {
  return [
    "Run the configured database migration workflow.",
    "",
    "Usage: blyp db:migrate",
  ].join("\n");
}

function buildDbGenerateHelpText(): string {
  return [
    "Run Prisma client generation for the configured project.",
    "",
    "Usage: blyp db:generate",
    "This command only works for Prisma projects.",
  ].join("\n");
}

export const dbInitCommand: CommandDefinition = {
  name: "db:init",
  description: "Guided Blyp database logging setup.",
  usage: "blyp db:init",
  async run(context: CommandContext): Promise<void> {
    if (
      context.argv[0] === "-h" ||
      context.argv[0] === "--help"
    ) {
      showNote("DB Init", buildDbInitHelpText());
      return;
    }

    if (context.argv.length > 0) {
      throw new CliError("Usage: blyp db:init");
    }

    const adapterSelection = await select({
      message: "Choose the database adapter",
      options: [
        {
          value: "prisma",
          label: "prisma",
        },
        {
          value: "drizzle",
          label: "drizzle",
        },
      ],
    });
    if (isCancel(adapterSelection)) {
      cancel("Database initialization was cancelled.");
      throw new CliError("Database initialization was cancelled.");
    }
    const adapter = adapterSelection;
    const dialectSelection = await select({
      message: "Choose the SQL dialect",
      options: [
        {
          value: "postgres",
          label: "postgres",
        },
        {
          value: "mysql",
          label: "mysql",
        },
      ],
    });
    if (isCancel(dialectSelection)) {
      cancel("Database initialization was cancelled.");
      throw new CliError("Database initialization was cancelled.");
    }
    const dialect = dialectSelection;
    const status = spinner();

    status.start(`Initializing ${adapter} database logging`);

    try {
      const result = await initializeLogsProject({
        cwd: context.cwd,
        adapter,
        dialect,
      });

      const configWrite = await writeBlypConfigFile({
        cwd: context.cwd,
        snippet: result.snippet,
        overwrite: true,
      });

      status.stop("Database logging initialized");
      showSuccess(`Initialized Blyp database logging with ${adapter}.`);
      showNote(
        "DB Init",
        [
          formatLogsInitializationResult(result),
          "",
          `blyp.config.ts: ${configWrite.status} (${configWrite.path})`,
        ].join("\n"),
      );
    } catch (error) {
      status.stop("Database logging initialization failed");
      throw error;
    }
  },
};

export const dbMigrateCommand: CommandDefinition = {
  name: "db:migrate",
  description: "Run the configured database migration workflow.",
  usage: "blyp db:migrate",
  async run(context: CommandContext): Promise<void> {
    if (
      context.argv[0] === "-h" ||
      context.argv[0] === "--help"
    ) {
      showNote("DB Migrate", buildDbMigrateHelpText());
      return;
    }

    if (context.argv.length > 0) {
      throw new CliError("Usage: blyp db:migrate");
    }

    const status = spinner();
    status.start("Running database migrations");

    try {
      const adapter = await detectConfiguredDatabaseAdapter(context.cwd);
      const commands = await runDatabaseMigrate(context.cwd);

      status.stop("Database migrations finished");
      showSuccess(`Ran ${adapter} migration workflow.`);
      showNote("DB Migrate", commands.map((command) => `- ${command}`).join("\n"));
    } catch (error) {
      status.stop("Database migrations failed");
      throw error;
    }
  },
};

export const dbGenerateCommand: CommandDefinition = {
  name: "db:generate",
  description: "Run Prisma client generation for the configured project.",
  usage: "blyp db:generate",
  async run(context: CommandContext): Promise<void> {
    if (
      context.argv[0] === "-h" ||
      context.argv[0] === "--help"
    ) {
      showNote("DB Generate", buildDbGenerateHelpText());
      return;
    }

    if (context.argv.length > 0) {
      throw new CliError("Usage: blyp db:generate");
    }

    const status = spinner();
    status.start("Generating Prisma client");

    try {
      const command = await runDatabaseGenerate(context.cwd);

      status.stop("Prisma client generated");
      showSuccess("Prisma client generation finished.");
      showNote("DB Generate", command);
    } catch (error) {
      status.stop("Prisma client generation failed");
      throw error;
    }
  },
};
