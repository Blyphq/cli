import { gzipSync } from "node:zlib";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
  addStudioCustomSection,
  describeStudioSelection,
  getStudioAssistantStatus,
  getStudioAgentTask,
  getStudioAgents,
  getStudioAuth,
  getStudioBackgroundJobRun,
  getStudioBackgroundJobs,
  getStudioConfig,
  getStudioDatabase,
  getStudioErrorGroup,
  getStudioErrors,
  getStudioFacets,
  getStudioFiles,
  getStudioGroup,
  getStudioHttp,
  getStudioLogs,
  getStudioMeta,
  getStudioOverview,
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

describe("studio http section", () => {
  it("builds http aggregates, normalizes routes, and links traces", async () => {
    const projectDir = await createProject();
    const logDir = path.join(projectDir, "logs");

    await mkdir(logDir, { recursive: true });
    await writeFile(
      path.join(logDir, "log.ndjson"),
      [
        createLogLine({
          timestamp: "2026-03-13T10:00:00.000Z",
          type: "http_request",
          method: "GET",
          path: "/api/users/1842?tab=profile",
          route: "/api/users/:id",
          statusCode: 200,
          responseTime: 120,
          requestId: "req-1",
        }),
        createLogLine({
          timestamp: "2026-03-13T10:01:00.000Z",
          type: "http_request",
          method: "GET",
          path: "/api/users/99",
          statusCode: 503,
          responseTime: 1800,
          traceId: "trace-1",
        }),
        createLogLine({
          timestamp: "2026-03-13T10:01:00.500Z",
          level: "info",
          message: "trace companion",
          traceId: "trace-1",
        }),
      ].join(""),
    );

    const http = await getStudioHttp({ projectPath: projectDir });

    expect(http.stats.totalRequests).toBe(2);
    expect(http.stats.errorRate).toBe(0.5);
    expect(http.stats.statusGroups["2xx"]).toBe(1);
    expect(http.stats.statusGroups["5xx"]).toBe(1);
    expect(http.requests[0]?.route).toBe("/api/users/:id");
    expect(http.performance[0]?.route).toBe("/api/users/:id");
    expect(http.performance[0]?.highlight).toBe("error");
    expect(http.requests[0]?.traceGroupId).toBeTruthy();
    expect(http.timeseries.length).toBeGreaterThan(0);
    expect(http.facets.routes).toContain("/api/users/:id");
  });

  it("redacts sensitive http headers and request bodies", async () => {
    const projectDir = await createProject();
    const logDir = path.join(projectDir, "logs");

    await mkdir(logDir, { recursive: true });
    await writeFile(
      path.join(logDir, "log.ndjson"),
      createLogLine({
        type: "http_request",
        method: "POST",
        path: "/session/create",
        statusCode: 200,
        responseTime: 45,
        request: {
          headers: {
            authorization: "Bearer super-secret",
            "x-request-id": "req-1",
          },
          body: {
            password: "hunter2",
            safe: "value",
          },
        },
        response: {
          headers: {
            "set-cookie": "session=abc",
          },
          body: {
            token: "secret-token",
            ok: true,
          },
        },
      }),
    );

    const logs = await getStudioLogs({
      projectPath: projectDir,
      sectionId: "http",
      grouping: "flat",
    });

    expect(logs.records[0]?.http?.requestHeaders).toEqual({
      authorization: "[redacted]",
      "x-request-id": "req-1",
    });
    expect(logs.records[0]?.http?.requestBody).toEqual({
      password: "[redacted]",
      safe: "value",
    });
    expect(logs.records[0]?.http?.responseHeaders).toEqual({
      "set-cookie": "[redacted]",
    });
    expect(logs.records[0]?.http?.responseBody).toEqual({
      token: "[redacted]",
      ok: true,
    });
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

  it("builds overview stats, sections, feed, and recent errors", async () => {
    const projectDir = await createProject();
    const logDir = path.join(projectDir, "logs");

    await mkdir(logDir, { recursive: true });
    await writeFile(
      path.join(logDir, "log.ndjson"),
      [
        createLogLine({
          timestamp: "2026-03-13T11:30:00.000Z",
          level: "info",
          message: "checkout started",
          type: "checkout_flow",
          path: "/checkout",
          responseTime: 240,
          traceId: "trace-1",
        }),
        createLogLine({
          timestamp: "2026-03-13T11:40:00.000Z",
          level: "warn",
          message: "checkout slow",
          type: "checkout_flow",
          path: "/checkout",
          responseTime: 612,
          traceId: "trace-2",
        }),
        createLogLine({
          timestamp: "2026-03-13T11:55:00.000Z",
          level: "error",
          message: "checkout failed",
          type: "TypeError",
          path: "/checkout",
          method: "POST",
          statusCode: 500,
          responseTime: 900,
          traceId: "trace-1",
          error: { message: "checkout failed" },
        }),
      ].join(""),
    );

    const overview = await getStudioOverview({ projectPath: projectDir });

    expect(overview.stats.totalEvents.value).toBe(3);
    expect(overview.stats.errorRate.status).toBe("critical");
    expect(overview.stats.warnings.value).toBeGreaterThanOrEqual(0);
    expect(overview.stats.avgResponseTime.value).toBe(612);
    expect(overview.liveFeed).toHaveLength(3);
    expect(overview.sections.some((section) => section.id === "payments")).toBe(true);
    expect(overview.recentErrors[0]?.message).toBe("checkout failed");
  });

  it("uses pino-style time/msg fields and parses HTTP timing from message fallback", async () => {
    const projectDir = await createProject();
    const logDir = path.join(projectDir, "logs");

    await mkdir(logDir, { recursive: true });
    await writeFile(
      path.join(logDir, "log.ndjson"),
      [
        JSON.stringify({
          level: 30,
          time: 1774818753547,
          pid: 153934,
          hostname: "pop-os",
          caller: "src/index.ts:8",
          msg: "Elysia running at localhost:3006",
        }),
        JSON.stringify({
          level: 30,
          time: 1774818761044,
          pid: 153934,
          hostname: "pop-os",
          msg: "GET → 200 /test/logs/info 7ms",
        }),
      ].join("\n") + "\n",
    );

    const logs = await getStudioLogs({
      projectPath: projectDir,
      limit: 50,
    });

    expect(logs.records[0]?.message).toBe("GET → 200 /test/logs/info 7ms");
    expect(logs.records[0]?.timestamp).toBe("2026-03-28T16:19:21.044Z");
    expect(logs.records[0]?.http?.method).toBe("GET");
    expect(logs.records[0]?.http?.durationMs).toBe(7);

    const overview = await getStudioOverview({ projectPath: projectDir });
    expect(overview.stats.avgResponseTime.value).toBe(7);
    expect(overview.stats.avgResponseTime.helperText).not.toContain("No HTTP timing data");
  });

  it("returns stable empty overview payloads when no events match", async () => {
    const projectDir = await createProject();
    await mkdir(path.join(projectDir, "logs"), { recursive: true });
    await writeFile(path.join(projectDir, "logs", "log.ndjson"), "");

    const overview = await getStudioOverview({ projectPath: projectDir, search: "missing" });

    expect(overview.stats.totalEvents.value).toBe(0);
    expect(overview.liveFeed).toEqual([]);
    expect(overview.sections).toEqual([]);
    expect(overview.recentErrors).toEqual([]);
  });

  it("treats invalid timestamps as oldest records in overview ordering", async () => {
    const projectDir = await createProject();
    const logDir = path.join(projectDir, "logs");

    await mkdir(logDir, { recursive: true });
    await writeFile(
      path.join(logDir, "log.ndjson"),
      [
        JSON.stringify({
          timestamp: "not-a-date",
          level: "info",
          message: "invalid timestamp event",
          traceId: "trace-invalid",
        }),
        JSON.stringify({
          timestamp: "2026-03-13T12:00:00.000Z",
          level: "info",
          message: "newest valid event",
          traceId: "trace-valid",
        }),
      ].join("\n") + "\n",
    );

    const overview = await getStudioOverview({ projectPath: projectDir });

    expect(overview.liveFeed[0]?.message).toBe("newest valid event");
    expect(overview.liveFeed[1]?.message).toBe("invalid timestamp event");
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

  it("builds grouped errors, detail views, and raw error entries", async () => {
    const projectDir = await createProject();
    const logDir = path.join(projectDir, "logs");

    await mkdir(logDir, { recursive: true });
    await writeFile(
      path.join(logDir, "log.ndjson"),
      [
        createLogLine({
          timestamp: "2026-03-13T10:00:00.000Z",
          level: "error",
          message: "Database request failed",
          error: { name: "DatabaseError", message: "Database request failed" },
          stack: [
            "DatabaseError: Database request failed",
            `    at saveOrder (${path.join(projectDir, "src/server/orders.ts")}:42:9)`,
          ].join("\n"),
          traceId: "trace-1",
          groupId: "trace-1",
          method: "POST",
          path: "/checkout",
          statusCode: 500,
        }),
        createLogLine({
          timestamp: "2026-03-13T10:02:00.000Z",
          level: "error",
          message: "Database request failed",
          error: { name: "DatabaseError", message: "Database request failed" },
          stack: [
            "DatabaseError: Database request failed",
            `    at saveOrder (${path.join(projectDir, "src/server/orders.ts")}:42:9)`,
          ].join("\n"),
          traceId: "trace-1",
          groupId: "trace-1",
          method: "POST",
          path: "/checkout",
          statusCode: 500,
        }),
        createLogLine({
          timestamp: "2026-03-13T10:03:00.000Z",
          level: "error",
          message: "Payment provider timeout",
          error: { name: "PaymentError", message: "Payment provider timeout" },
          stack: [
            "PaymentError: Payment provider timeout",
            `    at chargeCard (${path.join(projectDir, "src/server/payments.ts")}:18:3)`,
          ].join("\n"),
          method: "POST",
          path: "/payment/charge",
          statusCode: 502,
        }),
      ].join(""),
    );

    const grouped = await getStudioErrors({
      projectPath: projectDir,
      view: "grouped",
      sort: "most-frequent",
      limit: 50,
    });

    expect(grouped.stats.uniqueErrorTypes).toBe(2);
    expect(grouped.stats.totalOccurrences).toBe(3);
    expect(grouped.groups[0]).toMatchObject({
      errorType: "DatabaseError",
      occurrenceCount: 2,
      messageFirstLine: "Database request failed",
    });
    expect(grouped.groups[0]?.sparklineBuckets).toHaveLength(12);
    expect(grouped.groups[0]?.relatedTraceGroupId).toBeTruthy();

    const detail = await getStudioErrorGroup({
      projectPath: projectDir,
      fingerprint: grouped.groups[0]!.fingerprint,
    });

    expect(detail?.occurrences).toHaveLength(2);
    expect(detail?.occurrences[0]?.structuredFields).toMatchObject({
      error: { name: "DatabaseError" },
    });

    const raw = await getStudioErrors({
      projectPath: projectDir,
      view: "raw",
      sort: "most-recent",
      limit: 50,
    });

    expect(raw.entries[0]).toMatchObject({
      kind: "occurrence",
      type: "PaymentError",
    });
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
    expect(meta.sections).toEqual([]);
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

  it("detects auth sections and builds auth overviews", async () => {
    const projectDir = await createProject();
    const logDir = path.join(projectDir, "logs");

    await mkdir(logDir, { recursive: true });
    await writeFile(
      path.join(logDir, "log.ndjson"),
      [
        createLogLine({
          timestamp: "2026-03-13T10:00:00.000Z",
          level: "info",
          message: "login succeeded",
          type: "auth_login",
          path: "/auth/login",
          method: "POST",
          statusCode: 200,
          duration: 42,
          auth: { method: "password" },
          user: { id: "user-1", email: "user-1@example.com" },
          session: { id: "session-user-1-primary" },
          ip: "10.0.0.1",
        }),
        createLogLine({
          timestamp: "2026-03-13T10:00:30.000Z",
          level: "warn",
          message: "login failed",
          type: "auth_login",
          path: "/auth/login",
          method: "POST",
          statusCode: 401,
          user: { id: "user-2", email: "***masked@example.com" },
          session: { id: "session-user-2" },
          ip: "10.0.0.2",
          token: { accessToken: "secret-token-value" },
        }),
        createLogLine({
          timestamp: "2026-03-13T10:02:00.000Z",
          level: "warn",
          message: "login failed",
          type: "auth_login",
          path: "/auth/login",
          statusCode: 401,
          user: { id: "user-2" },
          ip: "10.0.0.2",
        }),
        createLogLine({
          timestamp: "2026-03-13T10:03:00.000Z",
          level: "warn",
          message: "authentication failed",
          type: "auth_login",
          path: "/auth/login",
          statusCode: 401,
          user: { id: "user-2" },
          ip: "10.0.0.2",
        }),
        createLogLine({
          timestamp: "2026-03-13T10:05:00.000Z",
          level: "info",
          message: "session refreshed",
          type: "auth_session",
          path: "/session/refresh",
          session: { id: "session-user-1-primary" },
          user: { id: "user-1" },
          ip: "10.0.0.1",
        }),
        createLogLine({
          timestamp: "2026-03-13T10:06:00.000Z",
          level: "info",
          message: "session expired",
          type: "auth_session",
          path: "/session/expire",
          session: { id: "session-user-2" },
          user: { id: "user-2" },
          ip: "10.0.0.2",
        }),
        ...Array.from({ length: 5 }, (_, index) =>
          createLogLine({
            timestamp: `2026-03-13T10:1${index}:00.000Z`,
            level: "error",
            message: "invalid token",
            type: "auth_token",
            path: "/token/validate",
            statusCode: 401,
            user: { id: "user-3" },
            token: { refreshToken: `refresh-${index}` },
          }),
        ),
        createLogLine({
          timestamp: "2026-03-13T10:20:00.000Z",
          level: "info",
          message: "session created",
          type: "auth_session",
          path: "/session/create",
          user: { id: "user-1" },
          session: { id: "session-user-1-secondary" },
          ip: "10.0.0.3",
        }),
        createLogLine({
          timestamp: "2026-03-13T10:21:00.000Z",
          level: "error",
          message: "forbidden",
          type: "auth_permission",
          path: "/auth/admin",
          statusCode: 403,
          user: { id: "user-1" },
          permission: "admin:write",
          ip: "10.0.0.1",
        }),
        createLogLine({
          timestamp: "2026-03-13T10:22:00.000Z",
          level: "info",
          message: "oauth callback success",
          type: "oauth_callback",
          path: "/oauth/github/callback",
          provider: "github",
          scope: "repo,user",
          statusCode: 200,
          user: { id: "user-4" },
        }),
      ].join(""),
    );

    const meta = await getStudioMeta(projectDir);
    const auth = await getStudioAuth({ projectPath: projectDir, limit: 50 });

    expect(meta.sections.map((section) => section.id)).toContain("auth");
    expect(meta.sections.map((section) => section.id)).toContain("errors");
    expect(meta.sections.find((section) => section.id === "auth")).toMatchObject({
      label: "Auth",
      icon: "🔐",
      count: 14,
    });
    expect(auth.stats).toMatchObject({
      loginAttemptsTotal: 4,
      loginSuccessCount: 1,
      loginFailureCount: 3,
      activeSessionCount: 5,
      authErrorCount: 9,
      suspiciousActivityCount: 3,
    });
    expect(auth.timeline.some((event) => event.kind === "login" && event.outcome === "success")).toBe(true);
    expect(auth.timeline.some((event) => event.kind === "session" && event.action === "expired")).toBe(true);
    expect(auth.timeline.some((event) => event.kind === "token" && event.action === "rejected")).toBe(true);
    expect(auth.timeline.some((event) => event.kind === "permission" && event.requiredPermission === "admin:write")).toBe(true);
    expect(auth.timeline.some((event) => event.kind === "oauth" && event.provider === "github")).toBe(true);
    expect(auth.suspiciousPatterns.map((pattern) => pattern.kind).sort()).toEqual([
      "brute-force",
      "concurrent-sessions",
      "invalid-token-spike",
    ]);
    expect(auth.users.find((user) => user.userId === "user-1")).toMatchObject({
      loginCount: 1,
      errorCount: 1,
    });
    expect([
      "***masked@example.com",
      null,
    ]).toContain(auth.timeline.find((event) => event.userId === "user-2")?.userEmail ?? null);
    expect(auth.timeline.some((event) => event.summary.includes("secret-token-value"))).toBe(false);
    expect(auth.timeline.some((event) => event.summary.includes("refresh-0"))).toBe(false);

    const filtered = await getStudioAuth({
      projectPath: projectDir,
      userId: "user-1",
      limit: 50,
    });

    expect(filtered.timeline.every((event) => event.userId === "user-1")).toBe(true);
    expect(filtered.users).toEqual([
      expect.objectContaining({ userId: "user-1" }),
    ]);
  });

  it("does not surface auth section for unrelated 401 records", async () => {
    const projectDir = await createProject();
    const logDir = path.join(projectDir, "logs");

    await mkdir(logDir, { recursive: true });
    await writeFile(
      path.join(logDir, "log.ndjson"),
      createLogLine({
        timestamp: "2026-03-13T11:00:00.000Z",
        level: "error",
        message: "upstream failed",
        type: "http_request",
        path: "/api/data",
        statusCode: 401,
      }),
    );

    const meta = await getStudioMeta(projectDir);
    expect(meta.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "errors", count: 1 }),
      ]),
    );
  });

  it("ignores invalid timestamps when computing section timestamps", async () => {
    const projectDir = await createProject();
    const logDir = path.join(projectDir, "logs");

    await mkdir(logDir, { recursive: true });
    await writeFile(
      path.join(logDir, "log.ndjson"),
      [
        createLogLine({
          timestamp: "not-a-date",
          level: "error",
          message: "request crashed",
          type: "http_request",
          path: "/api/data",
          statusCode: 500,
        }),
        createLogLine({
          timestamp: "2026-03-13T11:10:00.000Z",
          level: "error",
          message: "request crashed again",
          type: "http_request",
          path: "/api/data",
          statusCode: 500,
        }),
      ].join(""),
    );

    const meta = await getStudioMeta(projectDir);
    const errors = meta.sections.find((section) => section.id === "errors");

    expect(errors?.lastMatchedAt).toBe("2026-03-13T11:10:00.000Z");
    expect(errors?.lastErrorAt).toBe("2026-03-13T11:10:00.000Z");
  });

  it("does not classify bare 401 records as auth without corroborating signals", async () => {
    const projectDir = await createProject();
    const logDir = path.join(projectDir, "logs");

    await mkdir(logDir, { recursive: true });
    await writeFile(
      path.join(logDir, "log.ndjson"),
      createLogLine({
        timestamp: "2026-03-13T11:05:00.000Z",
        level: "warn",
        message: "upstream returned 401",
        type: "http_request",
        path: "/api/data",
        statusCode: 401,
      }),
    );

    const auth = await getStudioAuth({ projectPath: projectDir, limit: 10 });
    expect(auth.totalTimelineEvents).toBe(0);
  });

  it("scopes suspicious activity counts to the selected user", async () => {
    const projectDir = await createProject();
    const logDir = path.join(projectDir, "logs");

    await mkdir(logDir, { recursive: true });
    await writeFile(
      path.join(logDir, "log.ndjson"),
      [
        createLogLine({
          timestamp: "2026-03-13T10:00:00.000Z",
          level: "warn",
          message: "login failed",
          type: "auth_login",
          path: "/auth/login",
          statusCode: 401,
          user: { id: "user-a" },
          ip: "10.0.0.9",
        }),
        createLogLine({
          timestamp: "2026-03-13T10:02:00.000Z",
          level: "warn",
          message: "login failed",
          type: "auth_login",
          path: "/auth/login",
          statusCode: 401,
          user: { id: "user-a" },
          ip: "10.0.0.9",
        }),
        createLogLine({
          timestamp: "2026-03-13T10:03:00.000Z",
          level: "warn",
          message: "login failed",
          type: "auth_login",
          path: "/auth/login",
          statusCode: 401,
          user: { id: "user-a" },
          ip: "10.0.0.9",
        }),
        createLogLine({
          timestamp: "2026-03-13T10:04:00.000Z",
          level: "info",
          message: "login succeeded",
          type: "auth_login",
          path: "/auth/login",
          statusCode: 200,
          user: { id: "user-b" },
          ip: "10.0.0.10",
        }),
      ].join(""),
    );

    const auth = await getStudioAuth({
      projectPath: projectDir,
      userId: "user-b",
      limit: 10,
    });

    expect(auth.stats.suspiciousActivityCount).toBe(0);
    expect(auth.suspiciousPatterns).toEqual([]);
    expect(auth.timeline.every((event) => event.userId === "user-b")).toBe(true);
  });

  it("detects background jobs, groups runs, and computes aggregates", async () => {
    const projectDir = await createProject();
    const logDir = path.join(projectDir, "logs");

    await mkdir(logDir, { recursive: true });
    await writeFile(
      path.join(logDir, "log.ndjson"),
      [
        createLogLine({
          timestamp: "2026-03-13T13:00:00.000Z",
          level: "info",
          message: "nightly sync job started",
          job: { name: "Nightly Sync", runId: "run-1", step: "fetch", status: "started" },
        }),
        createLogLine({
          timestamp: "2026-03-13T13:00:10.000Z",
          level: "info",
          message: "nightly sync job completed",
          job: {
            name: "Nightly Sync",
            runId: "run-1",
            status: "completed",
            durationMs: 10_000,
          },
          records_processed: 42,
        }),
        createLogLine({
          timestamp: "2026-03-13T13:10:00.000Z",
          level: "info",
          message: "Nightly Sync job started",
          job: { name: "Nightly Sync", runId: "run-2", step: "fetch", status: "running" },
        }),
        createLogLine({
          timestamp: "2026-03-13T13:10:20.000Z",
          level: "error",
          message: "Nightly Sync job failed",
          job: {
            name: "Nightly Sync",
            runId: "run-2",
            step: "store",
            status: "failed",
          },
          error: {
            message: "database unavailable",
            stack: "Error: database unavailable\n at storeRecords",
          },
        }),
        createLogLine({
          timestamp: "2026-03-13T13:30:00.000Z",
          level: "info",
          message: "email digest job started",
          task: { name: "Email Digest", step: "prepare", status: "started" },
        }),
        createLogLine({
          timestamp: "2026-03-13T13:30:45.000Z",
          level: "info",
          message: "email digest job completed successfully",
          task: { name: "Email Digest", status: "completed" },
          emails_sent: 12,
          durationMs: 45_000,
        }),
        createLogLine({
          timestamp: "2026-03-13T13:40:00.000Z",
          level: "info",
          message: "email digest job started",
          task: { name: "Email Digest", step: "prepare", status: "started" },
        }),
        createLogLine({
          timestamp: "2026-03-13T13:40:50.000Z",
          level: "info",
          message: "email digest job completed successfully",
          task: { name: "Email Digest", status: "completed" },
          emails_sent: 15,
          durationMs: 50_000,
        }),
        createLogLine({
          timestamp: "2026-03-13T13:50:00.000Z",
          level: "info",
          message: "email digest job started",
          task: { name: "Email Digest", step: "prepare", status: "started" },
        }),
        createLogLine({
          timestamp: "2026-03-13T13:51:00.000Z",
          level: "info",
          message: "email digest job completed successfully",
          task: { name: "Email Digest", status: "completed" },
          emails_sent: 18,
          durationMs: 60_000,
        }),
      ].join(""),
    );

    const meta = await getStudioMeta(projectDir);
    const background = await getStudioBackgroundJobs({ projectPath: projectDir, limit: 20 });
    const failedRun = background.runs.find((run) => run.runId === "run-2");
    const failedDetail = await getStudioBackgroundJobRun({
      projectPath: projectDir,
      runId: failedRun?.id ?? "",
    });

    expect(meta.sections.find((section) => section.id === "background")).toMatchObject({
      label: "Background Jobs",
      count: 10,
    });
    expect(background.stats).toMatchObject({
      jobsDetected: 2,
      totalRuns: 5,
      failedRuns: 1,
      mostCommonFailureReason: "database unavailable",
    });
    expect(background.runs.filter((run) => run.jobName === "Email Digest")).toHaveLength(3);
    expect(background.performance.find((row) => row.jobName === "Email Digest")).toMatchObject({
      totalRuns: 3,
      trend: "slower",
    });
    expect(failedDetail?.run.failure).toMatchObject({
      message: "database unavailable",
      step: "store",
    });
    expect(failedDetail?.timeline).toHaveLength(2);
  });

  it("includes selected background runs in assistant evidence", async () => {
    const projectDir = await createProject();
    const logDir = path.join(projectDir, "logs");

    await mkdir(logDir, { recursive: true });
    await writeFile(
      path.join(logDir, "log.ndjson"),
      [
        createLogLine({
          timestamp: "2026-03-13T14:00:00.000Z",
          level: "info",
          message: "queue rebuild job started",
          queue: { name: "Queue Rebuild", runId: "rebuild-1", status: "started" },
        }),
        createLogLine({
          timestamp: "2026-03-13T14:00:15.000Z",
          level: "error",
          message: "queue rebuild job failed",
          queue: { name: "Queue Rebuild", runId: "rebuild-1", step: "publish", status: "failed" },
          error: { message: "publish rejected" },
        }),
      ].join(""),
    );

    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.OPENROUTER_MODEL = "openai/gpt-5.4";
    __setGenerateTextForTests(async () => ({ text: "Use the failed run timeline." }));

    const overview = await getStudioBackgroundJobs({ projectPath: projectDir, limit: 10 });
    const description = await describeStudioSelection({
      projectPath: projectDir,
      history: [],
      filters: {},
      selectedBackgroundRunId: overview.runs[0]?.id,
    });

    expect(description.references).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "background-run",
          label: "Queue Rebuild",
        }),
      ]),
    );
  });

  it("detects agent tasks and builds llm/tool breakdowns", async () => {
    const projectDir = await createProject();
    const logDir = path.join(projectDir, "logs");

    await mkdir(logDir, { recursive: true });
    await writeFile(
      path.join(logDir, "log.ndjson"),
      [
        createLogLine({
          timestamp: "2026-03-13T15:00:00.000Z",
          level: "info",
          message: "agent task started",
          agent: { task_id: "task-a", taskName: "Summarise user feedback", status: "started" },
          input: "Summarise Q3 feedback",
        }),
        createLogLine({
          timestamp: "2026-03-13T15:00:00.012Z",
          level: "info",
          message: "tool call",
          agent: { task_id: "task-a" },
          tool: { name: "retrieve_documents", durationMs: 12, success: true },
          retrieval: { count: 12 },
        }),
        createLogLine({
          timestamp: "2026-03-13T15:00:00.340Z",
          level: "info",
          message: "completion",
          agent: { task_id: "task-a" },
          llm: { model: "anthropic/claude-3.5-sonnet", durationMs: 312 },
          tokens: { prompt: 1200, completion: 642, total: 1842 },
        }),
        createLogLine({
          timestamp: "2026-03-13T15:00:04.200Z",
          level: "info",
          message: "agent task completed",
          agent: { task_id: "task-a", status: "completed", output_length: 847 },
        }),
        createLogLine({
          timestamp: "2026-03-13T15:01:00.000Z",
          level: "error",
          message: "tool call failed",
          traceId: "trace-failed",
          tool: { name: "search_database", durationMs: 800, status: "failed" },
          error: { message: "database unavailable" },
        }),
      ].join(""),
    );

    const meta = await getStudioMeta(projectDir);
    const agents = await getStudioAgents({ projectPath: projectDir, limit: 10 });
    const failedTask = agents.tasks.find((task) => task.status === "FAILED");
    const failedDetail = await getStudioAgentTask({
      projectPath: projectDir,
      taskId: failedTask?.id ?? "",
    });

    expect(meta.sections.find((section) => section.id === "agents")).toBeTruthy();
    expect(agents.stats).toMatchObject({
      agentTasks: 2,
      llmCalls: 1,
      toolCalls: 2,
      failedTasks: 1,
      totalTokens: 1842,
    });
    expect(agents.llmCalls[0]).toMatchObject({
      model: "anthropic/claude-3.5-sonnet",
      totalTokens: 1842,
      durationMs: 312,
    });
    expect(agents.toolCalls.find((call) => call.name === "search_database")).toMatchObject({
      outcome: "failure",
      errorMessage: "database unavailable",
    });
    expect(failedDetail?.failure).toMatchObject({
      errorKind: "tool",
      errorMessage: "database unavailable",
    });
  });

  it("includes selected agent tasks in assistant evidence", async () => {
    const projectDir = await createProject();
    const logDir = path.join(projectDir, "logs");

    await mkdir(logDir, { recursive: true });
    await writeFile(
      path.join(logDir, "log.ndjson"),
      [
        createLogLine({
          timestamp: "2026-03-13T16:00:00.000Z",
          level: "info",
          message: "agent task started",
          agent: { task_id: "task-assistant", taskName: "Classify ticket", status: "started" },
        }),
        createLogLine({
          timestamp: "2026-03-13T16:00:00.300Z",
          level: "error",
          message: "completion failed",
          agent: { task_id: "task-assistant" },
          llm: { model: "openai/gpt-4o-mini", status: "failed" },
          error: { message: "prompt blocked" },
        }),
      ].join(""),
    );

    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.OPENROUTER_MODEL = "openai/gpt-5.4";
    __setGenerateTextForTests(async () => ({ text: "Use the failed task timeline." }));

    const overview = await getStudioAgents({ projectPath: projectDir, limit: 10 });
    const description = await describeStudioSelection({
      projectPath: projectDir,
      history: [],
      filters: {},
      selectedAgentTaskId: overview.tasks[0]?.id,
    });

    expect(description.references).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "agent-task",
          label: "Classify ticket",
        }),
      ]),
    );
  });

  it("persists custom sections to blyp config and detects them", async () => {
    const projectDir = await createProject();
    const logDir = path.join(projectDir, "logs");

    await mkdir(logDir, { recursive: true });
    await writeFile(
      path.join(projectDir, "blyp.config.json"),
      JSON.stringify({ file: { dir: "./logs" } }, null, 2),
    );
    await writeFile(
      path.join(logDir, "log.ndjson"),
      createLogLine({
        timestamp: "2026-03-13T12:00:00.000Z",
        level: "info",
        message: "kyc started",
        path: "/kyc/verify",
        kyc: { applicantId: "app-1" },
      }),
    );

    const result = await addStudioCustomSection({
      projectPath: projectDir,
      name: "KYC",
      icon: "🪪",
      match: {
        fields: ["kyc.*"],
        routes: ["/kyc/*"],
        messages: ["kyc"],
      },
    });

    expect(result.sections.find((section) => section.id === "custom:kyc")).toMatchObject({
      label: "KYC",
      icon: "🪪",
      count: 1,
      kind: "custom",
    });

    const config = await getStudioConfig(projectDir);
    expect(config.resolved.studio.sections).toEqual([
      {
        id: "custom:kyc",
        name: "KYC",
        icon: "🪪",
        match: {
          fields: ["kyc.*"],
          routes: ["/kyc/*"],
          messages: ["kyc"],
        },
      },
    ]);
  });

  it("replaces existing custom sections in ts config without duplication or bracket corruption", async () => {
    const projectDir = await createProject();
    const logDir = path.join(projectDir, "logs");
    const configPath = path.join(projectDir, "blyp.config.ts");

    await mkdir(logDir, { recursive: true });
    await writeFile(
      configPath,
      [
        "export default {",
        "  studio: {",
        "    sections: [",
        "      {",
        "        name: 'KYC',",
        "        icon: '🪪',",
        "        match: {",
        "          fields: ['kyc.old'],",
        "          routes: ['/kyc/old'],",
        "          messages: ['legacy'],",
        "        },",
        "      },",
        "    ],",
        "  },",
        "};",
      ].join("\n"),
    );

    await addStudioCustomSection({
      projectPath: projectDir,
      name: "KYC",
      icon: "🪪",
      match: {
        fields: ["kyc.*"],
        routes: ["/kyc/*"],
        messages: ["kyc"],
      },
    });

    const written = await readFile(configPath, "utf8");
    expect(written.match(/name:\s*['"]KYC['"]/g)?.length ?? 0).toBe(1);
    expect(written).toContain("fields: [\"kyc.*\"]");
    expect(written).toContain("routes: [\"/kyc/*\"]");
    expect(written).toContain("messages: [\"kyc\"]");
  });

  it("rewrites studio.sections instead of an unrelated earlier sections array", async () => {
    const projectDir = await createProject();
    const logDir = path.join(projectDir, "logs");
    const configPath = path.join(projectDir, "blyp.config.ts");

    await mkdir(logDir, { recursive: true });
    await writeFile(
      configPath,
      [
        "export default {",
        "  docs: {",
        "    sections: ['intro', 'advanced'],",
        "  },",
        "  studio: {",
        "    sections: [",
        "      {",
        "        name: 'KYC',",
        "        icon: '🪪',",
        "        match: {",
        "          fields: ['kyc.old'],",
        "          routes: ['/kyc/old'],",
        "          messages: ['legacy'],",
        "        },",
        "      },",
        "    ],",
        "  },",
        "};",
      ].join("\n"),
    );

    await addStudioCustomSection({
      projectPath: projectDir,
      name: "KYC",
      icon: "🪪",
      match: {
        fields: ["kyc.*"],
        routes: ["/kyc/*"],
        messages: ["kyc"],
      },
    });

    const written = await readFile(configPath, "utf8");
    expect(written).toContain("sections: ['intro', 'advanced']");
    expect(written.match(/name:\s*['\"]KYC['\"]/g)?.length ?? 0).toBe(1);
    expect(written).toContain("fields: [\"kyc.*\"]");
    expect(written).toContain("routes: [\"/kyc/*\"]");
    expect(written).toContain("messages: [\"kyc\"]");
  });

  it("adds studio.sections when studio exists and only another object has sections", async () => {
    const projectDir = await createProject();
    const logDir = path.join(projectDir, "logs");
    const configPath = path.join(projectDir, "blyp.config.ts");

    await mkdir(logDir, { recursive: true });
    await writeFile(
      configPath,
      [
        "export default {",
        "  docs: {",
        "    sections: ['intro', 'advanced'],",
        "  },",
        "  studio: {",
        "    theme: 'dark',",
        "  },",
        "};",
      ].join("\n"),
    );

    await addStudioCustomSection({
      projectPath: projectDir,
      name: "KYC",
      icon: "🪪",
      match: {
        fields: ["kyc.*"],
        routes: ["/kyc/*"],
        messages: ["kyc"],
      },
    });

    const written = await readFile(configPath, "utf8");
    expect(written).toContain("sections: ['intro', 'advanced']");
    expect(written).toContain("theme: 'dark'");
    expect(written).toContain("studio: {\n    sections:");
    expect(written).toContain("fields: [\"kyc.*\"]");
    expect(written).toContain("routes: [\"/kyc/*\"]");
    expect(written).toContain("messages: [\"kyc\"]");
  });

  it("returns an empty auth overview for invalid projects", async () => {
    const missingProject = path.join(process.cwd(), "missing-project-for-auth");

    const auth = await getStudioAuth({
      projectPath: missingProject,
      limit: 10,
    });

    expect(auth).toEqual({
      stats: {
        loginAttemptsTotal: 0,
        loginSuccessCount: 0,
        loginFailureCount: 0,
        activeSessionCount: 0,
        authErrorCount: 0,
        suspiciousActivityCount: 0,
      },
      timeline: [],
      totalTimelineEvents: 0,
      suspiciousPatterns: [],
      users: [],
    });
  });

  it("counts session ids first and only falls back to user ids when session ids are missing", async () => {
    const projectDir = await createProject();
    const logDir = path.join(projectDir, "logs");

    await mkdir(logDir, { recursive: true });
    await writeFile(
      path.join(logDir, "log.ndjson"),
      [
        createLogLine({
          timestamp: "2026-03-13T13:00:00.000Z",
          level: "info",
          message: "session created",
          type: "auth_session",
          path: "/session/create",
          user: { id: "user-1" },
          session: { id: "session-1" },
        }),
        createLogLine({
          timestamp: "2026-03-13T13:01:00.000Z",
          level: "info",
          message: "login success",
          type: "auth_login",
          path: "/auth/login",
          statusCode: 200,
          user: { id: "user-2" },
        }),
      ].join(""),
    );

    const auth = await getStudioAuth({ projectPath: projectDir, limit: 10 });
    expect(auth.stats.activeSessionCount).toBe(2);
  });

  it("honors auth.userId when classifying auth records", async () => {
    const projectDir = await createProject();
    const logDir = path.join(projectDir, "logs");

    await mkdir(logDir, { recursive: true });
    await writeFile(
      path.join(logDir, "log.ndjson"),
      createLogLine({
        timestamp: "2026-03-13T14:00:00.000Z",
        level: "info",
        message: "login success",
        type: "auth_login",
        path: "/auth/login",
        statusCode: 200,
        auth: { userId: "auth-user-1" },
      }),
    );

    const auth = await getStudioAuth({ projectPath: projectDir, limit: 10 });
    expect(auth.timeline[0]?.userId).toBe("auth-user-1");
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

  it("reports CLAUDE.md presence in assistant status", async () => {
    const projectDir = await createProject();
    await writeFile(path.join(projectDir, "CLAUDE.md"), "# Context\n\nProject details.\n");

    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.OPENROUTER_MODEL = "openai/gpt-5.4";

    const status = await getStudioAssistantStatus(projectDir);

    expect(status.enabled).toBe(true);
    expect(status.projectContext.claudeMdPresent).toBe(true);
    expect(status.projectContext.claudeMdPath).toBe(path.join(projectDir, "CLAUDE.md"));
  });

  it("includes CLAUDE.md context in assistant prompts when present", async () => {
    const projectDir = await createProject();
    const logDir = path.join(projectDir, "logs");

    await mkdir(logDir, { recursive: true });
    await writeFile(
      path.join(projectDir, "CLAUDE.md"),
      [
        "# Project Context for Blyp Debugger",
        "",
        "<!-- blyp:claude-md:start -->",
        "## What this project does",
        "Checkout service.",
        "<!-- blyp:claude-md:end -->",
      ].join("\n"),
    );
    await writeFile(path.join(logDir, "log.ndjson"), createLogLine({ message: "payment failed" }));

    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.OPENROUTER_MODEL = "openai/gpt-5.4";

    let capturedPrompt = "";
    __setGenerateTextForTests(async ({ prompt }) => {
      capturedPrompt = prompt;
      return { text: "ok" };
    });

    await replyWithStudioAssistant({
      projectPath: projectDir,
      history: [{ role: "user", content: "What happened?" }],
      filters: {},
    });

    expect(capturedPrompt).toContain("Project context from CLAUDE.md:");
    expect(capturedPrompt).toContain("## What this project does");
    expect(capturedPrompt).toContain("Checkout service.");
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
        studio: { sections: [] },
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

  it("builds a database overview with stats, slow queries, transactions, and migrations", async () => {
    const projectDir = await createProject();
    const logDir = path.join(projectDir, "logs");

    await mkdir(logDir, { recursive: true });
    await writeFile(
      path.join(logDir, "log.ndjson"),
      [
        createLogLine({
          timestamp: "2026-03-13T10:00:00.000Z",
          level: "info",
          message: "transaction start",
          type: "db_transaction_start",
          transaction: { id: "tx-1", event: "start" },
          requestId: "req-1",
          traceId: "trace-1",
        }),
        createLogLine({
          timestamp: "2026-03-13T10:00:00.050Z",
          level: "info",
          message: "query executed",
          type: "prisma_query",
          query: {
            operation: "select",
            model: "User",
            durationMs: 45,
            sql: "SELECT * FROM users WHERE id = $1",
            params: { id: "user-1", accessToken: "secret-token" },
            transactionId: "tx-1",
          },
          requestId: "req-1",
          traceId: "trace-1",
        }),
        createLogLine({
          timestamp: "2026-03-13T10:00:00.250Z",
          level: "info",
          message: "slow query detected",
          type: "prisma_query",
          query: {
            operation: "update",
            model: "Order",
            durationMs: 250,
            sql: "UPDATE orders SET status = $1 WHERE id = $2",
            params: { status: "paid", id: "ord-1" },
            transactionId: "tx-1",
          },
          requestId: "req-1",
        }),
        createLogLine({
          timestamp: "2026-03-13T10:00:00.300Z",
          level: "error",
          message: "query failed",
          type: "drizzle_query",
          db: {
            operation: "insert",
            table: "audit_logs",
            durationMs: 15,
            params: { password: "plain-text", actorId: "user-1" },
          },
          error: { message: "duplicate key" },
        }),
        createLogLine({
          timestamp: "2026-03-13T10:00:00.500Z",
          level: "info",
          message: "transaction commit",
          type: "db_transaction_commit",
          transaction: { id: "tx-1", event: "commit" },
        }),
        createLogLine({
          timestamp: "2026-03-13T10:01:00.000Z",
          level: "info",
          message: "transaction start",
          type: "db_transaction_start",
          transaction: { id: "tx-open", event: "start" },
        }),
        createLogLine({
          timestamp: "2026-03-13T10:02:00.000Z",
          level: "info",
          message: "migration complete",
          type: "prisma_migration",
          migration: { name: "add_users", version: "20260313_add_users", durationMs: 920 },
        }),
      ].join(""),
    );

    const database = await getStudioDatabase({
      projectPath: projectDir,
      limit: 10,
    });

    expect(database.stats).toMatchObject({
      totalQueries: 3,
      slowQueries: 1,
      failedQueries: 1,
      activeTransactions: 1,
    });
    expect(database.stats.avgQueryTimeMs).toBeCloseTo((45 + 250 + 15) / 3, 5);
    expect(database.queries[0]?.operation).toBe("INSERT");
    expect(database.slowQueries[0]).toMatchObject({
      operation: "UPDATE",
      modelOrTable: "Order",
      durationMs: 250,
    });
    expect(database.queries.find((item) => item.operation === "SELECT")?.params).toMatchObject({
      id: "user-1",
      accessToken: "[redacted]",
    });
    expect(database.queries.find((item) => item.operation === "INSERT")?.params).toMatchObject({
      password: "[redacted]",
      actorId: "user-1",
    });
    expect(database.transactions[0]).toMatchObject({
      id: "tx-open",
      result: "open",
    });
    expect(database.transactions.find((item) => item.id === "tx-1")).toMatchObject({
      result: "committed",
    });
    expect(database.migrationEvents[0]).toMatchObject({
      name: "add_users",
      version: "20260313_add_users",
      success: true,
      durationMs: 920,
    });
  });

  it("filters database overview results by search text", async () => {
    const projectDir = await createProject();
    const logDir = path.join(projectDir, "logs");

    await mkdir(logDir, { recursive: true });
    await writeFile(
      path.join(logDir, "log.ndjson"),
      [
        createLogLine({
          timestamp: "2026-03-13T10:00:00.000Z",
          level: "info",
          message: "query executed",
          type: "prisma_query",
          query: { operation: "select", model: "User", durationMs: 20, sql: "SELECT * FROM users" },
        }),
        createLogLine({
          timestamp: "2026-03-13T10:00:01.000Z",
          level: "info",
          message: "query executed",
          type: "prisma_query",
          query: { operation: "select", model: "Order", durationMs: 30, sql: "SELECT * FROM orders" },
        }),
      ].join(""),
    );

    const database = await getStudioDatabase({
      projectPath: projectDir,
      search: "orders",
    });

    expect(database.totalQueries).toBe(1);
    expect(database.queries[0]?.modelOrTable).toBe("Order");
  });

  it("keeps valid transaction timestamps when later records contain invalid timestamps", async () => {
    const projectDir = await createProject();
    const logDir = path.join(projectDir, "logs");

    await mkdir(logDir, { recursive: true });
    await writeFile(
      path.join(logDir, "log.ndjson"),
      [
        createLogLine({
          timestamp: "2026-03-13T10:00:00.000Z",
          level: "info",
          message: "transaction start",
          type: "db_transaction_start",
          transaction: { id: "tx-bad", event: "start" },
        }),
        createLogLine({
          timestamp: "not-a-start-timestamp",
          level: "info",
          message: "transaction start",
          type: "db_transaction_start",
          transaction: { id: "tx-bad", event: "start" },
        }),
        createLogLine({
          timestamp: "2026-03-13T10:00:00.200Z",
          level: "info",
          message: "query executed",
          type: "prisma_query",
          query: {
            operation: "select",
            model: "User",
            durationMs: 20,
            transactionId: "tx-bad",
            sql: "SELECT * FROM users",
          },
        }),
        createLogLine({
          timestamp: "2026-03-13T10:00:00.400Z",
          level: "info",
          message: "transaction commit",
          type: "db_transaction_commit",
          transaction: { id: "tx-bad", event: "commit" },
        }),
        createLogLine({
          timestamp: "not-a-timestamp",
          level: "info",
          message: "transaction commit",
          type: "db_transaction_commit",
          transaction: { id: "tx-bad", event: "commit" },
        }),
      ].join(""),
    );

    const database = await getStudioDatabase({
      projectPath: projectDir,
      limit: 10,
    });

    expect(database.transactions).toHaveLength(1);
    expect(database.transactions[0]).toMatchObject({
      id: "tx-bad",
      timestampStart: "2026-03-13T10:00:00.000Z",
      timestampEnd: "2026-03-13T10:00:00.400Z",
      durationMs: 400,
      result: "committed",
    });
  });

  it("derives transaction result from the winning terminal timestamp", async () => {
    const projectDir = await createProject();
    const logDir = path.join(projectDir, "logs");

    await mkdir(logDir, { recursive: true });
    await writeFile(
      path.join(logDir, "log.ndjson"),
      [
        createLogLine({
          timestamp: "2026-03-13T10:00:00.000Z",
          level: "info",
          message: "transaction start",
          type: "db_transaction_start",
          transaction: { id: "tx-conflict", event: "start" },
        }),
        createLogLine({
          timestamp: "2026-03-13T10:00:00.200Z",
          level: "info",
          message: "transaction rollback",
          type: "db_transaction_rollback",
          transaction: { id: "tx-conflict", event: "rollback" },
        }),
        createLogLine({
          timestamp: "2026-03-13T10:00:00.100Z",
          level: "info",
          message: "transaction commit",
          type: "db_transaction_commit",
          transaction: { id: "tx-conflict", event: "commit" },
        }),
      ].join(""),
    );

    const database = await getStudioDatabase({
      projectPath: projectDir,
      limit: 10,
    });

    expect(database.transactions).toHaveLength(1);
    expect(database.transactions[0]).toMatchObject({
      id: "tx-conflict",
      timestampEnd: "2026-03-13T10:00:00.200Z",
      durationMs: 200,
      result: "rolled_back",
    });
  });

  it("marks transactions as completed when the first terminal event has a null timestamp", async () => {
    const projectDir = await createProject();
    const logDir = path.join(projectDir, "logs");

    await mkdir(logDir, { recursive: true });
    await writeFile(
      path.join(logDir, "log.ndjson"),
      [
        createLogLine({
          timestamp: "2026-03-13T10:00:00.000Z",
          level: "info",
          message: "transaction start",
          type: "db_transaction_start",
          transaction: { id: "tx-null-end", event: "start" },
        }),
        createLogLine({
          timestamp: null,
          level: "info",
          message: "transaction commit",
          type: "db_transaction_commit",
          transaction: { id: "tx-null-end", event: "commit" },
        }),
      ].join(""),
    );

    const database = await getStudioDatabase({
      projectPath: projectDir,
      limit: 10,
    });

    expect(database.transactions).toHaveLength(1);
    expect(database.transactions[0]).toMatchObject({
      id: "tx-null-end",
      timestampEnd: null,
      durationMs: null,
      result: "committed",
    });
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
      studio: {
        sections: [],
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
