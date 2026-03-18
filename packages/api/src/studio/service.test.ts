import { gzipSync } from "node:zlib";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { __setGenerateTextForTests } from "./assistant-provider";
import { __setStreamTextForTests } from "./assistant";
import { discoverStudioConfig } from "./config";
import {
  __setDatabaseQueryForTests,
  buildSyntheticDatabaseFile,
  loadDatabaseRecords,
  MAX_DB_SCANNED_RECORDS,
} from "./database";
import { discoverLogFiles } from "./logs";
import { resolveStudioProject } from "./project";
import { queryLogs } from "./query";
import {
  describeStudioSelection,
  getStudioAssistantStatus,
  getStudioConfig,
  getStudioFacets,
  getStudioFiles,
  getStudioGroup,
  getStudioLogs,
  getStudioMeta,
  getStudioRecordSource,
  replyWithStudioAssistant,
  streamStudioAssistant,
} from "./service";

const tempDirs: string[] = [];

afterEach(async () => {
  delete process.env.BLYPQ_STUDIO_TARGET;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_MODEL;
  delete process.env.DATABASE_URL;
  __setGenerateTextForTests(null);
  __setStreamTextForTests(null);
  __setDatabaseQueryForTests(null);

  await Promise.all(
    tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("studio project resolution", () => {
  it("prefers explicit input and resolves relative paths", async () => {
    const projectDir = await createProject();
    const relative = path.relative(process.cwd(), projectDir);

    const resolved = await resolveStudioProject(relative);

    expect(resolved.valid).toBe(true);
    expect(resolved.resolvedFrom).toBe("input");
    expect(resolved.absolutePath).toBe(projectDir);
  });

  it("falls back to env and reports invalid paths", async () => {
    process.env.BLYPQ_STUDIO_TARGET = path.join(process.cwd(), "missing-project");

    const resolved = await resolveStudioProject();

    expect(resolved.resolvedFrom).toBe("env");
    expect(resolved.valid).toBe(false);
    expect(resolved.error).toContain("does not exist");
  });
});

describe("studio config discovery", () => {
  it("uses Blyp config precedence and reports ignored files", async () => {
    const projectDir = await createProject();

    await writeFile(
      path.join(projectDir, "blyp.config.json"),
      JSON.stringify({ level: "info" }, null, 2),
    );
    await writeFile(
      path.join(projectDir, "blyp.config.ts"),
      `export default {
        level: "debug",
        file: { dir: "./var/logs" },
        clientLogging: { path: "/custom" }
      };`,
    );

    const project = await resolveStudioProject(projectDir);
    const config = await discoverStudioConfig(project);

    expect(config.status).toBe("found");
    expect(config.winner?.path.endsWith("blyp.config.ts")).toBe(true);
    expect(config.ignored).toHaveLength(1);
    expect(config.resolved.level).toBe("debug");
    expect(config.resolved.file.dir).toBe(path.join(projectDir, "var/logs"));
    expect(config.resolved.clientLogging.path).toBe("/custom");
  });

  it("surfaces config load errors and falls back to defaults", async () => {
    const projectDir = await createProject();

    await writeFile(path.join(projectDir, "blyp.config.json"), "{bad json");

    const project = await resolveStudioProject(projectDir);
    const config = await discoverStudioConfig(project);

    expect(config.status).toBe("error");
    expect(config.loadError).toBeTruthy();
    expect(config.resolved.file.dir).toBe(path.join(projectDir, "logs"));
  });
});

describe("studio log discovery and queries", () => {
  it("discovers active and archive files, including gz archives", async () => {
    const projectDir = await createProject();
    const logDir = path.join(projectDir, "logs");
    const archiveDir = path.join(logDir, "archive");

    await mkdir(archiveDir, { recursive: true });
    await writeFile(path.join(logDir, "log.ndjson"), createLogLine({ level: "info", message: "hello" }));
    await writeFile(
      path.join(archiveDir, "log.20260309T101530Z.ndjson.gz"),
      gzipSync(Buffer.from(createLogLine({ level: "error", message: "archived" }))),
    );

    const config = await getStudioConfig(projectDir);
    const files = await discoverLogFiles(projectDir, config);

    expect(files.files.map((file) => file.name)).toEqual([
      "log.ndjson",
      "log.20260309T101530Z.ndjson.gz",
    ]);
    expect(files.files[1]?.kind).toBe("archive");
  });

  it("reads ndjson and gz, keeps malformed lines, and filters server-side", async () => {
    const projectDir = await createProject();
    const logDir = path.join(projectDir, "logs");
    const archiveDir = path.join(logDir, "archive");

    await mkdir(archiveDir, { recursive: true });
    await writeFile(
      path.join(logDir, "log.ndjson"),
      [
        createLogLine({
          timestamp: "2026-03-13T10:00:00.000Z",
          level: "info",
          message: "request ok",
          type: "http_request",
          method: "GET",
          url: "/posts",
          statusCode: 200,
          responseTime: 32,
        }),
        "not-json-line\n",
      ].join(""),
    );
    await writeFile(
      path.join(archiveDir, "log.error.20260309T101530Z.ndjson.gz"),
      gzipSync(
        Buffer.from(
          createLogLine({
            timestamp: "2026-03-12T10:00:00.000Z",
            level: "error",
            message: "client failed",
            type: "client_log",
            source: "client",
          }),
        ),
      ),
    );

    const logs = await getStudioLogs({
      projectPath: projectDir,
      search: "request",
      limit: 50,
    });

    expect(logs.records).toHaveLength(1);
    expect(logs.records[0]?.http?.method).toBe("GET");

    const allLogs = await getStudioLogs({
      projectPath: projectDir,
      limit: 50,
      level: "error",
    });

    expect(allLogs.records).toHaveLength(1);
    expect(allLogs.records[0]?.source).toBe("client");

    const malformed = await getStudioLogs({
      projectPath: projectDir,
      search: "not-json-line",
      limit: 50,
    });

    expect(malformed.records[0]?.malformed).toBe(true);
  });

  it("groups structured logs, supports type filtering, and returns facets", async () => {
    const projectDir = await createProject();
    const logDir = path.join(projectDir, "logs");

    await mkdir(logDir, { recursive: true });
    await writeFile(
      path.join(logDir, "log.ndjson"),
      [
        createLogLine({
          timestamp: "2026-03-13T10:00:00.000Z",
          level: "info",
          message: "checkout started",
          type: "checkout_flow",
          groupId: "checkout-1",
          events: ["start"],
        }),
        createLogLine({
          timestamp: "2026-03-13T10:00:00.500Z",
          level: "info",
          message: "POST /checkout",
          type: "http_request",
          method: "POST",
          path: "/checkout",
          statusCode: 200,
          responseTime: 32,
          groupId: "checkout-1",
        }),
        createLogLine({
          timestamp: "2026-03-13T10:00:01.000Z",
          level: "error",
          message: "checkout failed",
          type: "checkout_flow",
          groupId: "checkout-1",
          events: ["error"],
        }),
        createLogLine({
          timestamp: "2026-03-13T10:00:05.000Z",
          level: "info",
          message: "plain log",
          type: "plain_log",
        }),
      ].join(""),
    );

    const grouped = await getStudioLogs({
      projectPath: projectDir,
      limit: 50,
      grouping: "grouped",
    });

    expect(grouped.entries.some((entry) => entry.kind === "structured-group")).toBe(true);

    const flat = await getStudioLogs({
      projectPath: projectDir,
      limit: 50,
      grouping: "flat",
      type: "checkout_flow",
    });

    expect(flat.records).toHaveLength(2);
    expect(flat.entries.every((entry) => entry.kind === "record")).toBe(true);

    const group = grouped.entries.find((entry) => entry.kind === "structured-group");
    expect(group?.recordCount).toBe(3);

    const detail = await getStudioGroup({
      projectPath: projectDir,
      groupId: group?.id ?? "",
    });

    expect(detail?.records).toHaveLength(3);
    expect(detail?.records.some((record) => record.message === "POST /checkout")).toBe(true);

    const facets = await getStudioFacets({ projectPath: projectDir });
    expect(facets.types).toEqual(["checkout_flow", "http_request", "plain_log"]);
    expect(facets.levels).toEqual(["error", "info"]);
  });

  it("creates heuristic structured groups when explicit ids are missing", async () => {
    const projectDir = await createProject();
    const logDir = path.join(projectDir, "logs");

    await mkdir(logDir, { recursive: true });
    await writeFile(
      path.join(logDir, "log.ndjson"),
      [
        createLogLine({
          timestamp: "2026-03-13T10:00:00.000Z",
          level: "info",
          message: "pipeline step one",
          type: "pipeline_run",
          caller: "worker",
          events: ["step-1"],
        }),
        createLogLine({
          timestamp: "2026-03-13T10:00:01.000Z",
          level: "info",
          message: "pipeline step two",
          type: "pipeline_run",
          caller: "worker",
          events: ["step-2"],
        }),
      ].join(""),
    );

    const grouped = await getStudioLogs({
      projectPath: projectDir,
      limit: 50,
      grouping: "grouped",
    });

    const group = grouped.entries.find((entry) => entry.kind === "structured-group");
    expect(group?.groupingReason).toBe("heuristic");
    expect(group?.recordCount).toBe(2);
  });

  it("summarizes nested structured events instead of generic structured_log labels", async () => {
    const projectDir = await createProject();
    const logDir = path.join(projectDir, "logs");

    await mkdir(logDir, { recursive: true });
    await writeFile(
      path.join(logDir, "log.ndjson"),
      createLogLine({
        timestamp: "2026-03-13T10:00:00.000Z",
        level: "error",
        message: "structured_log",
        type: "structured_log",
        groupId: "route.get.products",
        events: [
          {
            message: "GET /products/123",
            method: "GET",
            path: "/products/123",
            status: 404,
            duration: 3532,
          },
          {
            message: "Product not found: 123",
            kind: "domain_error",
          },
        ],
      }),
    );

    const grouped = await getStudioLogs({
      projectPath: projectDir,
      limit: 50,
      grouping: "grouped",
    });

    const group = grouped.entries.find((entry) => entry.kind === "structured-group");
    expect(group?.title).toBe("GET /products/123 404 3532ms");
    expect(group?.previewMessages).toEqual([
      "GET /products/123 404 3532ms",
      "Product not found: 123",
    ]);
    expect(group?.nestedEventCount).toBe(2);
  });

  it("marks queries truncated when scan budgets are exceeded", async () => {
    const projectDir = await createProject();
    const logDir = path.join(projectDir, "logs");

    await mkdir(logDir, { recursive: true });
    const content = Array.from({ length: 20_100 }, (_, index) =>
      createLogLine({
        timestamp: `2026-03-13T10:00:${String(index % 60).padStart(2, "0")}.000Z`,
        level: "info",
        message: `record-${index}`,
      }),
    ).join("");

    await writeFile(path.join(logDir, "log.ndjson"), content);

    const page = await getStudioLogs({
      projectPath: projectDir,
      limit: 50,
    });

    expect(page.truncated).toBe(true);
    expect(page.scannedRecords).toBe(20_000);
  });
});

describe("studio service", () => {
  it("returns meta and files from the composed service", async () => {
    const projectDir = await createProject();
    const logDir = path.join(projectDir, "logs");

    await mkdir(logDir, { recursive: true });
    await writeFile(
      path.join(projectDir, "blyp.config.json"),
      JSON.stringify({ file: { dir: "./logs" } }, null, 2),
    );
    await writeFile(path.join(logDir, "log.ndjson"), createLogLine({ level: "info", message: "hello" }));

    const meta = await getStudioMeta(projectDir);
    const files = await getStudioFiles(projectDir);

    expect(meta.project.valid).toBe(true);
    expect(meta.config.status).toBe("found");
    expect(files.files).toHaveLength(1);
  });

  it("supports direct queryLogs on discovered files", async () => {
    const projectDir = await createProject();
    const logDir = path.join(projectDir, "logs");

    await mkdir(logDir, { recursive: true });
    await writeFile(path.join(logDir, "log.ndjson"), createLogLine({ level: "info", message: "hello" }));

    const config = await getStudioConfig(projectDir);
    const files = await discoverLogFiles(projectDir, config);
    const page = await queryLogs({
      files: files.files,
      input: { projectPath: projectDir, limit: 10, offset: 0 },
    });

    expect(page.records[0]?.message).toBe("hello");
  });

  it("reports assistant status and returns mocked assistant replies", async () => {
    const projectDir = await createProject();
    const logDir = path.join(projectDir, "logs");
    const sourcePath = path.join(projectDir, "src/routes/checkout.ts");

    await mkdir(logDir, { recursive: true });
    await mkdir(path.dirname(sourcePath), { recursive: true });
    await writeFile(
      sourcePath,
      [
        "export function checkoutRoute() {",
        "  const cart = null;",
        "  if (!cart) {",
        "    throw new Error('checkout failed');",
        "  }",
        "}",
      ].join("\n"),
    );
    await writeFile(
      path.join(logDir, "log.ndjson"),
      [
        createLogLine({
          timestamp: "2026-03-13T10:00:00.000Z",
          level: "error",
          message: "checkout failed",
          type: "checkout_flow",
          groupId: "checkout-1",
          events: ["error"],
          caller: "src/routes/checkout.ts:4",
        }),
        createLogLine({
          timestamp: "2026-03-13T10:00:01.000Z",
          level: "info",
          message: "checkout retry scheduled",
          type: "checkout_flow",
          groupId: "checkout-1",
          events: ["retry"],
        }),
      ].join(""),
    );

    expect((await getStudioAssistantStatus(projectDir)).enabled).toBe(false);

    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.OPENROUTER_MODEL = "openai/gpt-5.4";
    let capturedPrompt = "";

    __setGenerateTextForTests(
      async ({ prompt }) => {
        capturedPrompt = prompt;
        return {
        text: "This looks like a failed checkout sequence with a follow-up retry.",
        };
      },
    );

    const grouped = await getStudioLogs({
      projectPath: projectDir,
      grouping: "grouped",
      limit: 50,
    });
    const flat = await getStudioLogs({
      projectPath: projectDir,
      grouping: "flat",
      limit: 50,
    });
    const selectedGroup = grouped.entries.find((entry) => entry.kind === "structured-group");

    const reply = await replyWithStudioAssistant({
      projectPath: projectDir,
      history: [{ role: "user", content: "What happened here?" }],
      filters: {},
      selectedGroupId: selectedGroup?.id,
    });

    expect(reply.content).toContain("failed checkout");
    expect(reply.references.length).toBeGreaterThan(0);

    const description = await describeStudioSelection({
      projectPath: projectDir,
      history: [],
      filters: {},
      selectedRecordId: flat.records.find((record) => record.message === "checkout failed")?.id,
    });

    expect(description.references.some((reference) => reference.kind === "record")).toBe(true);
    expect(capturedPrompt).toContain("Selected source context:");
    expect(capturedPrompt).toContain("src/routes/checkout.ts");
    expect(capturedPrompt).toContain("throw new Error('checkout failed');");
  });

  it("returns source context for a record and keeps framework-only records unavailable", async () => {
    const projectDir = await createProject();
    const logDir = path.join(projectDir, "logs");
    const sourcePath = path.join(projectDir, "src/routes/demo.ts");

    await mkdir(logDir, { recursive: true });
    await mkdir(path.dirname(sourcePath), { recursive: true });
    await writeFile(
      sourcePath,
      [
        "export function handler() {",
        "  const value = null;",
        "  if (!value) {",
        "    throw new Error('boom');",
        "  }",
        "}",
      ].join("\n"),
    );
    await writeFile(
      path.join(logDir, "log.ndjson"),
      [
        createLogLine({
          level: "error",
          message: "boom",
          caller: "src/routes/demo.ts:4",
        }),
        createLogLine({
          level: "error",
          message: "favicon missing",
          stack: `Error\n    at anonymous (${path.join(projectDir, "node_modules/elysia/index.js")}:12:33)`,
        }),
      ].join(""),
    );

    const logs = await getStudioLogs({ projectPath: projectDir, limit: 10, grouping: "flat" });

    const resolved = await getStudioRecordSource({
      projectPath: projectDir,
      recordId: logs.records.find((record) => record.message === "boom")?.id ?? "",
    });
    const unavailable = await getStudioRecordSource({
      projectPath: projectDir,
      recordId: logs.records.find((record) => record.message === "favicon missing")?.id ?? "",
    });

    expect(resolved).toMatchObject({
      status: "resolved",
      location: {
        relativePath: "src/routes/demo.ts",
        line: 4,
      },
    });
    expect(resolved.snippet).toContain("throw new Error('boom');");
    expect(unavailable).toMatchObject({
      status: "unavailable",
      reason: "node_modules",
    });
  });

  it("includes selected record source context in streamed prompts", async () => {
    const projectDir = await createProject();
    const logDir = path.join(projectDir, "logs");
    const sourcePath = path.join(projectDir, "src/routes/stream.ts");

    await mkdir(logDir, { recursive: true });
    await mkdir(path.dirname(sourcePath), { recursive: true });
    await writeFile(
      sourcePath,
      [
        "export function streamDemo() {",
        "  const user = null;",
        "  if (!user) {",
        "    throw new Error('stream failure');",
        "  }",
        "}",
      ].join("\n"),
    );
    await writeFile(
      path.join(logDir, "log.ndjson"),
      createLogLine({
        level: "error",
        message: "stream failure",
        caller: "src/routes/stream.ts:4",
      }),
    );

    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.OPENROUTER_MODEL = "openai/gpt-5.4";

    let streamedPrompt = "";
    __setStreamTextForTests(async ({ prompt, model, references }) => {
      streamedPrompt = prompt;
      return {
        result: {} as never,
        references,
        model,
      };
    });

    const logs = await getStudioLogs({ projectPath: projectDir, limit: 10, grouping: "flat" });
    await streamStudioAssistant({
      projectPath: projectDir,
      filters: {},
      selectedRecordId: logs.records[0]?.id,
      messages: [
        {
          id: "u1",
          role: "user",
          parts: [{ type: "text", text: "What caused this?" }],
        } as never,
      ],
      mode: "describe-selection",
    });

    expect(streamedPrompt).toContain("Selected source context:");
    expect(streamedPrompt).toContain("src/routes/stream.ts");
    expect(streamedPrompt).toContain("throw new Error('stream failure');");
  });
});

describe("studio DB mode", () => {
  it("config with destination=database and Prisma adapter resolves DB-ready summary", async () => {
    const projectDir = await createProject();
    await writeFile(
      path.join(projectDir, "blyp.config.ts"),
      [
        "const client = {",
        "  blypLog: {",
        "    async findMany() {",
        "      return [];",
        "    },",
        "  },",
        "};",
        "",
        "export default {",
        "  destination: 'database',",
        "  database: {",
        "    dialect: 'postgres',",
        "    adapter: {",
        "      type: 'prisma',",
        "      client,",
        "      model: 'blypLog',",
        "    },",
        "  },",
        "};",
      ].join("\n"),
    );

    const project = await resolveStudioProject(projectDir);
    const config = await discoverStudioConfig(project);

    expect(config.resolved.destination).toBe("database");
    expect(config.resolved.database.enabled).toBe(true);
    expect(config.resolved.database.ready).toBe(true);
    expect(config.resolved.database.adapterKind).toBe("prisma");
    expect(config.resolved.database.dialect).toBe("postgres");
    expect(config.resolved.database.model).toBe("blypLog");
    expect(config.resolved.database.status).toBe("enabled");
  });

  it("JSON config with database fields resolves DB mode when dialect is present", async () => {
    const projectDir = await createProject();

    await writeFile(
      path.join(projectDir, "blyp.config.json"),
      JSON.stringify({
        destination: "database",
        database: { dialect: "postgres", adapter: { type: "prisma" } },
      }),
    );

    const project = await resolveStudioProject(projectDir);
    const config = await discoverStudioConfig(project);

    expect(config.resolved.destination).toBe("database");
    expect(config.resolved.database.adapterKind).toBe("prisma");
    expect(config.resolved.database.status).toBe("enabled");
    expect(config.resolved.database.ready).toBe(true);
  });

  it("getStudioMeta reports file mode for normal file-based projects", async () => {
    const projectDir = await createProject();
    const logDir = path.join(projectDir, "logs");

    await mkdir(logDir, { recursive: true });
    await writeFile(
      path.join(projectDir, "blyp.config.json"),
      JSON.stringify({ file: { dir: "./logs" } }),
    );
    await writeFile(path.join(logDir, "log.ndjson"), createLogLine({ message: "hello" }));

    const meta = await getStudioMeta(projectDir);

    expect(meta.logs.mode).toBe("file");
    expect(meta.logs.database).toBeNull();
    expect(meta.logs.fileCount).toBe(1);
  });

  it("getStudioFiles returns synthetic DB source when destination=database with ready adapter", async () => {
    const projectDir = await createProject();
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/test";
    __setDatabaseQueryForTests(async () => [
      {
        id: "row-1",
        timestamp: new Date("2026-03-13T10:00:00.000Z"),
        createdAt: new Date("2026-03-13T10:00:00.000Z"),
        level: "info",
        message: "hello from db",
        type: "test_event",
        caller: null,
        bindings: null,
        data: null,
        error: null,
        record: null,
      },
    ]);
    const configWithDb = buildDbConfig({
      adapterKind: "prisma",
      dialect: "postgres",
      model: "blypLog",
    });

    const syntheticFile = buildSyntheticDatabaseFile(configWithDb.resolved);
    expect(syntheticFile.id).toBe("database:primary");
    expect(syntheticFile.name).toBe("blypLog");
    expect(syntheticFile.absolutePath).toBe("database://blyp_logs");

    const result = await loadDatabaseRecords({
      projectPath: projectDir,
      config: configWithDb,
      input: {},
    });

    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.message).toBe("hello from db");
    expect(result.records[0]?.level).toBe("info");
    expect(result.records[0]?.fileId).toBe("database:primary");
    expect(result.records[0]?.lineNumber).toBe(0);
    expect(result.records[0]?.malformed).toBe(false);
    expect(result.truncated).toBe(false);
  });

  it("DB mode with missing DATABASE_URL errors cleanly", async () => {
    const projectDir = await createProject();
    const configWithDb = buildDbConfig({
      adapterKind: "prisma",
      dialect: "postgres",
      model: "blypLog",
    });

    await expect(
      loadDatabaseRecords({
        projectPath: projectDir,
        config: configWithDb,
        input: {},
      }),
    ).rejects.toThrow("requires DATABASE_URL");
  });

  it("DB mode with missing dialect errors cleanly", async () => {
    const projectDir = await createProject();

    const configWithNoAdapter = {
      parsedConfig: {
        destination: "database",
        database: { adapter: { type: "prisma" } },
      },
      resolved: {
        destination: "database" as const,
        database: {
          enabled: true,
          ready: false,
          dialect: null,
          adapterKind: "prisma" as const,
          model: "blypLog",
          label: "blypLog",
          status: "invalid" as const,
        },
        file: { dir: "", archiveDir: "", format: "ndjson" as const, enabled: true, rotation: { enabled: true, maxSizeBytes: 0, maxArchives: 0, compress: false } },
        pretty: true,
        level: "info",
        logDir: "",
        clientLogging: { enabled: false, path: "" },
        ai: { apiKeyConfigured: false, apiKeySource: "missing" as const, model: null, modelSource: "missing" as const, enabled: false },
        connectors: { posthog: { enabled: false, mode: "auto", host: "", serviceName: "", errorTracking: { enabled: false, mode: "auto", enableExceptionAutocapture: false, ready: false, status: "missing" as const } }, sentry: { enabled: false, mode: "auto", ready: false, status: "missing" as const }, otlp: [] },
      },
      status: "found" as const,
      winner: null,
      ignored: [],
      rawContent: null,
      loadError: null,
    };

    await expect(
      loadDatabaseRecords({
        projectPath: projectDir,
        config: configWithNoAdapter,
        input: {},
      }),
    ).rejects.toThrow("requires database.dialect");
  });

  it("SQL loading applies level/type predicates and search remains in-memory", async () => {
    const projectDir = await createProject();
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/test";

    let capturedQuery = "";
    let capturedValues: unknown[] = [];
    const rows = [
      {
        id: "row-1",
        timestamp: new Date("2026-03-13T10:00:00.000Z"),
        createdAt: new Date("2026-03-13T10:00:00.000Z"),
        level: "error",
        message: "payment failed",
        type: "payment_event",
        caller: null,
        bindings: null,
        data: null,
        error: null,
        record: null,
      },
      {
        id: "row-2",
        timestamp: new Date("2026-03-13T10:00:01.000Z"),
        createdAt: new Date("2026-03-13T10:00:01.000Z"),
        level: "info",
        message: "payment retry",
        type: "payment_event",
        caller: null,
        bindings: null,
        data: null,
        error: null,
        record: null,
      },
    ];
    __setDatabaseQueryForTests(async ({ query, values }) => {
      capturedQuery = query;
      capturedValues = values;
      return rows;
    });

    const configWithPrisma = buildDbConfig({
      adapterKind: "prisma",
      dialect: "postgres",
      model: "blypLog",
    });

    const result = await loadDatabaseRecords({
      projectPath: projectDir,
      config: configWithPrisma,
      input: { level: "error", type: "payment_event" },
    });

    expect(capturedQuery).toContain(`"level" = $1`);
    expect(capturedQuery).toContain(`"type" = $2`);
    expect(capturedValues.slice(0, 2)).toEqual(["error", "payment_event"]);
    expect(result.records).toHaveLength(2);
    expect(result.records[0]?.level).toBe("error");
  });

  it("SQL loading keeps scalar fallback fields and supports mysql dialect", async () => {
    const projectDir = await createProject();
    process.env.DATABASE_URL = "mysql://user:pass@localhost:3306/test";
    let capturedQuery = "";

    __setDatabaseQueryForTests(async ({ query }) => {
      capturedQuery = query;
      return [
      {
        id: "row-1",
        timestamp: new Date("2026-03-13T10:00:00.000Z"),
        createdAt: new Date("2026-03-13T10:00:00.000Z"),
        level: "error",
        message: "checkout failed",
        type: "http_error",
        caller: "src/routes/checkout.ts:4",
        method: "POST",
        path: "/checkout",
        status: 500,
        duration: 42,
        bindings: null,
        data: { orderId: "ord_1" },
        error: { message: "boom", stack: "Error\n    at src/routes/checkout.ts:4:1" },
        events: [{ step: "request" }],
        record: null,
      },
    ];
    });

    const configWithDrizzle = buildDbConfig({
      adapterKind: "drizzle",
      dialect: "mysql",
    });

    const result = await loadDatabaseRecords({
      projectPath: projectDir,
      config: configWithDrizzle,
      input: { level: "error", type: "http_error" },
    });

    expect(capturedQuery).toContain("`level` = ?");
    expect(capturedQuery).toContain("`type` = ?");
    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.message).toBe("checkout failed");
    expect(result.records[0]?.http).toMatchObject({
      method: "POST",
      path: "/checkout",
      statusCode: 500,
      durationMs: 42,
    });
    expect(result.records[0]?.raw).toMatchObject({
      path: "/checkout",
      status: 500,
      duration: 42,
      events: [{ step: "request" }],
    });
  });

  it("DB mode groups related rows by scalar groupId when record payload omits it", async () => {
    const projectDir = await createProject();
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/test";

    __setDatabaseQueryForTests(async () => [
      {
        id: "row-1",
        timestamp: new Date("2026-03-13T10:00:00.000Z"),
        createdAt: new Date("2026-03-13T10:00:00.000Z"),
        level: "info",
        message: "fetching product",
        type: "structured_log",
        groupId: "product.getBySku",
        caller: "src/services/product-service.ts:27",
        record: {
          message: "fetching product",
          type: "structured_log",
          events: [{ message: "fetching product" }],
        },
      },
      {
        id: "row-2",
        timestamp: new Date("2026-03-13T10:00:01.000Z"),
        createdAt: new Date("2026-03-13T10:00:01.000Z"),
        level: "error",
        message: "Product not found: 123",
        type: "server_log",
        groupId: "product.getBySku",
        caller: "src/services/product-service.ts:28",
        record: {
          message: "Product not found: 123",
          type: "server_log",
        },
      },
    ]);

    await writeFile(
      path.join(projectDir, "blyp.config.ts"),
      `export default {
        destination: "database",
        database: {
          dialect: "postgres",
          adapter: { type: "prisma", model: "blypLog" },
        },
      };`,
    );

    const grouped = await getStudioLogs({
      projectPath: projectDir,
      limit: 20,
      grouping: "grouped",
    });

    const group = grouped.entries.find((entry) => entry.kind === "structured-group");
    expect(group?.recordCount).toBe(2);
    expect(grouped.entries.filter((entry) => entry.kind === "structured-group")).toHaveLength(1);
  });

  it("sanitizes circular DB payloads before returning Studio records", async () => {
    const projectDir = await createProject();
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/test";

    const circularData: Record<string, unknown> = { label: "payload" };
    circularData.self = circularData;

    const circularRecord: Record<string, unknown> = {
      timestamp: "2026-03-13T10:00:00.000Z",
      level: "error",
      message: "circular payload",
    };
    circularRecord.loop = circularRecord;
    __setDatabaseQueryForTests(async () => [
      {
        id: "row-circular",
        timestamp: new Date("2026-03-13T10:00:00.000Z"),
        createdAt: new Date("2026-03-13T10:00:00.000Z"),
        level: "error",
        message: "circular payload",
        type: "test_event",
        caller: null,
        bindings: circularData,
        data: circularData,
        error: circularData,
        record: circularRecord,
      },
    ]);

    const configWithPrisma = buildDbConfig({
      adapterKind: "prisma",
      dialect: "postgres",
      model: "blypLog",
    });
    const result = await loadDatabaseRecords({
      projectPath: projectDir,
      config: configWithPrisma,
      input: {},
    });

    expect(result.records[0]?.data).toMatchObject({
      label: "payload",
      self: "[Circular]",
    });
    expect(result.records[0]?.raw).toMatchObject({
      message: "circular payload",
      loop: "[Circular]",
    });
    expect(() => JSON.stringify(result.records[0])).not.toThrow();
  });

  it("Prisma DB truncated flag works when rows exceed cap", async () => {
    const projectDir = await createProject();
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/test";

    const manyRows = Array.from({ length: MAX_DB_SCANNED_RECORDS + 1 }, (_, i) => ({
      id: `row-${i}`,
      timestamp: new Date("2026-03-13T10:00:00.000Z"),
      createdAt: new Date("2026-03-13T10:00:00.000Z"),
      level: "info",
      message: `record ${i}`,
      type: null,
      caller: null,
      bindings: null,
      data: null,
      error: null,
      record: null,
    }));
    __setDatabaseQueryForTests(async () => manyRows);

    const configWithPrisma = buildDbConfig({
      adapterKind: "prisma",
      dialect: "postgres",
      model: "blypLog",
    });

    const result = await loadDatabaseRecords({
      projectPath: projectDir,
      config: configWithPrisma,
      input: {},
    });

    expect(result.truncated).toBe(true);
    expect(result.records).toHaveLength(MAX_DB_SCANNED_RECORDS);
  });
});

function buildDbConfig({
  adapterKind,
  dialect = "postgres",
  model,
}: {
  adapterKind: "prisma" | "drizzle";
  dialect?: "postgres" | "mysql";
  model?: string;
}) {
  return {
    parsedConfig: {
      destination: "database",
      database: {
        dialect,
        adapter: {
          type: adapterKind,
          model,
        },
      },
    },
    resolved: {
      destination: "database" as const,
      database: {
        enabled: true,
        ready: true,
        dialect,
        adapterKind,
        model: adapterKind === "prisma" ? (model ?? "blypLog") : null,
        label: adapterKind === "prisma" ? (model ?? "blypLog") : "blyp_logs",
        status: "enabled" as const,
      },
      file: {
        dir: "",
        archiveDir: "",
        format: "ndjson" as const,
        enabled: true,
        rotation: { enabled: true, maxSizeBytes: 0, maxArchives: 0, compress: false },
      },
      pretty: true,
      level: "info",
      logDir: "",
      clientLogging: { enabled: false, path: "" },
      ai: {
        apiKeyConfigured: false,
        apiKeySource: "missing" as const,
        model: null,
        modelSource: "missing" as const,
        enabled: false,
      },
      connectors: {
        posthog: {
          enabled: false,
          mode: "auto",
          host: "",
          serviceName: "",
          errorTracking: {
            enabled: false,
            mode: "auto",
            enableExceptionAutocapture: false,
            ready: false,
            status: "missing" as const,
          },
        },
        sentry: { enabled: false, mode: "auto", ready: false, status: "missing" as const },
        otlp: [],
      },
    },
    status: "found" as const,
    winner: null,
    ignored: [],
    rawContent: null,
    loadError: null,
  };
}

async function createProject(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "blyp-studio-"));
  tempDirs.push(directory);
  await writeFile(
    path.join(directory, "package.json"),
    JSON.stringify({ name: "fixture-project" }, null, 2),
  );
  return directory;
}

function createLogLine(record: Record<string, unknown>): string {
  return `${JSON.stringify({
    timestamp: "2026-03-13T00:00:00.000Z",
    level: "info",
    message: "default",
    ...record,
  })}\n`;
}
