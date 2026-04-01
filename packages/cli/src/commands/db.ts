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

type DbSubcommandName = "init" | "migrate" | "generate";

function buildDbHelpText(): string {
  return [
    "Work with the Blyp database schema contract.",
    "",
    "Usage: blyp db <subcommand>",
    "",
    "Subcommands:",
    "  init      Scaffold or repair the Blyp schema contract and run migrations.",
    "  migrate   Run the configured database migration workflow.",
    "  generate  Run Prisma client generation for configured Prisma projects.",
    "",
    "Legacy aliases:",
    "  blyp db:init",
    "  blyp db:migrate",
    "  blyp db:generate",
  ].join("\n");
}

function buildDbInitHelpText(): string {
  return [
    "Guided Blyp database schema setup.",
    "",
    "Usage: blyp db init",
    "Alias: blyp db:init",
    "This command prompts for the adapter and dialect, scaffolds or repairs the",
    "Blyp database schema contract, runs migrations, and writes blyp.config.ts",
    "when the config file is safely owned by Blyp.",
  ].join("\n");
}

function buildDbMigrateHelpText(): string {
  return [
    "Run the configured database migration workflow.",
    "",
    "Usage: blyp db migrate",
    "Alias: blyp db:migrate",
  ].join("\n");
}

function buildDbGenerateHelpText(): string {
  return [
    "Run Prisma client generation for the configured project.",
    "",
    "Usage: blyp db generate",
    "Alias: blyp db:generate",
    "This command only works for Prisma projects.",
  ].join("\n");
}

function buildDbUsageError(message: string): CliError {
  return new CliError(`${message}\nUsage: blyp db <init|migrate|generate>`);
}

async function runDbInit(context: CommandContext): Promise<void> {
  if (
    context.argv[0] === "-h" ||
    context.argv[0] === "--help"
  ) {
    showNote("DB Init", buildDbInitHelpText());
    return;
  }

  if (context.argv.length > 0) {
    throw new CliError("Usage: blyp db init");
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

  status.start(`Preparing ${adapter} database schema`);

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

    const actionLabel =
      result.status === "repaired"
        ? "Database schema repaired"
        : "Database schema initialized";
    status.stop(actionLabel);

    showSuccess(
      result.status === "repaired"
        ? `Repaired the Blyp database schema contract with ${adapter}.`
        : `Initialized the Blyp database schema contract with ${adapter}.`,
    );
    showNote(
      "DB Init",
      [
        formatLogsInitializationResult(result),
        "",
        `blyp.config.ts: ${configWrite.status} (${configWrite.path})`,
      ].join("\n"),
    );
  } catch (error) {
    status.stop("Database schema initialization failed");
    throw error;
  }
}

async function runDbMigrate(context: CommandContext): Promise<void> {
  if (
    context.argv[0] === "-h" ||
    context.argv[0] === "--help"
  ) {
    showNote("DB Migrate", buildDbMigrateHelpText());
    return;
  }

  if (context.argv.length > 0) {
    throw new CliError("Usage: blyp db migrate");
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
}

async function runDbGenerate(context: CommandContext): Promise<void> {
  if (
    context.argv[0] === "-h" ||
    context.argv[0] === "--help"
  ) {
    showNote("DB Generate", buildDbGenerateHelpText());
    return;
  }

  if (context.argv.length > 0) {
    throw new CliError("Usage: blyp db generate");
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
}

function getDbSubcommandHandler(
  name: DbSubcommandName,
): (context: CommandContext) => Promise<void> {
  switch (name) {
    case "init":
      return runDbInit;
    case "migrate":
      return runDbMigrate;
    case "generate":
      return runDbGenerate;
  }
}

export const dbCommand: CommandDefinition = {
  name: "db",
  description: "Work with the Blyp database schema contract.",
  usage: "blyp db <init|migrate|generate>",
  async run(context: CommandContext): Promise<void> {
    const [subcommand, ...rest] = context.argv;

    if (subcommand === "-h" || subcommand === "--help") {
      showNote("DB", buildDbHelpText());
      return;
    }

    if (!subcommand) {
      throw buildDbUsageError("Missing database subcommand.");
    }

    if (
      subcommand !== "init" &&
      subcommand !== "migrate" &&
      subcommand !== "generate"
    ) {
      throw buildDbUsageError(`Unknown database subcommand: ${subcommand}`);
    }

    const handler = getDbSubcommandHandler(subcommand);
    await handler({
      ...context,
      argv: rest,
    });
  },
};

export const dbInitCommand: CommandDefinition = {
  name: "db:init",
  description: "Legacy alias for `blyp db init`.",
  usage: "blyp db:init",
  async run(context: CommandContext): Promise<void> {
    await runDbInit(context);
  },
};

export const dbMigrateCommand: CommandDefinition = {
  name: "db:migrate",
  description: "Legacy alias for `blyp db migrate`.",
  usage: "blyp db:migrate",
  async run(context: CommandContext): Promise<void> {
    await runDbMigrate(context);
  },
};

export const dbGenerateCommand: CommandDefinition = {
  name: "db:generate",
  description: "Legacy alias for `blyp db generate`.",
  usage: "blyp db:generate",
  async run(context: CommandContext): Promise<void> {
    await runDbGenerate(context);
  },
};
