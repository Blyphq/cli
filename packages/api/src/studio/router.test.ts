import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { appRouter } from "../routers/index";

const tempDirs: string[] = [];

afterEach(async () => {
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

    expect(meta.project.valid).toBe(true);
    expect(files.files[0]?.name).toBe("log.ndjson");
    expect(logs.records[0]?.message).toBe("hello from caller");
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
