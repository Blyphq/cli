import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { CliError } from "./errors.js";
import {
  detectConfiguredDatabaseAdapter,
  initializeLogsProject,
  parseLogsInitArgs,
  runDatabaseGenerate,
  runDatabaseMigrate,
  writeBlypConfigFile,
} from "./logs.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("logs init argument parsing", () => {
  it("parses adapter and dialect flags", () => {
    expect(
      parseLogsInitArgs(["--adapter", "prisma", "--dialect", "postgres"]),
    ).toEqual({
      adapter: "prisma",
      dialect: "postgres",
    });
    expect(
      parseLogsInitArgs(["--dialect", "mysql", "--adapter", "drizzle"]),
    ).toEqual({
      adapter: "drizzle",
      dialect: "mysql",
    });
  });

  it("fails on unknown or missing flags", () => {
    expect(() => parseLogsInitArgs(["--adapter", "prisma"])).toThrowError(
      new CliError(
        "Both --adapter and --dialect are required.\nUsage: blyp logs init --adapter <prisma|drizzle> --dialect <postgres|mysql>",
      ),
    );
    expect(() =>
      parseLogsInitArgs(["--adapter", "prisma", "--unknown"]),
    ).toThrowError(
      new CliError(
        "Unknown flag: --unknown\nUsage: blyp logs init --adapter <prisma|drizzle> --dialect <postgres|mysql>",
      ),
    );
  });
});

describe("prisma database logging bootstrap", () => {
  it("detects a prisma project, appends the BlypLog model, and runs migrate", async () => {
    const cwd = await createTempDir();
    await createPackageManifest(cwd, {
      dependencies: {
        "@prisma/client": "^6.0.0",
      },
      devDependencies: {
        prisma: "^6.0.0",
      },
    });
    await mkdir(path.join(cwd, "prisma"), { recursive: true });
    await writeFile(
      path.join(cwd, "prisma", "schema.prisma"),
      [
        'generator client {',
        '  provider = "prisma-client-js"',
        '}',
        '',
        'datasource db {',
        '  provider = "postgresql"',
        '  url      = env("DATABASE_URL")',
        '}',
      ].join("\n"),
      "utf8",
    );

    const commands: string[] = [];
    const result = await initializeLogsProject(
      {
        cwd,
        adapter: "prisma",
        dialect: "postgres",
      },
      {
        runCommand: async (input) => {
          commands.push(input.command.join(" "));
          const migrationFile = path.join(
            cwd,
            "prisma",
            "migrations",
            "20260316000000_blyp_logs_init",
            "migration.sql",
          );
          await mkdir(path.dirname(migrationFile), { recursive: true });
          await writeFile(migrationFile, "-- prisma migration", "utf8");
        },
      },
    );

    const schemaContents = await readFile(
      path.join(cwd, "prisma", "schema.prisma"),
      "utf8",
    );

    expect(commands).toHaveLength(1);
    expect(commands[0]).toContain("prisma migrate dev");
    expect(schemaContents.match(/model BlypLog/g)).toHaveLength(1);
    expect(schemaContents).toContain('@@map("blyp_logs")');
    expect(schemaContents).toContain("@db.Timestamptz(6)");
    expect(schemaContents).toContain('@map("group_id")');
    expect(result.status).toBe("initialized");
    expect(result.migrationGeneratedPaths).toEqual([
      path.join(
        "prisma",
        "migrations",
        "20260316000000_blyp_logs_init",
        "migration.sql",
      ),
    ]);
    expect(result.snippet).toBe(
      [
        "import { PrismaClient } from '@prisma/client';",
        "import { createPrismaDatabaseAdapter } from 'blyp-js/database';",
        "",
        "const prisma = new PrismaClient();",
        "",
        "export default {",
        "  destination: 'database',",
        "  database: {",
        "    dialect: 'postgres',",
        "    adapter: createPrismaDatabaseAdapter({",
        "      client: prisma,",
        "      model: 'blypLog',",
        "    }),",
        "  },",
        "};",
      ].join("\n"),
    );
  });

  it("is idempotent on rerun when the schema already exists", async () => {
    const cwd = await createTempDir();
    await createPackageManifest(cwd, {
      dependencies: {
        "@prisma/client": "^6.0.0",
      },
      devDependencies: {
        prisma: "^6.0.0",
      },
    });
    await mkdir(path.join(cwd, "prisma"), { recursive: true });
    await writeFile(
      path.join(cwd, "prisma", "schema.prisma"),
      [
        'generator client {',
        '  provider = "prisma-client-js"',
        '}',
        '',
        'datasource db {',
        '  provider = "mysql"',
        '  url      = env("DATABASE_URL")',
        '}',
      ].join("\n"),
      "utf8",
    );

    const commands: string[] = [];
    await initializeLogsProject(
      {
        cwd,
        adapter: "prisma",
        dialect: "mysql",
      },
      {
        runCommand: async (input) => {
          commands.push(input.command.join(" "));
          const migrationFile = path.join(
            cwd,
            "prisma",
            "migrations",
            "20260316000001_blyp_logs_init",
            "migration.sql",
          );
          await mkdir(path.dirname(migrationFile), { recursive: true });
          await writeFile(migrationFile, "-- prisma migration", "utf8");
        },
      },
    );

    const rerun = await initializeLogsProject(
      {
        cwd,
        adapter: "prisma",
        dialect: "mysql",
      },
      {
        runCommand: async (input) => {
          commands.push(input.command.join(" "));
        },
      },
    );

    const schemaContents = await readFile(
      path.join(cwd, "prisma", "schema.prisma"),
      "utf8",
    );

    expect(commands).toHaveLength(1);
    expect(schemaContents.match(/model BlypLog/g)).toHaveLength(1);
    expect(rerun.status).toBe("already_initialized");
    expect(rerun.migrationCommands).toEqual([]);
  });

  it("fails clearly when prisma setup is missing or incompatible", async () => {
    const cwd = await createTempDir();
    await createPackageManifest(cwd, {
      dependencies: {
        "@prisma/client": "^6.0.0",
      },
      devDependencies: {
        prisma: "^6.0.0",
      },
    });

    await expect(
      initializeLogsProject({
        cwd,
        adapter: "prisma",
        dialect: "postgres",
      }),
    ).rejects.toThrowError(
      new CliError("Prisma schema not found at prisma/schema.prisma."),
    );
  });
});

describe("drizzle database logging bootstrap", () => {
  it("detects a modular drizzle project, creates blyp.ts, and runs generate + migrate", async () => {
    const cwd = await createTempDir();
    await createPackageManifest(cwd, {
      dependencies: {
        "drizzle-orm": "^0.0.0",
      },
      devDependencies: {
        "drizzle-kit": "^0.0.0",
      },
    });
    await writeFile(
      path.join(cwd, "drizzle.config.ts"),
      [
        'export default {',
        "  schema: './src/db/schema/*.ts',",
        "  out: './drizzle',",
        "  dialect: 'postgresql',",
        "};",
      ].join("\n"),
      "utf8",
    );
    await mkdir(path.join(cwd, "src"), { recursive: true });
    await writeFile(
      path.join(cwd, "src", "db.ts"),
      "export const db = {};\n",
      "utf8",
    );

    const commands: string[] = [];
    const result = await initializeLogsProject(
      {
        cwd,
        adapter: "drizzle",
        dialect: "postgres",
      },
      {
        runCommand: async (input) => {
          commands.push(input.command.join(" "));
          if (input.command.includes("generate")) {
            const sqlPath = path.join(cwd, "drizzle", "0000_blyp_logs.sql");
            await mkdir(path.dirname(sqlPath), { recursive: true });
            await writeFile(sqlPath, "-- drizzle migration", "utf8");
          }
        },
      },
    );

    const schemaContents = await readFile(
      path.join(cwd, "src", "db", "schema", "blyp.ts"),
      "utf8",
    );

    expect(commands).toHaveLength(2);
    expect(commands[0]).toContain("drizzle-kit generate");
    expect(commands[1]).toContain("drizzle-kit migrate");
    expect(schemaContents).toContain("pgTable(");
    expect(schemaContents).toContain('jsonb("record").notNull()');
    expect(schemaContents).toContain('index("blyp_logs_group_id_timestamp_idx")');
    expect(result.snippet).toBe(
      [
        "import { db } from './src/db';",
        "import { blypLogs } from './src/db/schema/blyp';",
        "import { createDrizzleDatabaseAdapter } from 'blyp-js/database';",
        "",
        "export default {",
        "  destination: 'database',",
        "  database: {",
        "    dialect: 'postgres',",
        "    adapter: createDrizzleDatabaseAdapter({",
        "      db,",
        "      table: blypLogs,",
        "    }),",
        "  },",
        "};",
      ].join("\n"),
    );
    expect(result.migrationGeneratedPaths).toEqual([
      path.join("drizzle", "0000_blyp_logs.sql"),
    ]);
  });

  it("supports centralized mysql drizzle schema files without duplicating the table", async () => {
    const cwd = await createTempDir();
    await createPackageManifest(cwd, {
      dependencies: {
        "drizzle-orm": "^0.0.0",
      },
      devDependencies: {
        "drizzle-kit": "^0.0.0",
      },
    });
    await writeFile(
      path.join(cwd, "drizzle.config.ts"),
      [
        'export default {',
        "  schema: './src/db/schema.ts',",
        "  out: './drizzle',",
        "  dialect: 'mysql',",
        "};",
      ].join("\n"),
      "utf8",
    );
    await mkdir(path.join(cwd, "src", "db"), { recursive: true });
    await writeFile(
      path.join(cwd, "src", "db.ts"),
      "export const db = {};\n",
      "utf8",
    );
    await writeFile(
      path.join(cwd, "src", "db", "schema.ts"),
      [
        'import { mysqlTable, varchar } from "drizzle-orm/mysql-core";',
        "",
        'export const users = mysqlTable("users", {',
        '  id: varchar("id", { length: 36 }).primaryKey(),',
        "});",
      ].join("\n"),
      "utf8",
    );

    const commands: string[] = [];
    await initializeLogsProject(
      {
        cwd,
        adapter: "drizzle",
        dialect: "mysql",
      },
      {
        runCommand: async (input) => {
          commands.push(input.command.join(" "));
          if (input.command.includes("generate")) {
            const sqlPath = path.join(cwd, "drizzle", "0001_blyp_logs.sql");
            await mkdir(path.dirname(sqlPath), { recursive: true });
            await writeFile(sqlPath, "-- drizzle migration", "utf8");
          }
        },
      },
    );

    const rerun = await initializeLogsProject(
      {
        cwd,
        adapter: "drizzle",
        dialect: "mysql",
      },
      {
        runCommand: async (input) => {
          commands.push(input.command.join(" "));
        },
      },
    );

    const schemaContents = await readFile(
      path.join(cwd, "src", "db", "schema.ts"),
      "utf8",
    );

    expect(schemaContents.match(/export const blypLogs/g)).toHaveLength(1);
    expect(schemaContents).toContain("mysqlTable(");
    expect(schemaContents).toContain('datetime("timestamp", { fsp: 6, mode: "date" })');
    expect(commands).toHaveLength(2);
    expect(rerun.status).toBe("already_initialized");
  });

  it("fails clearly when drizzle setup is missing", async () => {
    const cwd = await createTempDir();
    await createPackageManifest(cwd, {
      dependencies: {
        "drizzle-orm": "^0.0.0",
      },
      devDependencies: {
        "drizzle-kit": "^0.0.0",
      },
    });

    await expect(
      initializeLogsProject({
        cwd,
        adapter: "drizzle",
        dialect: "postgres",
      }),
    ).rejects.toThrowError(
      new CliError(
        "Requested adapter drizzle, but no drizzle config or schema directory was found.",
      ),
    );
  });
});

describe("database workflow helpers", () => {
  it("writes blyp.config.ts when requested", async () => {
    const cwd = await createTempDir();

    const result = await writeBlypConfigFile({
      cwd,
      snippet: "export default {};",
      overwrite: true,
    });

    expect(result.status).toBe("created");
    await expect(readFile(path.join(cwd, "blyp.config.ts"), "utf8")).resolves.toContain(
      "export default {};",
    );
  });

  it("runs prisma generate for configured prisma projects", async () => {
    const cwd = await createTempDir();
    await createPackageManifest(cwd, {
      dependencies: {
        "@prisma/client": "^6.0.0",
      },
      devDependencies: {
        prisma: "^6.0.0",
      },
    });
    await writeFile(
      path.join(cwd, "blyp.config.ts"),
      "import { createPrismaDatabaseAdapter } from 'blyp-js/database';\nexport default { database: { adapter: createPrismaDatabaseAdapter({ client: prisma, model: 'blypLog' }) } };\n",
      "utf8",
    );

    const commands: string[] = [];
    const command = await runDatabaseGenerate(cwd, {
      runCommand: async (input) => {
        commands.push(input.command.join(" "));
      },
    });

    expect(await detectConfiguredDatabaseAdapter(cwd)).toBe("prisma");
    expect(command).toContain("prisma generate");
    expect(commands).toHaveLength(1);
  });

  it("runs drizzle generate + migrate for configured drizzle projects", async () => {
    const cwd = await createTempDir();
    await createPackageManifest(cwd, {
      dependencies: {
        "drizzle-orm": "^0.0.0",
      },
      devDependencies: {
        "drizzle-kit": "^0.0.0",
      },
    });
    await writeFile(
      path.join(cwd, "blyp.config.ts"),
      "import { createDrizzleDatabaseAdapter } from 'blyp-js/database';\nexport default { database: { adapter: createDrizzleDatabaseAdapter({ db, table: blypLogs }) } };\n",
      "utf8",
    );
    await writeFile(
      path.join(cwd, "drizzle.config.ts"),
      "export default { schema: './src/db/schema/*.ts', out: './drizzle', dialect: 'postgresql' };",
      "utf8",
    );
    await mkdir(path.join(cwd, "src"), { recursive: true });
    await writeFile(path.join(cwd, "src", "db.ts"), "export const db = {};\n", "utf8");

    const commands: string[] = [];
    await runDatabaseMigrate(cwd, {
      runCommand: async (input) => {
        commands.push(input.command.join(" "));
      },
    });

    expect(await detectConfiguredDatabaseAdapter(cwd)).toBe("drizzle");
    expect(commands).toHaveLength(2);
    expect(commands[0]).toContain("drizzle-kit generate");
    expect(commands[1]).toContain("drizzle-kit migrate");
  });
});

async function createTempDir(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "blyp-cli-logs-"));
  tempDirs.push(directory);
  return directory;
}

async function createPackageManifest(
  cwd: string,
  input: {
    readonly dependencies?: Record<string, string>;
    readonly devDependencies?: Record<string, string>;
    readonly scripts?: Record<string, string>;
  },
): Promise<void> {
  await writeFile(
    path.join(cwd, "package.json"),
    JSON.stringify(
      {
        name: "example-project",
        private: true,
        ...input,
      },
      null,
      2,
    ),
    "utf8",
  );
}
