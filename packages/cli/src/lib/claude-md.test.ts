import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { __setClaudeMdAiTestHooks } from "./claude-md-ai.js";
import {
  __setClaudeMdPromptFnsForTests,
  buildNewClaudeMdFile,
  detectProjectContext,
  generateClaudeMd,
  insertManagedBlock,
  MANAGED_END,
  MANAGED_START,
  mergeClaudeMd,
  readExistingClaudeMd,
  renderClaudeMd,
} from "./claude-md.js";

const tempDirs: string[] = [];

afterEach(async () => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  __setClaudeMdPromptFnsForTests(null);
  __setClaudeMdAiTestHooks(null);
  await Promise.all(
    tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("claude md detection", () => {
  it("detects Bun, Next.js, Prisma, and PostgreSQL from project files", async () => {
    const cwd = await createTempDir();
    await writeFile(
      path.join(cwd, "package.json"),
      JSON.stringify({
        dependencies: {
          next: "^15.1.0",
          react: "^19.0.0",
          prisma: "^6.0.0",
          "@prisma/client": "^6.0.0",
          "better-auth": "^1.2.0",
          "@polar-sh/sdk": "^0.1.0",
          vitest: "^3.0.0",
        },
      }),
    );
    await writeFile(path.join(cwd, "bun.lock"), "");
    await mkdir(path.join(cwd, "src", "app"), { recursive: true });
    await mkdir(path.join(cwd, "src", "actions"), { recursive: true });
    await mkdir(path.join(cwd, "src", "lib"), { recursive: true });
    await mkdir(path.join(cwd, "prisma"), { recursive: true });
    await writeFile(
      path.join(cwd, "README.md"),
      ["# Storefront", "", "An e-commerce app for selling digital products.", ""].join("\n"),
    );
    await writeFile(
      path.join(cwd, "prisma", "schema.prisma"),
      [
        'datasource db {',
        '  provider = "postgresql"',
        '  url      = env("DATABASE_URL")',
        "}",
      ].join("\n"),
    );
    await writeFile(path.join(cwd, "src", "lib", "auth.ts"), "export const auth = {};\n");
    await writeFile(path.join(cwd, "src", "lib", "prisma.ts"), "export const prisma = {};\n");

    const detected = await detectProjectContext(cwd);

    expect(detected.runtime).toBe("bun");
    expect(detected.framework).toBe("nextjs");
    expect(detected.frameworkVersion).toBe("15.1.0");
    expect(detected.routerStyle).toBe("app router");
    expect(detected.orm).toBe("prisma");
    expect(detected.database).toBe("postgresql");
    expect(detected.auth).toBe("better auth");
    expect(detected.payments).toBe("polar");
    expect(detected.testing).toContain("vitest");
    expect(detected.projectDescription).toBe("An e-commerce app for selling digital products.");
  });
});

describe("claude md rendering and merge", () => {
  it("renders the managed sections in the expected structure", () => {
    const rendered = renderClaudeMd({
      cwd: process.cwd(),
      detected: {
        runtime: "bun",
        packageManager: "bun",
        framework: "nextjs",
        frameworkVersion: "15.0.0",
        routerStyle: "app router",
        orm: "prisma",
        database: "postgresql",
        auth: "better auth",
        payments: "polar",
        testing: ["vitest"],
        projectDescription: "Ignored in favor of prompt",
        structure: "src/\n  app/  <- App routes and layouts",
        keyFiles: [{ path: "src/lib/auth.ts", reason: "Authentication setup and session helpers" }],
        conventions: ["Database access should go through `src/lib/prisma.ts`."],
        domainHints: [],
      },
      prompted: {
        projectDescription: "A commerce app.",
        conventions: ["Use server actions for mutations."],
        keyFiles: [{ path: "src/lib/polar.ts", reason: "Polar payments client" }],
        domainKnowledge: ["Orders move from pending to fulfilled."],
      },
    });

    expect(rendered).toContain(MANAGED_START);
    expect(rendered).toContain("## What this project does");
    expect(rendered).toContain("## Tech stack");
    expect(rendered).toContain("## Project structure");
    expect(rendered).toContain("## Key conventions");
    expect(rendered).toContain("## Key files");
    expect(rendered).toContain("## Domain knowledge");
  });

  it("replaces only the managed block during merge", () => {
    const existing = [
      "# Project Context for Blyp Debugger",
      "",
      "Manual intro",
      "",
      MANAGED_START,
      "old content",
      MANAGED_END,
      "",
      "Manual appendix",
      "",
    ].join("\n");

    const next = mergeClaudeMd(existing, `${MANAGED_START}\nnew content\n${MANAGED_END}`);

    expect(next).toContain("Manual intro");
    expect(next).toContain("Manual appendix");
    expect(next).toContain("new content");
    expect(next).not.toContain("old content");
  });

  it("inserts a managed block below an existing top-level title", () => {
    const next = insertManagedBlock(
      "# Existing Title\n\nManual notes\n",
      `${MANAGED_START}\nmanaged\n${MANAGED_END}`,
    );

    expect(next).toContain("# Existing Title");
    expect(next).toContain("Manual notes");
    expect(next).toContain("managed");
  });
});

describe("claude md generation", () => {
  it("creates CLAUDE.md in the project root", async () => {
    const cwd = await createTempDir();
    process.env.OPENAI_API_KEY = "test-key";
    await writeFile(path.join(cwd, "package.json"), JSON.stringify({ dependencies: { express: "^5.0.0" } }));
    await writeFile(path.join(cwd, "README.md"), "# App\n\nAn API service.\n");

    __setClaudeMdAiTestHooks({
      generateText: async () =>
        ({
          text: JSON.stringify({
            projectDescription: "An API service.",
            keyConventions: ["Use `src/lib/db.ts` for database access."],
            keyFiles: [],
            domainKnowledge: [],
          }),
        }) as never,
    });

    const result = await generateClaudeMd({ cwd, force: false });
    const contents = await readFile(path.join(cwd, "CLAUDE.md"), "utf8");

    expect(result.created).toBe(true);
    expect(contents).toContain("# Project Context for Blyp Debugger");
    expect(contents).toContain(MANAGED_START);
    expect(contents).toContain("An API service.");
  });

  it("regenerates from scratch with --force when the file has no managed markers", async () => {
    const cwd = await createTempDir();
    process.env.OPENAI_API_KEY = "test-key";
    await writeFile(path.join(cwd, "package.json"), JSON.stringify({ dependencies: { express: "^5.0.0" } }));
    await writeFile(path.join(cwd, "CLAUDE.md"), "# Existing\n\nManual file.\n");

    __setClaudeMdAiTestHooks({
      generateText: async () =>
        ({
          text: JSON.stringify({
            projectDescription: "Fresh description.",
            keyConventions: [],
            keyFiles: [],
            domainKnowledge: [],
          }),
        }) as never,
    });

    await generateClaudeMd({ cwd, force: true });
    const contents = await readFile(path.join(cwd, "CLAUDE.md"), "utf8");

    expect(contents).toContain("Fresh description.");
    expect(contents).toContain(MANAGED_START);
    expect(contents).not.toContain("Manual file.");
  });

  it("reports managed marker presence when reading an existing file", async () => {
    const cwd = await createTempDir();
    await writeFile(
      path.join(cwd, "CLAUDE.md"),
      buildNewClaudeMdFile(`${MANAGED_START}\nmanaged\n${MANAGED_END}`),
    );

    const existing = await readExistingClaudeMd(cwd);

    expect(existing.exists).toBe(true);
    expect(existing.hasManagedBlock).toBe(true);
  });

  it("falls back to manual prompts when AI generation fails", async () => {
    const cwd = await createTempDir();
    process.env.OPENAI_API_KEY = "test-key";
    await writeFile(path.join(cwd, "package.json"), JSON.stringify({ dependencies: { express: "^5.0.0" } }));

    __setClaudeMdAiTestHooks({
      generateText: async () => {
        throw new Error("rate limited");
      },
    });
    __setClaudeMdPromptFnsForTests({
      text: async ({ message }) => {
        if (message.startsWith("What does this project do")) {
          return "Manual fallback description.";
        }
        return "";
      },
    });

    await generateClaudeMd({ cwd, force: false });
    const contents = await readFile(path.join(cwd, "CLAUDE.md"), "utf8");

    expect(contents).toContain("Manual fallback description.");
  });
});

async function createTempDir(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "blyp-cli-claude-md-"));
  tempDirs.push(directory);
  return directory;
}
