import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  __setClaudeMdAiTestHooks,
  buildClaudeMdAiContext,
  parseClaudeMdAiDraft,
  resolveClaudeMdAiConfig,
} from "./claude-md-ai.js";

const tempDirs: string[] = [];

afterEach(async () => {
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  __setClaudeMdAiTestHooks(null);
  await Promise.all(
    tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("claude md ai config", () => {
  it("uses the only available provider automatically", async () => {
    process.env.OPENAI_API_KEY = "openai-key";

    const resolved = await resolveClaudeMdAiConfig(process.cwd());

    expect(resolved.provider).toBe("openai");
    expect(resolved.apiKey).toBe("openai-key");
    expect(resolved.source).toBe("process-env");
  });

  it("prompts when multiple providers are available", async () => {
    process.env.OPENROUTER_API_KEY = "router-key";
    process.env.OPENAI_API_KEY = "openai-key";
    __setClaudeMdAiTestHooks({
      select: (async () => "openrouter") as never,
    });

    const resolved = await resolveClaudeMdAiConfig(process.cwd());

    expect(resolved.provider).toBe("openrouter");
    expect(resolved.apiKey).toBe("router-key");
  });

  it("prompts for provider and password when no key is available", async () => {
    __setClaudeMdAiTestHooks({
      select: (async () => "anthropic") as never,
      password: (async () => "anthropic-key") as never,
    });

    const resolved = await resolveClaudeMdAiConfig(process.cwd());

    expect(resolved.provider).toBe("anthropic");
    expect(resolved.apiKey).toBe("anthropic-key");
    expect(resolved.source).toBe("interactive");
  });
});

describe("claude md ai context", () => {
  it("builds curated context without env content", async () => {
    const cwd = await createTempDir();
    await writeFile(path.join(cwd, ".env"), "OPENAI_API_KEY=secret\n");
    await writeFile(path.join(cwd, "README.md"), "# App\n\nRepo summary.\n");
    await writeFile(path.join(cwd, "package.json"), JSON.stringify({ name: "demo" }));
    await mkdir(path.join(cwd, "src", "lib"), { recursive: true });
    await writeFile(path.join(cwd, "src", "lib", "auth.ts"), "export const auth = true;\n");

    const context = await buildClaudeMdAiContext(cwd, {
      runtime: "bun",
      packageManager: "bun",
      framework: "nextjs",
      frameworkVersion: "15.0.0",
      routerStyle: "app router",
      orm: "prisma",
      database: "postgresql",
      auth: "better auth",
      payments: null,
      testing: ["vitest"],
      projectDescription: "Repo summary.",
      structure: "src/\n  lib/",
      keyFiles: [{ path: "src/lib/auth.ts", reason: "Authentication setup" }],
      conventions: [],
      domainHints: [],
    });

    expect(context.sections.some((section) => section.label === "README excerpt")).toBe(true);
    expect(context.sections.some((section) => section.content.includes("secret"))).toBe(false);
  });
});

describe("claude md ai draft parsing", () => {
  it("parses fenced json output", () => {
    const parsed = parseClaudeMdAiDraft([
      "```json",
      JSON.stringify({
        projectDescription: "Project summary.",
        keyConventions: ["Use server actions."],
        keyFiles: [{ path: "src/lib/auth.ts", reason: "Authentication setup" }],
        domainKnowledge: ["Orders move through fulfillment states."],
      }),
      "```",
    ].join("\n"));

    expect(parsed.projectDescription).toBe("Project summary.");
    expect(parsed.keyFiles[0]?.path).toBe("src/lib/auth.ts");
  });
});

async function createTempDir(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "blyp-cli-claude-md-ai-"));
  tempDirs.push(directory);
  return directory;
}
