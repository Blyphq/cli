import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { __setGenerateTextForTests } from "./assistant-provider";
import { __setDatabaseQueryForTests } from "../studio/database";
import { appRouter } from "../routers/index";

const tempDirs: string[] = [];
const originalHome = process.env.HOME;

afterEach(async () => {
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_MODEL;
  delete process.env.DATABASE_URL;
  process.env.HOME = originalHome;
  __setGenerateTextForTests(null);
  __setDatabaseQueryForTests(null);

  await Promise.all(
    tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("studio router", () => {
  it("serves meta, files, and logs through tRPC callers", async () => {
    const projectDir = await createProject();
    const logDir = path.join(projectDir, "logs");

    await mkdir(logDir, { recursive: true });
    await writeFile(
      path.join(projectDir, "blyp.config.json"),
      JSON.stringify({ file: { dir: "./logs" } }, null, 2),
    );
    await writeFile(
      path.join(logDir, "log.ndjson"),
      `${JSON.stringify({
        timestamp: "2026-03-13T12:00:00.000Z",
        level: "info",
        message: "hello from caller",
      })}\n`,
    );

    const caller = appRouter.createCaller({ session: null });

    const meta = await caller.studio.meta({ projectPath: projectDir });
    const files = await caller.studio.files({ projectPath: projectDir });
    const logs = await caller.studio.logs({ projectPath: projectDir, limit: 10 });
    const facets = await caller.studio.facets({ projectPath: projectDir });

    expect(meta.project.valid).toBe(true);
    expect(files.files[0]?.name).toBe("log.ndjson");
    expect(logs.records[0]?.message).toBe("hello from caller");
    expect(facets.levels).toContain("info");
  });

  it("serves grouped logs and assistant routes", async () => {
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
        JSON.stringify({
          timestamp: "2026-03-13T12:00:00.000Z",
          level: "error",
          message: "checkout failed",
          type: "checkout_flow",
          groupId: "checkout-1",
          events: ["error"],
          caller: "src/routes/checkout.ts:4",
        }),
        JSON.stringify({
          timestamp: "2026-03-13T12:00:01.000Z",
          level: "info",
          message: "checkout retry",
          type: "checkout_flow",
          groupId: "checkout-1",
          events: ["retry"],
        }),
      ].join("\n") + "\n",
    );

    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.OPENROUTER_MODEL = "openai/gpt-5.4";
    __setGenerateTextForTests(
      async () => ({
        text: "The checkout failed and then retried.",
      }),
    );

    const caller = appRouter.createCaller({ session: null });
    const logs = await caller.studio.logs({
      projectPath: projectDir,
      grouping: "grouped",
      limit: 10,
    });
    const flatLogs = await caller.studio.logs({
      projectPath: projectDir,
      grouping: "flat",
      limit: 10,
    });
    const group = logs.entries.find((entry) => entry.kind === "structured-group");

    expect(group).toBeTruthy();

    const groupDetail = await caller.studio.group({
      projectPath: projectDir,
      groupId: group?.id ?? "",
    });
    const selectedRecord = flatLogs.records.find((record) => record.message === "checkout failed");
    const recordSource = await caller.studio.recordSource({
      projectPath: projectDir,
      recordId: selectedRecord?.id ?? "",
    });
    const assistantStatus = await caller.studio.assistantStatus({ projectPath: projectDir });
    const description = await caller.studio.describeSelection({
      projectPath: projectDir,
      history: [],
      filters: {},
      selectedGroupId: group?.id,
    });

    expect(groupDetail?.records).toHaveLength(2);
    expect(recordSource).toMatchObject({
      status: "resolved",
      location: {
        relativePath: "src/routes/checkout.ts",
      },
    });
    expect(assistantStatus.enabled).toBe(true);
    expect(description.references.length).toBeGreaterThan(0);
  });

  it("serves DB-backed Studio routes through tRPC callers", async () => {
    const projectDir = await createProject();
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/test";
    __setDatabaseQueryForTests(async () => [
      {
        id: "db-row-1",
        timestamp: new Date("2026-03-13T12:00:00.000Z"),
        createdAt: new Date("2026-03-13T12:00:00.000Z"),
        level: "error",
        message: "hello from db caller",
        type: "checkout_flow",
        caller: "src/routes/db.ts:4",
        bindings: { requestId: "req_1" },
        data: { orderId: "ord_1" },
        error: null,
        record: {
          timestamp: "2026-03-13T12:00:00.000Z",
          level: "error",
          message: "hello from db caller",
          type: "checkout_flow",
          caller: "src/routes/db.ts:4",
          groupId: "checkout-1",
          events: ["error"],
        },
      },
    ]);

    await writeFile(
      path.join(projectDir, "blyp.config.ts"),
      [
        "export default {",
        "  destination: 'database',",
        "  database: {",
        "    dialect: 'postgres',",
        "    adapter: {",
        "      type: 'prisma',",
        "      model: 'blypLog',",
        "    },",
        "  },",
        "};",
      ].join("\n"),
    );

    const caller = appRouter.createCaller({ session: null });

    const meta = await caller.studio.meta({ projectPath: projectDir });
    const files = await caller.studio.files({ projectPath: projectDir });
    const logs = await caller.studio.logs({
      projectPath: projectDir,
      level: "error",
      grouping: "flat",
      limit: 10,
    });

    expect(meta.logs.mode).toBe("database");
    expect(meta.logs.database).toMatchObject({
      adapterKind: "prisma",
      dialect: "postgres",
      status: "enabled",
    });
    expect(files.files[0]?.id).toBe("database:primary");
    expect(logs.records[0]).toMatchObject({
      message: "hello from db caller",
      filePath: "database://blyp_logs",
      lineNumber: 0,
    });
  });

  it("serves delivery status and dead-letter mutations through tRPC callers", async () => {
    const projectDir = await createProject();
    process.env.HOME = projectDir;

    await writeFile(
      path.join(projectDir, "blyp.config.json"),
      JSON.stringify({
        connectors: {
          betterstack: {
            enabled: true,
            sourceToken: "token",
            ingestingHost: "https://in.logs.betterstack.com",
          },
          otlp: [
            {
              name: "billing",
              enabled: true,
              endpoint: "https://otel.example.com",
            },
          ],
        },
      }, null, 2),
    );

    await seedQueueDb(path.join(projectDir, ".blyp", "queue.db"));

    const caller = appRouter.createCaller({ session: null });

    const status = await caller.studio.deliveryStatus({ projectPath: projectDir });
    expect(status.available).toBe(true);
    expect(status.connectors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "betterstack",
          deadLetterCount: 1,
          health: "dead-lettered",
          lastError: "temporary outage",
        }),
        expect.objectContaining({
          key: "otlp:billing",
          pendingCount: 1,
        }),
      ]),
    );
    expect(status.deadLetters.items[0]).toMatchObject({
      connectorKey: "betterstack",
      payloadPreview: "failed delivery",
      lastError: "temporary outage",
    });

    const retried = await caller.studio.retryDeadLetters({ ids: ["dead-1"] });
    expect(retried.retriedCount).toBe(1);

    const afterRetry = await caller.studio.deliveryStatus({ projectPath: projectDir });
    expect(afterRetry.deadLetters.total).toBe(0);
    expect(afterRetry.connectors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "betterstack",
          pendingCount: 1,
        }),
      ]),
    );

    const cleared = await caller.studio.clearDeadLetters({ ids: ["missing"] });
    expect(cleared.clearedCount).toBe(0);
  });
});

async function createProject(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "blyp-router-"));
  tempDirs.push(directory);
  await writeFile(
    path.join(directory, "package.json"),
    JSON.stringify({ name: "fixture-project" }, null, 2),
  );
  return directory;
}

async function seedQueueDb(queuePath: string): Promise<void> {
  await mkdir(path.dirname(queuePath), { recursive: true });
  const sqlite = await import("node:sqlite");
  const database = new sqlite.DatabaseSync(queuePath);

  try {
    database.exec([
      "CREATE TABLE connector_jobs (",
      "  id TEXT PRIMARY KEY,",
      "  connector_type TEXT NOT NULL,",
      "  connector_target TEXT NULL,",
      "  operation TEXT NOT NULL,",
      "  payload_json TEXT NOT NULL,",
      "  attempt_count INTEGER NOT NULL,",
      "  max_attempts INTEGER NOT NULL,",
      "  next_attempt_at INTEGER NOT NULL,",
      "  state TEXT NOT NULL,",
      "  last_error TEXT NULL,",
      "  created_at INTEGER NOT NULL,",
      "  updated_at INTEGER NOT NULL,",
      "  claimed_at INTEGER NULL",
      ");",
      "CREATE TABLE connector_dead_letters (",
      "  id TEXT PRIMARY KEY,",
      "  connector_type TEXT NOT NULL,",
      "  connector_target TEXT NULL,",
      "  operation TEXT NOT NULL,",
      "  payload_json TEXT NOT NULL,",
      "  attempt_count INTEGER NOT NULL,",
      "  max_attempts INTEGER NOT NULL,",
      "  last_error TEXT NULL,",
      "  first_enqueued_at INTEGER NOT NULL,",
      "  dead_lettered_at INTEGER NOT NULL,",
      "  last_attempt_at INTEGER NOT NULL",
      ");",
      "CREATE TABLE connector_delivery_status (",
      "  connector_type TEXT NOT NULL,",
      "  connector_target TEXT NULL,",
      "  last_success_at INTEGER NULL,",
      "  last_failure_at INTEGER NULL,",
      "  last_error TEXT NULL,",
      "  updated_at INTEGER NOT NULL",
      ");",
    ].join("\n"));

    const now = Date.now();
    database.prepare(
      "INSERT INTO connector_dead_letters (id, connector_type, connector_target, operation, payload_json, attempt_count, max_attempts, last_error, first_enqueued_at, dead_lettered_at, last_attempt_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      "dead-1",
      "betterstack",
      null,
      "send",
      JSON.stringify({ record: { message: "failed delivery" } }),
      8,
      8,
      "temporary outage",
      now - 5_000,
      now - 1_000,
      now - 1_000,
    );
    database.prepare(
      "INSERT INTO connector_jobs (id, connector_type, connector_target, operation, payload_json, attempt_count, max_attempts, next_attempt_at, state, last_error, created_at, updated_at, claimed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      "job-1",
      "otlp",
      "billing",
      "send",
      JSON.stringify({ record: { message: "retrying delivery" } }),
      1,
      8,
      now,
      "pending",
      "still retrying",
      now - 10_000,
      now,
      null,
    );
    database.prepare(
      "INSERT INTO connector_delivery_status (connector_type, connector_target, last_success_at, last_failure_at, last_error, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run("betterstack", null, now - 50_000, now - 1_000, "temporary outage", now - 1_000);
    database.prepare(
      "INSERT INTO connector_delivery_status (connector_type, connector_target, last_success_at, last_failure_at, last_error, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run("otlp", "billing", now - 20_000, now - 5_000, "still retrying", now - 5_000);
  } finally {
    database.close();
  }
}
