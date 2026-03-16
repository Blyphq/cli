import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import {
  access,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { once } from "node:events";
import path from "node:path";

import { CliError } from "./errors.js";

export type LogsAdapter = "prisma" | "drizzle";
export type LogsDialect = "postgres" | "mysql";

export interface LogsInitArgs {
  readonly adapter: LogsAdapter;
  readonly dialect: LogsDialect;
}

export interface InitializeLogsProjectInput extends LogsInitArgs {
  readonly cwd: string;
}

export interface RunExternalCommandInput {
  readonly cwd: string;
  readonly label: string;
  readonly command: readonly string[];
}

export type ExternalCommandRunner = (
  input: RunExternalCommandInput,
) => Promise<void>;

export interface InitializeLogsProjectOptions {
  readonly runCommand?: ExternalCommandRunner;
}

export interface LogsInitializationResult {
  readonly status: "initialized" | "already_initialized";
  readonly adapter: LogsAdapter;
  readonly dialect: LogsDialect;
  readonly detected: string[];
  readonly selectedPaths: string[];
  readonly filesChanged: string[];
  readonly migrationCommands: string[];
  readonly migrationGeneratedPaths: string[];
  readonly migrationApplied: boolean;
  readonly snippet: string;
  readonly followUp: string[];
}

interface PackageManifest {
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
  readonly scripts?: Record<string, string>;
}

interface CommandPlan {
  readonly label: string;
  readonly command: readonly string[];
}

interface PrismaProject {
  readonly adapter: "prisma";
  readonly dialect: LogsDialect;
  readonly schemaPath: string;
  readonly migrationDir: string;
  readonly detected: string[];
  readonly selectedPaths: string[];
  readonly migrationPlan: readonly CommandPlan[];
  readonly snippet: string;
}

interface DrizzleSchemaTarget {
  readonly kind: "directory" | "file";
  readonly path: string;
  readonly selectionNote: string | null;
}

interface DrizzleProject {
  readonly adapter: "drizzle";
  readonly dialect: LogsDialect;
  readonly configPath: string;
  readonly schemaTarget: DrizzleSchemaTarget;
  readonly schemaFilePath: string;
  readonly dbModulePath: string;
  readonly migrationDir: string;
  readonly detected: string[];
  readonly selectedPaths: string[];
  readonly migrationPlan: readonly CommandPlan[];
  readonly snippet: string;
}

type DetectedProject = PrismaProject | DrizzleProject;

interface SchemaUpdateResult {
  readonly changed: boolean;
  readonly filePath: string;
}

export interface BylpConfigWriteResult {
  readonly path: string;
  readonly status: "created" | "updated" | "unchanged" | "skipped";
}

const LOGS_INIT_USAGE =
  "Usage: blyphq logs init --adapter <prisma|drizzle> --dialect <postgres|mysql>";
const BLYP_CONFIG_FILE_NAMES = [
  "blyp.config.ts",
  "blyp.config.mts",
  "blyp.config.cts",
  "blyp.config.js",
  "blyp.config.mjs",
  "blyp.config.cjs",
  "blyp.config.json",
] as const;
const DRIZZLE_CONFIG_FILES = [
  "drizzle.config.ts",
  "drizzle.config.js",
  "drizzle.config.mjs",
  "drizzle.config.cjs",
] as const;
const DRIZZLE_SCHEMA_CANDIDATES = [
  "src/db/schema",
  "db/schema",
  "src/schema",
  "schema",
] as const;
const DRIZZLE_SCHEMA_FILE_CANDIDATES = [
  "src/db/schema.ts",
  "db/schema.ts",
  "src/schema.ts",
  "schema.ts",
] as const;
const MIGRATION_NAME = "blyp_logs_init";

export function getLogsInitUsage(): string {
  return LOGS_INIT_USAGE;
}

export function buildLogsHelpText(): string {
  return [
    "Bootstrap Blyp database logging schema and migrations.",
    "",
    LOGS_INIT_USAGE,
    "Examples:",
    "  blyphq logs init --adapter prisma --dialect postgres",
    "  blyphq logs init --adapter prisma --dialect mysql",
    "  blyphq logs init --adapter drizzle --dialect postgres",
    "  blyphq logs init --adapter drizzle --dialect mysql",
    "",
    "Supported adapters: prisma, drizzle",
    "Supported dialects: postgres, mysql",
    "This command scaffolds the Blyp log table for blyp-js database logging,",
    "creates and applies migrations, and prints the runtime snippet for blyp.config.ts.",
    "It does not create database tables at runtime.",
  ].join("\n");
}

export function parseLogsInitArgs(argv: readonly string[]): LogsInitArgs {
  let adapter: LogsAdapter | null = null;
  let dialect: LogsDialect | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current) {
      continue;
    }

    if (current === "--adapter") {
      const value = argv[index + 1];
      if (value !== "prisma" && value !== "drizzle") {
        throw new CliError(
          `Expected --adapter to be one of prisma or drizzle.\n${LOGS_INIT_USAGE}`,
        );
      }

      adapter = value;
      index += 1;
      continue;
    }

    if (current === "--dialect") {
      const value = argv[index + 1];
      if (value !== "postgres" && value !== "mysql") {
        throw new CliError(
          `Expected --dialect to be one of postgres or mysql.\n${LOGS_INIT_USAGE}`,
        );
      }

      dialect = value;
      index += 1;
      continue;
    }

    if (current.startsWith("-")) {
      throw new CliError(`Unknown flag: ${current}\n${LOGS_INIT_USAGE}`);
    }

    throw new CliError(
      `Unexpected argument: ${current}\n${LOGS_INIT_USAGE}`,
    );
  }

  if (!adapter || !dialect) {
    throw new CliError(
      `Both --adapter and --dialect are required.\n${LOGS_INIT_USAGE}`,
    );
  }

  return {
    adapter,
    dialect,
  };
}

export async function initializeLogsProject(
  input: InitializeLogsProjectInput,
  options: InitializeLogsProjectOptions = {},
): Promise<LogsInitializationResult> {
  const manifest = await readPackageManifest(input.cwd);
  const packageManager = await detectPackageManager(input.cwd);
  const runCommand = options.runCommand ?? defaultRunExternalCommand;
  const project = await detectProject({
    cwd: input.cwd,
    adapter: input.adapter,
    dialect: input.dialect,
    manifest,
    packageManager,
  });

  const beforeMigrationFiles = await listRelativeFiles(project.migrationDir);
  const schemaUpdate =
    project.adapter === "prisma"
      ? await ensurePrismaSchema(project)
      : await ensureDrizzleSchema(project);

  if (!schemaUpdate.changed) {
    return {
      status: "already_initialized",
      adapter: project.adapter,
      dialect: project.dialect,
      detected: project.detected,
      selectedPaths: project.selectedPaths,
      filesChanged: [],
      migrationCommands: [],
      migrationGeneratedPaths: [],
      migrationApplied: false,
      snippet: project.snippet,
      followUp: [
        "Add the snippet below to blyp.config.ts if the project is not already configured for database logging.",
      ],
    };
  }

  for (const plan of project.migrationPlan) {
    await runCommand({
      cwd: input.cwd,
      label: plan.label,
      command: plan.command,
    });
  }

  const afterMigrationFiles = await listRelativeFiles(project.migrationDir);
  const migrationRoot = path.relative(input.cwd, project.migrationDir);
  const generatedMigrationPaths = [...afterMigrationFiles]
    .filter((entry) => !beforeMigrationFiles.has(entry))
    .map((entry) => path.join(migrationRoot, entry));

  return {
    status: "initialized",
    adapter: project.adapter,
    dialect: project.dialect,
    detected: project.detected,
    selectedPaths: project.selectedPaths,
    filesChanged: [path.relative(input.cwd, schemaUpdate.filePath) || path.basename(schemaUpdate.filePath)],
    migrationCommands: project.migrationPlan.map((plan) =>
      formatCommand(plan.command),
    ),
    migrationGeneratedPaths: generatedMigrationPaths,
    migrationApplied: project.migrationPlan.length > 0,
    snippet: project.snippet,
    followUp: [
      "Add the snippet below to blyp.config.ts before using blyp-js database logging.",
    ],
  };
}

export function formatLogsInitializationResult(
  result: LogsInitializationResult,
): string {
  const lines = [
    `Detected: ${result.detected.join(" ")}`,
  ];

  if (result.selectedPaths.length > 0) {
    lines.push("", "Selected paths:");
    lines.push(...result.selectedPaths.map((entry) => `- ${entry}`));
  }

  lines.push("", "Files created or updated:");
  if (result.filesChanged.length === 0) {
    lines.push("- none");
  } else {
    lines.push(...result.filesChanged.map((entry) => `- ${entry}`));
  }

  lines.push("", "Migration commands:");
  if (result.migrationCommands.length === 0) {
    lines.push("- none; the schema already matched the Blyp contract");
  } else {
    lines.push(...result.migrationCommands.map((entry) => `- ${entry}`));
    lines.push(`- apply status: ${result.migrationApplied ? "succeeded" : "not run"}`);
  }

  if (result.migrationGeneratedPaths.length > 0) {
    lines.push("", "Generated migration paths:");
    lines.push(
      ...result.migrationGeneratedPaths.map((entry) => `- ${entry}`),
    );
  }

  lines.push("", "blyp.config.ts");
  lines.push(result.snippet);

  if (result.followUp.length > 0) {
    lines.push("", "Manual follow-up:");
    lines.push(...result.followUp.map((entry) => `- ${entry}`));
  }

  return lines.join("\n");
}

export async function writeBlypConfigFile(input: {
  readonly cwd: string;
  readonly snippet: string;
  readonly overwrite: boolean;
}): Promise<BylpConfigWriteResult> {
  const existingPath = await resolveExistingBlypConfigPath(input.cwd);
  const targetPath = existingPath ?? path.join(input.cwd, "blyp.config.ts");

  if (await pathExists(targetPath)) {
    const existingContents = await readFile(targetPath, "utf8");
    if (existingContents.trim() === input.snippet.trim()) {
      return {
        path: targetPath,
        status: "unchanged",
      };
    }

    if (!input.overwrite) {
      return {
        path: targetPath,
        status: "skipped",
      };
    }

    await writeFile(targetPath, `${input.snippet}\n`, "utf8");
    return {
      path: targetPath,
      status: "updated",
    };
  }

  await writeFile(targetPath, `${input.snippet}\n`, "utf8");
  return {
    path: targetPath,
    status: "created",
  };
}

export async function detectConfiguredDatabaseAdapter(
  cwd: string,
): Promise<LogsAdapter> {
  const configPath = await resolveExistingBlypConfigPath(cwd);

  if (configPath) {
    const configContents = await readFile(configPath, "utf8");
    if (configContents.includes("createPrismaDatabaseAdapter")) {
      return "prisma";
    }

    if (configContents.includes("createDrizzleDatabaseAdapter")) {
      return "drizzle";
    }
  }

  const hasPrisma = await pathExists(path.join(cwd, "prisma", "schema.prisma"));
  const hasDrizzle = (await resolveDrizzleConfigPath(cwd)) !== null;

  if (hasPrisma && !hasDrizzle) {
    return "prisma";
  }

  if (hasDrizzle && !hasPrisma) {
    return "drizzle";
  }

  throw new CliError(
    "Could not determine the database adapter. Run blyphq db:init first or add a Blyp database config.",
  );
}

export async function runDatabaseMigrate(
  cwd: string,
  options: InitializeLogsProjectOptions = {},
): Promise<readonly string[]> {
  const manifest = await readPackageManifest(cwd);
  const packageManager = await detectPackageManager(cwd);
  const runCommand = options.runCommand ?? defaultRunExternalCommand;
  const adapter = await detectConfiguredDatabaseAdapter(cwd);
  const dialect =
    adapter === "prisma"
      ? await detectExistingPrismaDialect(cwd)
      : await detectExistingDrizzleDialect(cwd);
  const project = await detectProject({
    cwd,
    adapter,
    dialect,
    manifest,
    packageManager,
  });

  for (const plan of project.migrationPlan) {
    await runCommand({
      cwd,
      label: plan.label,
      command: plan.command,
    });
  }

  return project.migrationPlan.map((plan) => formatCommand(plan.command));
}

export async function runDatabaseGenerate(
  cwd: string,
  options: InitializeLogsProjectOptions = {},
): Promise<string> {
  const manifest = await readPackageManifest(cwd);
  const packageManager = await detectPackageManager(cwd);
  const runCommand = options.runCommand ?? defaultRunExternalCommand;
  const adapter = await detectConfiguredDatabaseAdapter(cwd);

  if (adapter !== "prisma") {
    throw new CliError("db:generate is only available for Prisma projects.");
  }

  const command = buildPrismaGenerateCommand({
    manifest,
    packageManager,
  });

  await runCommand({
    cwd,
    label: command.label,
    command: command.command,
  });

  return formatCommand(command.command);
}

async function detectProject(input: {
  readonly cwd: string;
  readonly adapter: LogsAdapter;
  readonly dialect: LogsDialect;
  readonly manifest: PackageManifest | null;
  readonly packageManager: PackageManager;
}): Promise<DetectedProject> {
  if (input.adapter === "prisma") {
    return detectPrismaProject(input);
  }

  return detectDrizzleProject(input);
}

async function detectPrismaProject(input: {
  readonly cwd: string;
  readonly dialect: LogsDialect;
  readonly manifest: PackageManifest | null;
  readonly packageManager: PackageManager;
}): Promise<PrismaProject> {
  const schemaPath = path.join(input.cwd, "prisma", "schema.prisma");

  if (!(await pathExists(schemaPath))) {
    throw new CliError(
      "Prisma schema not found at prisma/schema.prisma.",
    );
  }

  if (!hasDependency(input.manifest, "prisma")) {
    throw new CliError(
      'Prisma CLI dependency "prisma" was not found in package.json. Install prisma before running this command.',
    );
  }

  if (!hasDependency(input.manifest, "@prisma/client")) {
    throw new CliError(
      'Prisma runtime dependency "@prisma/client" was not found in package.json. Install @prisma/client before running this command.',
    );
  }

  const schemaContents = await readFile(schemaPath, "utf8");
  const provider = parsePrismaProvider(schemaContents);

  if (!provider) {
    throw new CliError(
      `Could not determine the Prisma datasource provider from ${path.relative(input.cwd, schemaPath)}.`,
    );
  }

  const schemaDialect = mapPrismaProviderToDialect(provider);

  if (!schemaDialect) {
    throw new CliError(
      `Prisma datasource provider "${provider}" is not supported. Use "postgresql" or "mysql".`,
    );
  }

  if (schemaDialect !== input.dialect) {
    throw new CliError(
      `Requested dialect ${input.dialect}, but prisma/schema.prisma is configured for ${schemaDialect}.`,
    );
  }

  const migrationPlan = [
    buildPrismaMigrationCommand({
      cwd: input.cwd,
      schemaPath,
      manifest: input.manifest,
      packageManager: input.packageManager,
    }),
  ];

  return {
    adapter: "prisma",
    dialect: input.dialect,
    schemaPath,
    migrationDir: path.join(input.cwd, "prisma", "migrations"),
    detected: [
      `Prisma project at ${path.relative(input.cwd, schemaPath) || "prisma/schema.prisma"}`,
      `provider ${provider}`,
    ],
    selectedPaths: [
      `schema: ${path.relative(input.cwd, schemaPath) || "prisma/schema.prisma"}`,
    ],
    migrationPlan,
    snippet: buildPrismaSnippet(input.dialect),
  };
}

async function detectDrizzleProject(input: {
  readonly cwd: string;
  readonly dialect: LogsDialect;
  readonly manifest: PackageManifest | null;
  readonly packageManager: PackageManager;
}): Promise<DrizzleProject> {
  const configPath = await resolveDrizzleConfigPath(input.cwd);
  const hasSchemaHints = await hasAnyDrizzleSchemaHint(input.cwd);

  if (!configPath) {
    if (!hasSchemaHints) {
      throw new CliError(
        "Requested adapter drizzle, but no drizzle config or schema directory was found.",
      );
    }

    throw new CliError(
      `Drizzle config not found. Expected one of ${DRIZZLE_CONFIG_FILES.join(", ")} at the project root.`,
    );
  }

  if (!hasDependency(input.manifest, "drizzle-orm")) {
    throw new CliError(
      'Drizzle runtime dependency "drizzle-orm" was not found in package.json. Install drizzle-orm before running this command.',
    );
  }

  if (!hasDependency(input.manifest, "drizzle-kit")) {
    throw new CliError(
      'Drizzle CLI dependency "drizzle-kit" was not found in package.json. Install drizzle-kit before running this command.',
    );
  }

  const configContents = await readFile(configPath, "utf8");
  const configuredDialect = mapDrizzleDialectToDialect(
    parseConfigStringValue(configContents, "dialect"),
  );

  if (configuredDialect && configuredDialect !== input.dialect) {
    throw new CliError(
      `Requested dialect ${input.dialect}, but ${path.relative(input.cwd, configPath)} is configured for ${configuredDialect}.`,
    );
  }

  const schemaTarget = await resolveDrizzleSchemaTarget(
    input.cwd,
    configPath,
    configContents,
  );
  const dbModulePath = await resolveDrizzleDbModulePath(
    input.cwd,
    schemaTarget.path,
  );
  const migrationDir = resolveDrizzleMigrationDir(input.cwd, configPath, configContents);
  const migrationPlan = [
    buildDrizzleGenerateCommand({
      cwd: input.cwd,
      configPath,
      manifest: input.manifest,
      packageManager: input.packageManager,
    }),
    buildDrizzleApplyCommand({
      cwd: input.cwd,
      configPath,
      manifest: input.manifest,
      packageManager: input.packageManager,
    }),
  ];
  const schemaFilePath =
    schemaTarget.kind === "directory"
      ? path.join(schemaTarget.path, "blyp.ts")
      : schemaTarget.path;
  const selectedPaths = [
    `config: ${path.relative(input.cwd, configPath) || path.basename(configPath)}`,
    `schema: ${path.relative(input.cwd, schemaFilePath) || path.basename(schemaFilePath)}`,
    `db module: ${path.relative(input.cwd, dbModulePath) || path.basename(dbModulePath)}`,
  ];

  if (schemaTarget.selectionNote) {
    selectedPaths.unshift(schemaTarget.selectionNote);
  }

  return {
    adapter: "drizzle",
    dialect: input.dialect,
    configPath,
    schemaTarget,
    schemaFilePath,
    dbModulePath,
    migrationDir,
    detected: [
      `Drizzle project at ${path.relative(input.cwd, configPath) || path.basename(configPath)}`,
      configuredDialect ? `dialect ${configuredDialect}` : `dialect ${input.dialect}`,
    ],
    selectedPaths,
    migrationPlan,
    snippet: buildDrizzleSnippet({
      cwd: input.cwd,
      dialect: input.dialect,
      dbModulePath,
      schemaFilePath,
    }),
  };
}

async function ensurePrismaSchema(project: PrismaProject): Promise<SchemaUpdateResult> {
  const contents = await readFile(project.schemaPath, "utf8");
  const existingModel = findPrismaModelBlock(contents, "BlypLog");

  if (existingModel) {
    validateExistingPrismaModel(existingModel, project);
    return {
      changed: false,
      filePath: project.schemaPath,
    };
  }

  const newline = detectNewline(contents);
  const updatedContents =
    contents.replace(/\s*$/, "") +
    `${newline}${newline}${buildPrismaModel(project.dialect, newline)}${newline}`;

  await writeFile(project.schemaPath, updatedContents, "utf8");

  return {
    changed: true,
    filePath: project.schemaPath,
  };
}

async function ensureDrizzleSchema(project: DrizzleProject): Promise<SchemaUpdateResult> {
  if (project.schemaTarget.kind === "directory") {
    const schemaFilePath = project.schemaFilePath;

    if (await pathExists(schemaFilePath)) {
      const contents = await readFile(schemaFilePath, "utf8");
      validateExistingDrizzleSchema(contents, project);
      return {
        changed: false,
        filePath: schemaFilePath,
      };
    }

    await mkdir(path.dirname(schemaFilePath), { recursive: true });
    await writeFile(
      schemaFilePath,
      buildStandaloneDrizzleSchema(project.dialect, "\n"),
      "utf8",
    );

    return {
      changed: true,
      filePath: schemaFilePath,
    };
  }

  const schemaFilePath = project.schemaFilePath;
  const existingContents = (await pathExists(schemaFilePath))
    ? await readFile(schemaFilePath, "utf8")
    : "";

  if (existingContents.includes("export const blypLogs")) {
    validateExistingDrizzleSchema(existingContents, project);
    return {
      changed: false,
      filePath: schemaFilePath,
    };
  }

  const newline = detectNewline(existingContents);
  const withImports = upsertDrizzleImport(existingContents, project.dialect);
  const appendedTable = appendBlock(
    withImports,
    buildEmbeddedDrizzleSchema(project.dialect, newline),
    newline,
  );

  await mkdir(path.dirname(schemaFilePath), { recursive: true });
  await writeFile(schemaFilePath, appendedTable, "utf8");

  return {
    changed: true,
    filePath: schemaFilePath,
  };
}

function buildPrismaModel(dialect: LogsDialect, newline: string): string {
  const lines =
    dialect === "postgres"
      ? [
          "model BlypLog {",
          "  id        String   @id @db.Uuid",
          "  timestamp DateTime @db.Timestamptz(6)",
          "  level     String   @db.VarChar(32)",
          "  message   String   @db.Text",
          "  caller    String?  @db.Text",
          "  type      String?  @db.VarChar(64)",
          '  groupId   String?  @map("group_id") @db.VarChar(191)',
          "  method    String?  @db.VarChar(16)",
          "  path      String?  @db.Text",
          "  status    Int?",
          "  duration  Float?   @db.DoublePrecision",
          '  hasError  Boolean  @map("has_error")',
          "  data      Json?    @db.JsonB",
          "  bindings  Json?    @db.JsonB",
          "  error     Json?    @db.JsonB",
          "  events    Json?    @db.JsonB",
          "  record    Json     @db.JsonB",
          '  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)',
          "",
          '  @@index([timestamp], map: "blyp_logs_timestamp_idx")',
          '  @@index([level, timestamp], map: "blyp_logs_level_timestamp_idx")',
          '  @@index([type, timestamp], map: "blyp_logs_type_timestamp_idx")',
          '  @@index([groupId, timestamp], map: "blyp_logs_group_id_timestamp_idx")',
          '  @@map("blyp_logs")',
          "}",
        ]
      : [
          "model BlypLog {",
          "  id        String   @id @db.Char(36)",
          "  timestamp DateTime @db.DateTime(6)",
          "  level     String   @db.VarChar(32)",
          "  message   String   @db.Text",
          "  caller    String?  @db.Text",
          "  type      String?  @db.VarChar(64)",
          '  groupId   String?  @map("group_id") @db.VarChar(191)',
          "  method    String?  @db.VarChar(16)",
          "  path      String?  @db.Text",
          "  status    Int?",
          "  duration  Float?   @db.Double",
          '  hasError  Boolean  @map("has_error")',
          "  data      Json?",
          "  bindings  Json?",
          "  error     Json?",
          "  events    Json?",
          "  record    Json",
          '  createdAt DateTime @default(now()) @map("created_at") @db.DateTime(6)',
          "",
          '  @@index([timestamp], map: "blyp_logs_timestamp_idx")',
          '  @@index([level, timestamp], map: "blyp_logs_level_timestamp_idx")',
          '  @@index([type, timestamp], map: "blyp_logs_type_timestamp_idx")',
          '  @@index([groupId, timestamp], map: "blyp_logs_group_id_timestamp_idx")',
          '  @@map("blyp_logs")',
          "}",
        ];

  return lines.join(newline);
}

function validateExistingPrismaModel(block: string, project: PrismaProject): void {
  const requiredTokens = [
    '@@map("blyp_logs")',
    '@@index([timestamp], map: "blyp_logs_timestamp_idx")',
    '@@index([level, timestamp], map: "blyp_logs_level_timestamp_idx")',
    '@@index([type, timestamp], map: "blyp_logs_type_timestamp_idx")',
    '@@index([groupId, timestamp], map: "blyp_logs_group_id_timestamp_idx")',
    '@map("group_id")',
    '@map("has_error")',
    '@map("created_at")',
  ];

  const dialectTokens =
    project.dialect === "postgres"
      ? ["@db.Timestamptz(6)", "@db.JsonB", "@db.Uuid"]
      : ["@db.DateTime(6)", "@db.Char(36)"];

  const missingTokens = [...requiredTokens, ...dialectTokens].filter(
    (token) => !block.includes(token),
  );

  if (missingTokens.length > 0) {
    throw new CliError(
      `Found existing BlypLog model in ${project.schemaPath} but it does not match the Blyp schema contract. Reconcile it manually or remove it before rerunning.`,
    );
  }
}

function buildStandaloneDrizzleSchema(
  dialect: LogsDialect,
  newline: string,
): string {
  return [buildDrizzleImportBlock(dialect, newline), buildEmbeddedDrizzleSchema(dialect, newline)].join(
    `${newline}${newline}`,
  );
}

function buildEmbeddedDrizzleSchema(
  dialect: LogsDialect,
  newline: string,
): string {
  const lines =
    dialect === "postgres"
      ? [
          "export const blypLogs = pgTable(",
          '  "blyp_logs",',
          "  {",
          '    id: uuid("id").primaryKey(),',
          '    timestamp: timestamp("timestamp", { withTimezone: true, precision: 6 }).notNull(),',
          '    level: varchar("level", { length: 32 }).notNull(),',
          '    message: text("message").notNull(),',
          '    caller: text("caller"),',
          '    type: varchar("type", { length: 64 }),',
          '    groupId: varchar("group_id", { length: 191 }),',
          '    method: varchar("method", { length: 16 }),',
          '    path: text("path"),',
          '    status: integer("status"),',
          '    duration: doublePrecision("duration"),',
          '    hasError: boolean("has_error").notNull(),',
          '    data: jsonb("data"),',
          '    bindings: jsonb("bindings"),',
          '    error: jsonb("error"),',
          '    events: jsonb("events"),',
          '    record: jsonb("record").notNull(),',
          '    createdAt: timestamp("created_at", { withTimezone: true, precision: 6 })',
          "      .defaultNow()",
          "      .notNull(),",
          "  },",
          "  (table) => [",
          '    index("blyp_logs_timestamp_idx").on(table.timestamp),',
          '    index("blyp_logs_level_timestamp_idx").on(table.level, table.timestamp),',
          '    index("blyp_logs_type_timestamp_idx").on(table.type, table.timestamp),',
          '    index("blyp_logs_group_id_timestamp_idx").on(table.groupId, table.timestamp),',
          "  ],",
          ");",
        ]
      : [
          "export const blypLogs = mysqlTable(",
          '  "blyp_logs",',
          "  {",
          '    id: varchar("id", { length: 36 }).primaryKey(),',
          '    timestamp: datetime("timestamp", { fsp: 6, mode: "date" }).notNull(),',
          '    level: varchar("level", { length: 32 }).notNull(),',
          '    message: text("message").notNull(),',
          '    caller: text("caller"),',
          '    type: varchar("type", { length: 64 }),',
          '    groupId: varchar("group_id", { length: 191 }),',
          '    method: varchar("method", { length: 16 }),',
          '    path: text("path"),',
          '    status: int("status"),',
          '    duration: double("duration"),',
          '    hasError: boolean("has_error").notNull(),',
          '    data: json("data"),',
          '    bindings: json("bindings"),',
          '    error: json("error"),',
          '    events: json("events"),',
          '    record: json("record").notNull(),',
          '    createdAt: datetime("created_at", { fsp: 6, mode: "date" }).defaultNow().notNull(),',
          "  },",
          "  (table) => [",
          '    index("blyp_logs_timestamp_idx").on(table.timestamp),',
          '    index("blyp_logs_level_timestamp_idx").on(table.level, table.timestamp),',
          '    index("blyp_logs_type_timestamp_idx").on(table.type, table.timestamp),',
          '    index("blyp_logs_group_id_timestamp_idx").on(table.groupId, table.timestamp),',
          "  ],",
          ");",
        ];

  return lines.join(newline);
}

function buildDrizzleImportBlock(dialect: LogsDialect, newline: string): string {
  const specifiers =
    dialect === "postgres"
      ? [
          "boolean",
          "doublePrecision",
          "index",
          "integer",
          "jsonb",
          "pgTable",
          "text",
          "timestamp",
          "uuid",
          "varchar",
        ]
      : [
          "boolean",
          "datetime",
          "double",
          "index",
          "int",
          "json",
          "mysqlTable",
          "text",
          "varchar",
        ];
  const lines = [`import {`, ...specifiers.map((item) => `  ${item},`), `} from "${getDrizzleModule(dialect)}";`];

  return lines.join(newline);
}

function validateExistingDrizzleSchema(
  contents: string,
  project: DrizzleProject,
): void {
  const requiredTokens = [
    "export const blypLogs",
    '"blyp_logs"',
    "blyp_logs_timestamp_idx",
    "blyp_logs_level_timestamp_idx",
    "blyp_logs_type_timestamp_idx",
    "blyp_logs_group_id_timestamp_idx",
    'groupId: ',
    'hasError: ',
    'createdAt: ',
  ];
  const dialectTokens =
    project.dialect === "postgres"
      ? ["pgTable(", 'jsonb("record").notNull()', 'timestamp("timestamp", { withTimezone: true, precision: 6 })']
      : ["mysqlTable(", 'json("record").notNull()', 'datetime("timestamp", { fsp: 6, mode: "date" })'];

  const missingTokens = [...requiredTokens, ...dialectTokens].filter(
    (token) => !contents.includes(token),
  );

  if (missingTokens.length > 0) {
    throw new CliError(
      `Found existing blypLogs schema in ${project.schemaFilePath} but it does not match the Blyp schema contract. Reconcile it manually or remove it before rerunning.`,
    );
  }
}

function buildPrismaSnippet(dialect: LogsDialect): string {
  return [
    "import { PrismaClient } from '@prisma/client';",
    "import { createPrismaDatabaseAdapter } from 'blyp-js/database';",
    "",
    "const prisma = new PrismaClient();",
    "",
    "export default {",
    "  destination: 'database',",
    "  database: {",
    `    dialect: '${dialect}',`,
    "    adapter: createPrismaDatabaseAdapter({",
    "      client: prisma,",
    "      model: 'blypLog',",
    "    }),",
    "  },",
    "};",
  ].join("\n");
}

function buildDrizzleSnippet(input: {
  readonly cwd: string;
  readonly dialect: LogsDialect;
  readonly dbModulePath: string;
  readonly schemaFilePath: string;
}): string {
  const dbImportPath = toImportPath(input.cwd, input.dbModulePath);
  const schemaImportPath = toImportPath(input.cwd, input.schemaFilePath);

  return [
    `import { db } from '${dbImportPath}';`,
    `import { blypLogs } from '${schemaImportPath}';`,
    "import { createDrizzleDatabaseAdapter } from 'blyp-js/database';",
    "",
    "export default {",
    "  destination: 'database',",
    "  database: {",
    `    dialect: '${input.dialect}',`,
    "    adapter: createDrizzleDatabaseAdapter({",
    "      db,",
    "      table: blypLogs,",
    "    }),",
    "  },",
    "};",
  ].join("\n");
}

function upsertDrizzleImport(contents: string, dialect: LogsDialect): string {
  const moduleName = getDrizzleModule(dialect);
  const importPattern = new RegExp(
    `import\\s*\\{([\\s\\S]*?)\\}\\s*from\\s*["']${escapeRegExp(moduleName)}["'];?`,
    "m",
  );
  const specifiers =
    dialect === "postgres"
      ? [
          "boolean",
          "doublePrecision",
          "index",
          "integer",
          "jsonb",
          "pgTable",
          "text",
          "timestamp",
          "uuid",
          "varchar",
        ]
      : [
          "boolean",
          "datetime",
          "double",
          "index",
          "int",
          "json",
          "mysqlTable",
          "text",
          "varchar",
        ];

  if (importPattern.test(contents)) {
    return contents.replace(importPattern, (_match, captured) => {
      const existing = captured
        .split(",")
        .map((entry: string) => entry.trim())
        .filter(Boolean);
      const merged = [...new Set([...existing, ...specifiers])].sort((left, right) =>
        left.localeCompare(right),
      );

      return buildNamedImport(moduleName, merged, detectNewline(contents));
    });
  }

  const importBlock = buildNamedImport(moduleName, specifiers, detectNewline(contents));
  return contents.trim().length === 0
    ? `${importBlock}${detectNewline(contents)}`
    : `${importBlock}${detectNewline(contents)}${detectNewline(contents)}${contents}`;
}

function buildNamedImport(
  moduleName: string,
  specifiers: readonly string[],
  newline: string,
): string {
  return [
    "import {",
    ...specifiers.map((specifier) => `  ${specifier},`),
    `} from "${moduleName}";`,
  ].join(newline);
}

function appendBlock(contents: string, block: string, newline: string): string {
  const trimmed = contents.replace(/\s*$/, "");
  if (trimmed.length === 0) {
    return `${block}${newline}`;
  }

  return `${trimmed}${newline}${newline}${block}${newline}`;
}

function parsePrismaProvider(contents: string): string | null {
  const datasourceMatch = contents.match(
    /datasource\s+\w+\s*\{[\s\S]*?provider\s*=\s*"([^"]+)"[\s\S]*?\}/,
  );

  return datasourceMatch?.[1] ?? null;
}

function mapPrismaProviderToDialect(provider: string): LogsDialect | null {
  if (provider === "postgresql") {
    return "postgres";
  }

  if (provider === "mysql") {
    return "mysql";
  }

  return null;
}

async function detectExistingPrismaDialect(cwd: string): Promise<LogsDialect> {
  const schemaPath = path.join(cwd, "prisma", "schema.prisma");

  if (!(await pathExists(schemaPath))) {
    throw new CliError("Prisma schema not found at prisma/schema.prisma.");
  }

  const contents = await readFile(schemaPath, "utf8");
  const provider = parsePrismaProvider(contents);
  const dialect = provider ? mapPrismaProviderToDialect(provider) : null;

  if (!dialect) {
    throw new CliError(
      "Could not determine the Prisma datasource dialect. Expected postgresql or mysql.",
    );
  }

  return dialect;
}

async function resolveDrizzleConfigPath(cwd: string): Promise<string | null> {
  for (const candidate of DRIZZLE_CONFIG_FILES) {
    const resolved = path.join(cwd, candidate);
    if (await pathExists(resolved)) {
      return resolved;
    }
  }

  return null;
}

async function resolveExistingBlypConfigPath(cwd: string): Promise<string | null> {
  for (const candidate of BLYP_CONFIG_FILE_NAMES) {
    const resolved = path.join(cwd, candidate);
    if (await pathExists(resolved)) {
      return resolved;
    }
  }

  return null;
}

async function detectExistingDrizzleDialect(cwd: string): Promise<LogsDialect> {
  const configPath = await resolveDrizzleConfigPath(cwd);

  if (!configPath) {
    throw new CliError(
      `Drizzle config not found. Expected one of ${DRIZZLE_CONFIG_FILES.join(", ")} at the project root.`,
    );
  }

  const contents = await readFile(configPath, "utf8");
  const dialect = mapDrizzleDialectToDialect(
    parseConfigStringValue(contents, "dialect"),
  );

  if (!dialect) {
    throw new CliError(
      `Could not determine the Drizzle dialect from ${path.relative(cwd, configPath)}.`,
    );
  }

  return dialect;
}

async function hasAnyDrizzleSchemaHint(cwd: string): Promise<boolean> {
  for (const candidate of DRIZZLE_SCHEMA_CANDIDATES) {
    if (await isDirectory(path.join(cwd, candidate))) {
      return true;
    }
  }

  for (const candidate of DRIZZLE_SCHEMA_FILE_CANDIDATES) {
    if (await pathExists(path.join(cwd, candidate))) {
      return true;
    }
  }

  return false;
}

async function resolveDrizzleSchemaTarget(
  cwd: string,
  configPath: string,
  configContents: string,
): Promise<DrizzleSchemaTarget> {
  const configuredSchema = parseConfigStringValue(configContents, "schema");

  if (configuredSchema) {
    const resolvedConfiguredPath = resolveConfigPath(configPath, configuredSchema);
    if (isLikelyFileSchema(configuredSchema)) {
      return {
        kind: "file",
        path: resolvedConfiguredPath,
        selectionNote: null,
      };
    }

    return {
      kind: "directory",
      path: resolveSchemaDirectoryFromPattern(resolvedConfiguredPath),
      selectionNote: null,
    };
  }

  const directoryCandidates = await Promise.all(
    DRIZZLE_SCHEMA_CANDIDATES.map(async (candidate) => ({
      candidate,
      exists: await isDirectory(path.join(cwd, candidate)),
    })),
  );
  const fileCandidates = await Promise.all(
    DRIZZLE_SCHEMA_FILE_CANDIDATES.map(async (candidate) => ({
      candidate,
      exists: await pathExists(path.join(cwd, candidate)),
    })),
  );
  const existingDirectories = directoryCandidates.filter((entry) => entry.exists);
  const existingFiles = fileCandidates.filter((entry) => entry.exists);

  if (existingFiles.length > 0) {
    const selected = existingFiles[0]!;
    return {
      kind: "file",
      path: path.join(cwd, selected.candidate),
      selectionNote:
        existingFiles.length > 1
          ? `Found multiple possible Drizzle schema files; selected ${selected.candidate}.`
          : null,
    };
  }

  if (existingDirectories.length > 0) {
    const selected = existingDirectories[0]!;
    return {
      kind: "directory",
      path: path.join(cwd, selected.candidate),
      selectionNote:
        existingDirectories.length > 1
          ? `Found multiple possible Drizzle schema directories; selected ${selected.candidate}.`
          : null,
    };
  }

  throw new CliError(
    `Could not determine the Drizzle schema path from ${path.relative(cwd, configPath)}. Add a string schema path to the config.`,
  );
}

async function resolveDrizzleDbModulePath(
  cwd: string,
  schemaTargetPath: string,
): Promise<string> {
  const conventionalCandidates = buildDbModuleCandidates(schemaTargetPath);
  const existingConventional = [];

  for (const candidate of conventionalCandidates) {
    if (!(await pathExists(candidate))) {
      continue;
    }

    if (await fileExportsDb(candidate)) {
      existingConventional.push(candidate);
    }
  }

  if (existingConventional.length > 0) {
    return existingConventional[0]!;
  }

  const fallbackCandidates = [
    path.join(cwd, "src", "db.ts"),
    path.join(cwd, "db.ts"),
    path.join(cwd, "src", "db", "index.ts"),
    path.join(cwd, "db", "index.ts"),
    path.join(cwd, "src", "lib", "db.ts"),
    path.join(cwd, "lib", "db.ts"),
  ];

  for (const candidate of fallbackCandidates) {
    if (!(await pathExists(candidate))) {
      continue;
    }

    if (await fileExportsDb(candidate)) {
      return candidate;
    }
  }

  throw new CliError(
    "Drizzle database module not found. Create and export a named db instance before running this command.",
  );
}

function buildDbModuleCandidates(schemaTargetPath: string): string[] {
  const normalized = schemaTargetPath.split(path.sep);
  const schemaIndex = normalized.lastIndexOf("schema");
  const baseDirectory =
    schemaIndex >= 0
      ? normalized.slice(0, schemaIndex).join(path.sep)
      : path.dirname(schemaTargetPath);
  const candidates = [];

  if (baseDirectory.length > 0) {
    candidates.push(`${baseDirectory}.ts`);
    candidates.push(path.join(baseDirectory, "index.ts"));
    candidates.push(path.join(baseDirectory, "client.ts"));
  }

  return candidates;
}

async function fileExportsDb(filePath: string): Promise<boolean> {
  const contents = await readFile(filePath, "utf8");

  return (
    /\bexport\s+(const|let|var)\s+db\b/.test(contents) ||
    /\bexport\s*\{[^}]*\bdb\b[^}]*\}/.test(contents)
  );
}

function resolveDrizzleMigrationDir(
  cwd: string,
  configPath: string,
  configContents: string,
): string {
  const configuredOut = parseConfigStringValue(configContents, "out");
  if (!configuredOut) {
    return path.join(cwd, "drizzle");
  }

  return resolveConfigPath(configPath, configuredOut);
}

function parseConfigStringValue(
  contents: string,
  key: string,
): string | null {
  const pattern = new RegExp(`\\b${escapeRegExp(key)}\\s*:\\s*["'\`]([^"'\\\`]+)["'\`]`);
  return contents.match(pattern)?.[1] ?? null;
}

function mapDrizzleDialectToDialect(value: string | null): LogsDialect | null {
  if (value === "postgres" || value === "postgresql") {
    return "postgres";
  }

  if (value === "mysql") {
    return "mysql";
  }

  return null;
}

function resolveConfigPath(configPath: string, configuredPath: string): string {
  return path.resolve(path.dirname(configPath), configuredPath);
}

function isLikelyFileSchema(schemaPath: string): boolean {
  return (
    (schemaPath.endsWith(".ts") ||
      schemaPath.endsWith(".js") ||
      schemaPath.endsWith(".mts") ||
      schemaPath.endsWith(".cts")) &&
    !schemaPath.includes("*")
  );
}

function resolveSchemaDirectoryFromPattern(schemaPattern: string): string {
  const wildcardIndex = schemaPattern.search(/[*{]/);
  if (wildcardIndex === -1) {
    return schemaPattern;
  }

  return schemaPattern.slice(0, wildcardIndex).replace(/[\\/]+$/, "");
}

function getDrizzleModule(dialect: LogsDialect): string {
  return dialect === "postgres"
    ? "drizzle-orm/pg-core"
    : "drizzle-orm/mysql-core";
}

function findPrismaModelBlock(
  contents: string,
  modelName: string,
): string | null {
  const match = contents.match(
    new RegExp(`model\\s+${escapeRegExp(modelName)}\\s*\\{[\\s\\S]*?\\n\\}`),
  );

  return match?.[0] ?? null;
}

function detectNewline(contents: string): string {
  return contents.includes("\r\n") ? "\r\n" : "\n";
}

async function readPackageManifest(cwd: string): Promise<PackageManifest | null> {
  const manifestPath = path.join(cwd, "package.json");

  if (!(await pathExists(manifestPath))) {
    return null;
  }

  try {
    const contents = await readFile(manifestPath, "utf8");
    return JSON.parse(contents) as PackageManifest;
  } catch {
    throw new CliError(`Could not read package.json at ${manifestPath}.`);
  }
}

function hasDependency(
  manifest: PackageManifest | null,
  dependencyName: string,
): boolean {
  return Boolean(
    manifest?.dependencies?.[dependencyName] ||
      manifest?.devDependencies?.[dependencyName],
  );
}

type PackageManager = "bun" | "pnpm" | "yarn" | "npm";

async function detectPackageManager(cwd: string): Promise<PackageManager> {
  const lockfiles: ReadonlyArray<readonly [string, PackageManager]> = [
    ["bun.lock", "bun"],
    ["bun.lockb", "bun"],
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["package-lock.json", "npm"],
  ];

  for (const [lockfile, packageManager] of lockfiles) {
    if (await pathExists(path.join(cwd, lockfile))) {
      return packageManager;
    }
  }

  return "npm";
}

function buildPrismaMigrationCommand(input: {
  readonly cwd: string;
  readonly schemaPath: string;
  readonly manifest: PackageManifest | null;
  readonly packageManager: PackageManager;
}): CommandPlan {
  const script = findScript(
    input.manifest?.scripts,
    "prisma migrate dev",
    [
      "prisma:migrate",
      "prisma:migrate:dev",
      "db:migrate",
      "db:migrate:dev",
      "migrate:dev",
      "migrate",
    ],
  );

  if (script) {
    const extraArgs = script.command.includes("--name")
      ? []
      : ["--name", MIGRATION_NAME];

    return {
      label: `Run ${script.name}`,
      command: buildRunScriptCommand(input.packageManager, script.name, extraArgs),
    };
  }

  return {
    label: "Run prisma migrate dev",
    command: [
      ...getExecPrefix(input.packageManager),
      "prisma",
      "migrate",
      "dev",
      "--name",
      MIGRATION_NAME,
      "--schema",
      path.relative(input.cwd, input.schemaPath) || input.schemaPath,
    ],
  };
}

function buildDrizzleGenerateCommand(input: {
  readonly cwd: string;
  readonly configPath: string;
  readonly manifest: PackageManifest | null;
  readonly packageManager: PackageManager;
}): CommandPlan {
  const script = findScript(
    input.manifest?.scripts,
    "drizzle-kit generate",
    ["db:generate", "drizzle:generate", "db:migrate:generate"],
  );

  if (script) {
    return {
      label: `Run ${script.name}`,
      command: buildRunScriptCommand(input.packageManager, script.name),
    };
  }

  return {
    label: "Run drizzle-kit generate",
    command: [
      ...getExecPrefix(input.packageManager),
      "drizzle-kit",
      "generate",
      "--config",
      path.relative(input.cwd, input.configPath) || input.configPath,
    ],
  };
}

function buildDrizzleApplyCommand(input: {
  readonly cwd: string;
  readonly configPath: string;
  readonly manifest: PackageManifest | null;
  readonly packageManager: PackageManager;
}): CommandPlan {
  const script = findScript(
    input.manifest?.scripts,
    "drizzle-kit migrate",
    ["db:migrate", "drizzle:migrate", "db:push"],
  );

  if (script) {
    return {
      label: `Run ${script.name}`,
      command: buildRunScriptCommand(input.packageManager, script.name),
    };
  }

  return {
    label: "Run drizzle-kit migrate",
    command: [
      ...getExecPrefix(input.packageManager),
      "drizzle-kit",
      "migrate",
      "--config",
      path.relative(input.cwd, input.configPath) || input.configPath,
    ],
  };
}

function buildPrismaGenerateCommand(input: {
  readonly manifest: PackageManifest | null;
  readonly packageManager: PackageManager;
}): CommandPlan {
  const script = findScript(
    input.manifest?.scripts,
    "prisma generate",
    ["prisma:generate", "db:generate", "generate"],
  );

  if (script) {
    return {
      label: `Run ${script.name}`,
      command: buildRunScriptCommand(input.packageManager, script.name),
    };
  }

  return {
    label: "Run prisma generate",
    command: [...getExecPrefix(input.packageManager), "prisma", "generate"],
  };
}

function findScript(
  scripts: Record<string, string> | undefined,
  matcher: string,
  preferredNames: readonly string[],
): { name: string; command: string } | null {
  if (!scripts) {
    return null;
  }

  for (const preferredName of preferredNames) {
    if (scripts[preferredName]?.includes(matcher)) {
      return {
        name: preferredName,
        command: scripts[preferredName]!,
      };
    }
  }

  for (const [name, command] of Object.entries(scripts)) {
    if (command.includes(matcher)) {
      return {
        name,
        command,
      };
    }
  }

  return null;
}

function buildRunScriptCommand(
  packageManager: PackageManager,
  scriptName: string,
  extraArgs: readonly string[] = [],
): readonly string[] {
  if (packageManager === "yarn") {
    return extraArgs.length > 0
      ? ["yarn", scriptName, ...extraArgs]
      : ["yarn", scriptName];
  }

  if (packageManager === "bun") {
    return extraArgs.length > 0
      ? ["bun", "run", scriptName, "--", ...extraArgs]
      : ["bun", "run", scriptName];
  }

  if (packageManager === "pnpm") {
    return extraArgs.length > 0
      ? ["pnpm", "run", scriptName, "--", ...extraArgs]
      : ["pnpm", "run", scriptName];
  }

  return extraArgs.length > 0
    ? ["npm", "run", scriptName, "--", ...extraArgs]
    : ["npm", "run", scriptName];
}

function getExecPrefix(packageManager: PackageManager): readonly string[] {
  if (packageManager === "bun") {
    return ["bunx"];
  }

  if (packageManager === "pnpm") {
    return ["pnpm", "exec"];
  }

  if (packageManager === "yarn") {
    return ["yarn", "exec"];
  }

  return ["npx"];
}

async function defaultRunExternalCommand(
  input: RunExternalCommandInput,
): Promise<void> {
  const child = spawn(input.command[0]!, input.command.slice(1), {
    cwd: input.cwd,
    env: process.env,
    stdio: "inherit",
  });

  const errorPromise = new Promise<never>((_, reject) => {
    child.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        reject(
          new CliError(
            `Failed to run ${formatCommand(input.command)} because ${input.command[0]} is not available on PATH.`,
          ),
        );
        return;
      }

      reject(error);
    });
  });

  const exitPromise = once(child, "exit").then(([exitCode, signalCode]) => {
    if (typeof exitCode === "number" && exitCode !== 0) {
      throw new CliError(
        `${input.label} failed with exit code ${exitCode}. Command: ${formatCommand(input.command)}`,
      );
    }

    if (typeof signalCode === "string" && signalCode.length > 0) {
      throw new CliError(
        `${input.label} failed from signal ${signalCode}. Command: ${formatCommand(input.command)}`,
      );
    }
  });

  await Promise.race([errorPromise, exitPromise]);
}

async function listRelativeFiles(targetPath: string): Promise<Set<string>> {
  if (!(await pathExists(targetPath))) {
    return new Set();
  }

  const basePath = targetPath;
  const files = new Set<string>();
  const entries = await readdir(targetPath, { withFileTypes: true });

  for (const entry of entries) {
    const resolved = path.join(targetPath, entry.name);

    if (entry.isDirectory()) {
      const nested = await listRelativeFiles(resolved);
      for (const item of nested) {
        files.add(path.join(path.relative(basePath, resolved), item));
      }
      continue;
    }

    files.add(path.relative(basePath, resolved));
  }

  return files;
}

function toImportPath(cwd: string, filePath: string): string {
  const relative = path.relative(cwd, filePath);
  const withoutExtension = relative.replace(/\.[^.]+$/, "");
  const normalized = withoutExtension.split(path.sep).join("/");

  if (normalized.endsWith("/index")) {
    const directory = normalized.slice(0, -"/index".length);
    return directory.startsWith(".") ? directory : `./${directory}`;
  }

  return normalized.startsWith(".") ? normalized : `./${normalized}`;
}

function formatCommand(command: readonly string[]): string {
  return command
    .map((part) =>
      /\s/.test(part) ? JSON.stringify(part) : part,
    )
    .join(" ");
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(targetPath: string): Promise<boolean> {
  try {
    const info = await stat(targetPath);
    return info.isDirectory();
  } catch {
    return false;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
