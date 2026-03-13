import { mkdtemp, mkdir, rm, writeFile, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  parseCallerCandidates,
  parseStackCandidates,
  readSourceContext,
  resolveRecordSourceLocation,
} from "./source";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("studio source resolution", () => {
  it("parses absolute and file URL stack frames", () => {
    const stack = [
      "Error: boom",
      "    at anonymous (file:///tmp/demo/src/routes/test.ts:12:8)",
      "    at handler (/tmp/demo/src/lib/util.ts:30:4)",
    ].join("\n");

    expect(parseStackCandidates(stack)).toEqual([
      {
        pathText: "/tmp/demo/src/routes/test.ts",
        line: 12,
        column: 8,
        origin: "stack",
      },
      {
        pathText: "/tmp/demo/src/lib/util.ts",
        line: 30,
        column: 4,
        origin: "stack",
      },
    ]);
  });

  it("parses relative callers", () => {
    expect(parseCallerCandidates("src/routes/test.ts:14")).toEqual([
      {
        pathText: "src/routes/test.ts",
        line: 14,
        column: null,
        origin: "caller",
      },
    ]);
  });

  it("prefers the first valid project stack frame before caller", async () => {
    const projectDir = await createProject();
    const filePath = path.join(projectDir, "src/routes/demo.ts");
    await writeProjectFile(filePath);

    const resolution = await resolveRecordSourceLocation(projectDir, {
      stack: [
        "Error: boom",
        "    at framework (/tmp/other/node_modules/pkg/index.js:1:1)",
        `    at run (${filePath}:18:3)`,
      ].join("\n"),
      caller: "src/routes/fallback.ts:3",
    });

    expect(resolution).toEqual({
      status: "resolved",
      location: {
        absolutePath: filePath,
        relativePath: "src/routes/demo.ts",
        line: 18,
        column: 3,
        origin: "stack",
      },
    });
  });

  it("falls back to caller when stack has no valid project frame", async () => {
    const projectDir = await createProject();
    const callerPath = path.join(projectDir, "src/routes/demo.ts");
    await writeProjectFile(callerPath);

    const resolution = await resolveRecordSourceLocation(projectDir, {
      stack: "Error\n    at framework (/tmp/other/node_modules/pkg/index.js:1:1)",
      caller: "src/routes/demo.ts:22",
    });

    expect(resolution).toEqual({
      status: "resolved",
      location: {
        absolutePath: callerPath,
        relativePath: "src/routes/demo.ts",
        line: 22,
        column: null,
        origin: "caller",
      },
    });
  });

  it("rejects frames outside the project and node_modules paths", async () => {
    const projectDir = await createProject();

    await expect(
      resolveRecordSourceLocation(projectDir, {
        stack: "Error\n    at framework (/tmp/other/node_modules/pkg/index.js:1:1)",
        caller: null,
      }),
    ).resolves.toEqual({
      status: "unavailable",
      reason: "node_modules",
    });

    await expect(
      resolveRecordSourceLocation(projectDir, {
        stack: `Error\n    at run (${path.join(os.tmpdir(), "outside.ts")}:4:2)`,
        caller: null,
      }),
    ).resolves.toEqual({
      status: "unavailable",
      reason: "outside_project",
    });
  });

  it("rejects unsupported extensions", async () => {
    const projectDir = await createProject();
    const filePath = path.join(projectDir, "src/config.json");
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, "{}");

    await expect(
      resolveRecordSourceLocation(projectDir, {
        stack: null,
        caller: "src/config.json:4",
      }),
    ).resolves.toEqual({
      status: "unavailable",
      reason: "unsupported_extension",
    });
  });
});

describe("studio source excerpts", () => {
  it("returns a bounded snippet around the focus line", async () => {
    const projectDir = await createProject();
    const filePath = path.join(projectDir, "src/routes/demo.ts");
    await writeProjectFile(filePath);

    const context = await readSourceContext({
      absolutePath: filePath,
      relativePath: "src/routes/demo.ts",
      line: 14,
      column: null,
      origin: "stack",
    });

    expect(context.status).toBe("resolved");
    expect(context.startLine).toBe(2);
    expect(context.endLine).toBe(20);
    expect(context.focusLine).toBe(14);
    expect(context.snippet).toContain("line-14");
  });

  it("returns file_missing when the resolved file disappears", async () => {
    const projectDir = await createProject();
    const filePath = path.join(projectDir, "src/routes/demo.ts");
    await writeProjectFile(filePath);
    await unlink(filePath);

    const context = await readSourceContext({
      absolutePath: filePath,
      relativePath: "src/routes/demo.ts",
      line: 4,
      column: null,
      origin: "caller",
    });

    expect(context).toMatchObject({
      status: "unavailable",
      reason: "file_missing",
    });
  });

  it("returns file_too_large for oversized source files", async () => {
    const projectDir = await createProject();
    const filePath = path.join(projectDir, "src/routes/big.ts");
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, "x".repeat(260 * 1024));

    const context = await readSourceContext({
      absolutePath: filePath,
      relativePath: "src/routes/big.ts",
      line: 1,
      column: null,
      origin: "stack",
    });

    expect(context).toMatchObject({
      status: "unavailable",
      reason: "file_too_large",
    });
  });
});

async function createProject(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "blyp-source-"));
  tempDirs.push(directory);
  return directory;
}

async function writeProjectFile(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(
    filePath,
    Array.from({ length: 20 }, (_, index) => `const line${index + 1} = "line-${index + 1}";`).join("\n"),
  );
}
