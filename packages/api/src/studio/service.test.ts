import { gzipSync } from "node:zlib";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { __setGenerateTextForTests } from "./assistant-provider";
import { discoverStudioConfig } from "./config";
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
  replyWithStudioAssistant,
} from "./service";

const tempDirs: string[] = [];

afterEach(async () => {
  delete process.env.BLYPQ_STUDIO_TARGET;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_MODEL;
  __setGenerateTextForTests(null);

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
    expect(group?.recordCount).toBe(2);

    const detail = await getStudioGroup({
      projectPath: projectDir,
      groupId: group?.id ?? "",
    });

    expect(detail?.records).toHaveLength(2);

    const facets = await getStudioFacets({ projectPath: projectDir });
    expect(facets.types).toEqual(["checkout_flow", "plain_log"]);
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

    await mkdir(logDir, { recursive: true });
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

    __setGenerateTextForTests(
      async () => ({
        text: "This looks like a failed checkout sequence with a follow-up retry.",
      }),
    );

    const grouped = await getStudioLogs({
      projectPath: projectDir,
      grouping: "grouped",
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
      selectedGroupId: selectedGroup?.id,
    });

    expect(description.references.some((reference) => reference.kind === "group")).toBe(true);
  });
});

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
