import { existsSync, readFileSync } from "node:fs";
import { access, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { cancel, isCancel, select, spinner, text } from "@clack/prompts";

import {
  buildClaudeMdAiContext,
  generateClaudeMdDraftWithAi,
  resolveClaudeMdAiConfig,
} from "./claude-md-ai.js";
import { CliError } from "./errors.js";
import { showInfo, showWarning } from "./output.js";

const CLAUDE_MD_FILE = "CLAUDE.md";
const TITLE = "# Project Context for Blyp Debugger";
export const MANAGED_START = "<!-- blyp:claude-md:start -->";
export const MANAGED_END = "<!-- blyp:claude-md:end -->";

const DIRECTORY_NOTES: Record<string, string> = {
  "src/app": "App routes and layouts",
  "src/pages": "Pages router views and endpoints",
  "src/components": "Shared UI components",
  "src/lib": "Utilities, shared clients, and helpers",
  "src/actions": "Server-side mutations and actions",
  "src/server": "Server-only modules",
  "app": "Application routes and layouts",
  "pages": "Pages router views and endpoints",
  "components": "Shared UI components",
  "lib": "Utilities, shared clients, and helpers",
  "server": "Server-only modules",
  prisma: "Prisma schema and migrations",
  drizzle: "Drizzle schema and migrations",
  api: "API handlers and server endpoints",
};

type PromptTextFn = typeof text;
type PromptSelectFn = typeof select;

let promptTextFn: PromptTextFn = text;
let promptSelectFn: PromptSelectFn = select;

export interface ClaudeMdExistingFile {
  path: string;
  exists: boolean;
  content: string | null;
  hasManagedBlock: boolean;
}

export interface ClaudeMdProjectContext {
  runtime: string | null;
  packageManager: string | null;
  framework: string | null;
  frameworkVersion: string | null;
  routerStyle: string | null;
  orm: string | null;
  database: string | null;
  auth: string | null;
  payments: string | null;
  testing: string[];
  projectDescription: string | null;
  structure: string;
  keyFiles: Array<{ path: string; reason: string }>;
  conventions: string[];
  domainHints: string[];
}

export interface PromptedClaudeMdContext {
  projectDescription: string;
  conventions: string[];
  keyFiles: Array<{ path: string; reason: string }>;
  domainKnowledge: string[];
}

export async function generateClaudeMd(input: {
  cwd: string;
  force: boolean;
}): Promise<{ path: string; created: boolean; updated: boolean }> {
  const detected = await detectProjectContext(input.cwd);

  showDetectionSummary(detected);
  let prompted: PromptedClaudeMdContext | null = null;
  let aiStatus: ReturnType<typeof spinner> | null = null;

  try {
    const config = await resolveClaudeMdAiConfig(input.cwd);
    showInfo(`Using AI provider: ${formatAiProvider(config.provider)}`);
    aiStatus = spinner();
    aiStatus.start("Building project context and generating CLAUDE.md with AI");

    const context = await buildClaudeMdAiContext(input.cwd, detected);
    const draft = await generateClaudeMdDraftWithAi({
      config,
      context,
    });

    aiStatus.stop("AI draft generated");
    aiStatus = null;
    showInfo("AI draft generated");
    prompted = {
      projectDescription: draft.projectDescription.trim(),
      conventions: draft.keyConventions,
      keyFiles: draft.keyFiles,
      domainKnowledge: draft.domainKnowledge,
    };
  } catch (error) {
    if (aiStatus) {
      aiStatus.stop("AI draft failed");
      aiStatus = null;
    }

    if (error instanceof CliError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : "unknown error";
    showWarning(`Falling back to manual prompts because AI generation failed: ${message}`);
    prompted = await promptForClaudeContext(detected);
  }

  const existing = await readExistingClaudeMd(input.cwd);
  const rendered = renderClaudeMd({
    detected,
    prompted,
    cwd: input.cwd,
  });

  let nextContents: string;
  let created = false;

  if (!existing.exists) {
    nextContents = buildNewClaudeMdFile(rendered);
    created = true;
  } else if (existing.hasManagedBlock) {
    nextContents = mergeClaudeMd(existing.content ?? "", rendered);
  } else {
    const mode = input.force ? "regenerate" : await promptForExistingFileMode();
    nextContents =
      mode === "update"
        ? insertManagedBlock(existing.content ?? "", rendered)
        : buildNewClaudeMdFile(rendered);
  }

  await writeClaudeMd(input.cwd, nextContents);

  return {
    path: existing.path,
    created,
    updated: !created,
  };
}

export async function detectProjectContext(cwd: string): Promise<ClaudeMdProjectContext> {
  const packageJson = await readJsonFile<PackageJson>(path.join(cwd, "package.json"));
  const dependencies = {
    ...(packageJson?.dependencies ?? {}),
    ...(packageJson?.devDependencies ?? {}),
    ...(packageJson?.peerDependencies ?? {}),
  };
  const prismaSchema = await readOptionalFile(path.join(cwd, "prisma", "schema.prisma"));
  const drizzleConfigPath = await findExistingPath(cwd, [
    "drizzle.config.ts",
    "drizzle.config.js",
    "drizzle.config.mjs",
  ]);
  const nextConfigPath = await findExistingPath(cwd, [
    "next.config.ts",
    "next.config.js",
    "next.config.mjs",
  ]);
  const viteConfigPath = await findExistingPath(cwd, [
    "vite.config.ts",
    "vite.config.js",
    "vite.config.mjs",
  ]);
  const astroConfigPath = await findExistingPath(cwd, [
    "astro.config.ts",
    "astro.config.js",
    "astro.config.mjs",
  ]);
  const svelteConfigPath = await findExistingPath(cwd, ["svelte.config.js", "svelte.config.ts"]);
  const nuxtConfigPath = await findExistingPath(cwd, [
    "nuxt.config.ts",
    "nuxt.config.js",
    "nuxt.config.mjs",
  ]);
  const readme = await readOptionalFile(path.join(cwd, "README.md"));
  const hintFiles = await findHintFiles(cwd);

  const frameworkInfo = detectFramework({
    dependencies,
    nextConfigPath,
    viteConfigPath,
    astroConfigPath,
    svelteConfigPath,
    nuxtConfigPath,
  });
  const orm = detectOrm({ dependencies, prismaSchema, drizzleConfigPath, cwd });
  const database = detectDatabase({
    prismaSchema,
    drizzleConfigPath,
    dependencies,
    cwd,
  });
  const routerStyle = detectRouterStyle(cwd, frameworkInfo.framework);
  const auth = detectAuth(dependencies, hintFiles);
  const payments = detectPayments(dependencies, hintFiles);
  const conventions = detectConventions(cwd, frameworkInfo.framework);

  return {
    runtime: detectRuntime(cwd),
    packageManager: detectPackageManager(cwd),
    framework: frameworkInfo.framework,
    frameworkVersion: frameworkInfo.version,
    routerStyle,
    orm,
    database,
    auth,
    payments,
    testing: detectTesting(dependencies),
    projectDescription: extractReadmeDescription(readme),
    structure: await buildProjectStructure(cwd),
    keyFiles: await detectKeyFiles(cwd, hintFiles),
    conventions,
    domainHints: [],
  };
}

export async function promptForClaudeContext(
  detected: ClaudeMdProjectContext,
): Promise<PromptedClaudeMdContext> {
  const description = await promptTextFn({
    message: "What does this project do? (1-2 sentences)",
    defaultValue: detected.projectDescription ?? undefined,
    validate(value) {
      return value.trim().length > 0 ? undefined : "A short project description is required.";
    },
  });

  if (isCancel(description)) {
    cancel("CLAUDE.md generation was cancelled.");
    throw new CliError("CLAUDE.md generation was cancelled.");
  }

  const conventions = await promptTextFn({
    message: "Any key architectural decisions or conventions to note? (optional)",
    defaultValue: detected.conventions.join("\n"),
    placeholder: "One per line",
  });

  if (isCancel(conventions)) {
    cancel("CLAUDE.md generation was cancelled.");
    throw new CliError("CLAUDE.md generation was cancelled.");
  }

  let domainKnowledge = "";

  if (detected.domainHints.length === 0) {
    const domainResponse = await promptTextFn({
      message:
        "Any domain knowledge, workflows, or state machines the debugger should know about? (optional)",
      placeholder: "One per line",
    });

    if (isCancel(domainResponse)) {
      cancel("CLAUDE.md generation was cancelled.");
      throw new CliError("CLAUDE.md generation was cancelled.");
    }

    domainKnowledge = domainResponse;
  }

  return {
    projectDescription: description.trim(),
    conventions: toList(conventions),
    keyFiles: [],
    domainKnowledge: toList(domainKnowledge),
  };
}

export async function readExistingClaudeMd(cwd: string): Promise<ClaudeMdExistingFile> {
  const filePath = path.join(cwd, CLAUDE_MD_FILE);
  const content = await readOptionalFile(filePath);

  return {
    path: filePath,
    exists: content !== null,
    content,
    hasManagedBlock:
      content !== null && content.includes(MANAGED_START) && content.includes(MANAGED_END),
  };
}

export function renderClaudeMd(input: {
  cwd: string;
  detected: ClaudeMdProjectContext;
  prompted: PromptedClaudeMdContext;
}): string {
  const techStack = buildTechStackLines(input.detected);
  const conventions = uniquePreservingOrder([
    ...input.prompted.conventions,
    ...input.detected.conventions,
  ]);
  const keyFiles = mergeKeyFiles(input.cwd, input.detected.keyFiles, input.prompted.keyFiles);
  const sections = [
    ["## What this project does", `${input.prompted.projectDescription}`],
    [
      "## Tech stack",
      techStack.length > 0 ? techStack.map((line) => `- ${line}`).join("\n") : "- Unknown",
    ],
    ["## Project structure", ["```text", input.detected.structure, "```"].join("\n")],
    input.detected.conventions.length > 0 || input.prompted.conventions.length > 0
      ? ["## Key conventions", conventions.map((line) => `- ${line}`).join("\n")]
      : null,
    keyFiles.length > 0
      ? [
          "## Key files",
          keyFiles
            .map((file) => `- \`${file.path}\` - ${file.reason}`)
            .join("\n"),
        ]
      : null,
    input.prompted.domainKnowledge.length > 0
      ? [
          "## Domain knowledge",
          input.prompted.domainKnowledge.map((line) => `- ${line}`).join("\n"),
        ]
      : null,
  ].filter((section): section is [string, string] => section !== null);

  return [MANAGED_START, ...sections.flatMap(([title, body]) => [title, body, ""]), MANAGED_END]
    .join("\n")
    .trim();
}

export function mergeClaudeMd(existing: string, rendered: string): string {
  const startIndex = existing.indexOf(MANAGED_START);
  const endIndex = existing.indexOf(MANAGED_END);

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    return buildNewClaudeMdFile(rendered);
  }

  const before = existing.slice(0, startIndex).replace(/\s*$/, "\n\n");
  const after = existing.slice(endIndex + MANAGED_END.length).replace(/^\s*/, "\n\n");

  return `${before}${rendered}${after}`.trimEnd() + "\n";
}

export async function writeClaudeMd(cwd: string, contents: string): Promise<void> {
  await writeFile(path.join(cwd, CLAUDE_MD_FILE), contents, "utf8");
}

export function insertManagedBlock(existing: string, rendered: string): string {
  const trimmed = existing.trimEnd();

  if (trimmed.length === 0) {
    return buildNewClaudeMdFile(rendered);
  }

  const headingMatch = trimmed.match(/^# .*(?:\r?\n)+/);

  if (!headingMatch) {
    return `${TITLE}\n\n${rendered}\n\n${trimmed}\n`;
  }

  const insertAt = headingMatch[0].length;
  const before = trimmed.slice(0, insertAt).trimEnd();
  const after = trimmed.slice(insertAt).trimStart();

  return [before, "", rendered, after ? `\n${after}` : ""].join("\n").trimEnd() + "\n";
}

export function buildNewClaudeMdFile(rendered: string): string {
  return `${TITLE}\n\n${rendered}\n`;
}

export async function promptForExistingFileMode(): Promise<"update" | "regenerate"> {
  showInfo("CLAUDE.md already exists.");
  const selected = await promptSelectFn({
    message: "Update existing file or regenerate from scratch?",
    options: [
      { value: "update", label: "Update existing file" },
      { value: "regenerate", label: "Regenerate from scratch" },
    ],
  });

  if (isCancel(selected)) {
    cancel("CLAUDE.md generation was cancelled.");
    throw new CliError("CLAUDE.md generation was cancelled.");
  }

  return selected;
}

export function __setClaudeMdPromptFnsForTests(input: {
  text?: PromptTextFn;
  select?: PromptSelectFn;
} | null): void {
  promptTextFn = input?.text ?? text;
  promptSelectFn = input?.select ?? select;
}

function showDetectionSummary(detected: ClaudeMdProjectContext): void {
  const stackSummary = [
    detected.runtime ? capitalize(detected.runtime) + " runtime" : null,
    detected.framework
      ? detected.frameworkVersion
        ? `${formatFrameworkName(detected.framework)} ${detected.frameworkVersion}`
        : formatFrameworkName(detected.framework)
      : null,
    detected.orm ? capitalizeKnownValue(detected.orm) : null,
    detected.database ? capitalizeKnownValue(detected.database) : null,
  ].filter(Boolean);
  const structureSummary =
    detected.routerStyle && detected.structure.includes("src/")
      ? `src/ structure with ${formatRouterStyle(detected.routerStyle)}`
      : detected.routerStyle
        ? `${formatRouterStyle(detected.routerStyle)} structure`
        : "project structure scanned";

  if (stackSummary.length > 0) {
    showInfo(`Detected: ${stackSummary.join(", ")}`);
  }
  showInfo(`Detected: ${structureSummary}`);
}

function buildTechStackLines(detected: ClaudeMdProjectContext): string[] {
  const lines = [
    detected.runtime ? `Runtime: ${capitalize(detected.runtime)}` : null,
    detected.packageManager ? `Package manager: ${capitalize(detected.packageManager)}` : null,
    detected.framework
      ? `Framework: ${formatFrameworkName(detected.framework)}${detected.frameworkVersion ? ` ${detected.frameworkVersion}` : ""}${detected.routerStyle ? ` (${formatRouterStyle(detected.routerStyle)})` : ""}`
      : null,
    detected.orm ? `ORM: ${capitalizeKnownValue(detected.orm)}` : null,
    detected.database ? `Database: ${capitalizeKnownValue(detected.database)}` : null,
    detected.auth ? `Auth: ${capitalizeKnownValue(detected.auth)}` : null,
    detected.payments ? `Payments: ${capitalizeKnownValue(detected.payments)}` : null,
    detected.testing.length > 0 ? `Testing: ${detected.testing.map(capitalizeKnownValue).join(", ")}` : null,
  ];

  return lines.filter((line): line is string => line !== null);
}

function mergeKeyFiles(
  cwd: string,
  detected: Array<{ path: string; reason: string }>,
  suggested: Array<{ path: string; reason: string }>,
): Array<{ path: string; reason: string }> {
  const merged = [...detected];
  const knownPaths = new Set(detected.map((file) => file.path));

  for (const suggestion of suggested) {
    if (knownPaths.has(suggestion.path)) {
      continue;
    }

    if (!hasFileSyncHint(cwd, suggestion.path)) {
      continue;
    }

    knownPaths.add(suggestion.path);
    merged.push(suggestion);
  }

  return merged.slice(0, 10);
}

function detectRuntime(cwd: string): string | null {
  if (hasFileSyncHint(cwd, "bun.lock") || hasFileSyncHint(cwd, "bun.lockb")) {
    return "bun";
  }

  if (hasFileSyncHint(cwd, "deno.json") || hasFileSyncHint(cwd, "deno.jsonc")) {
    return "deno";
  }

  if (
    hasFileSyncHint(cwd, "package.json") ||
    hasFileSyncHint(cwd, "package-lock.json") ||
    hasFileSyncHint(cwd, "pnpm-lock.yaml") ||
    hasFileSyncHint(cwd, "yarn.lock")
  ) {
    return "node";
  }

  return null;
}

function detectPackageManager(cwd: string): string | null {
  if (hasFileSyncHint(cwd, "bun.lock") || hasFileSyncHint(cwd, "bun.lockb")) {
    return "bun";
  }
  if (hasFileSyncHint(cwd, "pnpm-lock.yaml")) {
    return "pnpm";
  }
  if (hasFileSyncHint(cwd, "package-lock.json")) {
    return "npm";
  }
  if (hasFileSyncHint(cwd, "yarn.lock")) {
    return "yarn";
  }

  return null;
}

function detectFramework(input: {
  dependencies: Record<string, string>;
  nextConfigPath: string | null;
  viteConfigPath: string | null;
  astroConfigPath: string | null;
  svelteConfigPath: string | null;
  nuxtConfigPath: string | null;
}): { framework: string | null; version: string | null } {
  const { dependencies } = input;

  if (dependencies.next || input.nextConfigPath) {
    return { framework: "nextjs", version: cleanVersion(dependencies.next) };
  }
  if (dependencies.hono) {
    return { framework: "hono", version: cleanVersion(dependencies.hono) };
  }
  if (dependencies.elysia) {
    return { framework: "elysia", version: cleanVersion(dependencies.elysia) };
  }
  if (dependencies.express) {
    return { framework: "express", version: cleanVersion(dependencies.express) };
  }
  if (dependencies["@tanstack/start"]) {
    return { framework: "tanstack-start", version: cleanVersion(dependencies["@tanstack/start"]) };
  }
  if (dependencies.astro || input.astroConfigPath) {
    return { framework: "astro", version: cleanVersion(dependencies.astro) };
  }
  if (dependencies.nuxt || input.nuxtConfigPath) {
    return { framework: "nuxt", version: cleanVersion(dependencies.nuxt) };
  }
  if (dependencies.svelte || input.svelteConfigPath) {
    return { framework: "svelte", version: cleanVersion(dependencies.svelte) };
  }
  if (dependencies.vite && dependencies.react) {
    return { framework: "react-vite", version: cleanVersion(dependencies.vite) };
  }
  if (input.viteConfigPath) {
    return { framework: "vite", version: cleanVersion(dependencies.vite) };
  }

  return { framework: null, version: null };
}

function detectRouterStyle(cwd: string, framework: string | null): string | null {
  if (framework === "nextjs") {
    if (hasFileSyncHint(cwd, path.join("src", "app")) || hasFileSyncHint(cwd, "app")) {
      return "app router";
    }
    if (hasFileSyncHint(cwd, path.join("src", "pages")) || hasFileSyncHint(cwd, "pages")) {
      return "pages router";
    }
  }

  if (framework === "tanstack-start") {
    return "file-based routes";
  }

  return null;
}

function detectOrm(input: {
  dependencies: Record<string, string>;
  prismaSchema: string | null;
  drizzleConfigPath: string | null;
  cwd: string;
}): string | null {
  if (input.prismaSchema || input.dependencies.prisma || input.dependencies["@prisma/client"]) {
    return "prisma";
  }
  if (
    input.drizzleConfigPath ||
    input.dependencies["drizzle-orm"] ||
    hasFileSyncHint(input.cwd, "drizzle")
  ) {
    return "drizzle";
  }

  return null;
}

function detectDatabase(input: {
  prismaSchema: string | null;
  drizzleConfigPath: string | null;
  dependencies: Record<string, string>;
  cwd: string;
}): string | null {
  const prismaProviderMatch = input.prismaSchema?.match(/provider\s*=\s*"([^"]+)"/);

  if (prismaProviderMatch?.[1]) {
    return prismaProviderMatch[1];
  }

  if (input.drizzleConfigPath) {
    const config = tryReadSyncString(input.drizzleConfigPath);
    if (config.includes("postgres")) return "postgresql";
    if (config.includes("mysql")) return "mysql";
    if (config.includes("sqlite")) return "sqlite";
  }

  if (input.dependencies.pg || input.dependencies.postgres) return "postgresql";
  if (input.dependencies.mysql2) return "mysql";
  if (input.dependencies.sqlite3 || input.dependencies["better-sqlite3"]) return "sqlite";
  if (input.dependencies.mongodb) return "mongodb";

  return null;
}

function detectAuth(
  dependencies: Record<string, string>,
  hintFiles: string[],
): string | null {
  if (dependencies["better-auth"]) return "better auth";
  if (dependencies["next-auth"] || dependencies["@auth/core"]) return "auth.js";
  if (dependencies["@clerk/nextjs"] || dependencies["@clerk/clerk-sdk-node"]) return "clerk";
  if (dependencies["@supabase/supabase-js"]) return "supabase";

  const authHint = hintFiles.find((file) => /(^|\/)auth\./.test(file));
  if (authHint) return path.basename(authHint).split(".")[0] ?? null;

  return null;
}

function detectPayments(
  dependencies: Record<string, string>,
  hintFiles: string[],
): string | null {
  if (dependencies["@polar-sh/sdk"] || dependencies["@polar-sh/better-auth"]) return "polar";
  if (dependencies.stripe) return "stripe";

  const paymentHint = hintFiles.find((file) => /(polar|stripe)\./.test(file));
  if (paymentHint?.includes("polar")) return "polar";
  if (paymentHint?.includes("stripe")) return "stripe";

  return null;
}

function detectTesting(dependencies: Record<string, string>): string[] {
  return [
    dependencies.vitest ? "vitest" : null,
    dependencies.jest ? "jest" : null,
    dependencies.playwright || dependencies["@playwright/test"] ? "playwright" : null,
  ].filter((value): value is string => value !== null);
}

function detectConventions(cwd: string, framework: string | null): string[] {
  const conventions: string[] = [];

  if (
    framework === "nextjs" &&
    hasFileSyncHint(cwd, path.join("src", "actions")) &&
    !hasFileSyncHint(cwd, path.join("src", "pages", "api")) &&
    !hasFileSyncHint(cwd, "pages/api")
  ) {
    conventions.push("Mutations appear to live in server actions under `src/actions`.");
  }

  if (hasFileSyncHint(cwd, path.join("src", "lib", "prisma.ts"))) {
    conventions.push("Database access should go through `src/lib/prisma.ts`.");
  } else if (hasFileSyncHint(cwd, path.join("lib", "prisma.ts"))) {
    conventions.push("Database access should go through `lib/prisma.ts`.");
  }

  return conventions;
}

async function buildProjectStructure(cwd: string): Promise<string> {
  const lines: string[] = [];
  const topLevelDirs = await safeReadDir(cwd);
  const orderedDirs = [
    "src",
    "app",
    "pages",
    "components",
    "lib",
    "server",
    "api",
    "prisma",
    "drizzle",
  ].filter((dir) => topLevelDirs.includes(dir));
  const remainingDirs = topLevelDirs
    .filter((dir) => !orderedDirs.includes(dir) && !dir.startsWith("."))
    .sort()
    .slice(0, 5);

  for (const dir of [...orderedDirs, ...remainingDirs]) {
    lines.push(`${dir}/`);

    if (dir === "src") {
      const srcDirs = await safeReadDir(path.join(cwd, "src"));
      for (const nested of ["app", "pages", "components", "lib", "actions", "server"]) {
        if (srcDirs.includes(nested)) {
          const key = `src/${nested}`;
          lines.push(`  ${nested}/${DIRECTORY_NOTES[key] ? `  <- ${DIRECTORY_NOTES[key]}` : ""}`.trimEnd());
        }
      }
      continue;
    }

    const note = DIRECTORY_NOTES[dir];
    if (note) {
      lines[lines.length - 1] = `${dir}/  <- ${note}`;
    }
  }

  return lines.length > 0 ? lines.slice(0, 18).join("\n") : ".";
}

async function detectKeyFiles(
  cwd: string,
  hintFiles: string[],
): Promise<Array<{ path: string; reason: string }>> {
  const candidates: Array<[string, string]> = [
    ["src/lib/auth.ts", "Authentication setup and session helpers"],
    ["src/lib/prisma.ts", "Shared Prisma client"],
    ["src/lib/db.ts", "Shared database access layer"],
    ["src/lib/polar.ts", "Polar payments client"],
    ["src/lib/stripe.ts", "Stripe integration"],
    ["src/lib/resend.ts", "Email delivery integration"],
    ["lib/auth.ts", "Authentication setup and session helpers"],
    ["lib/prisma.ts", "Shared Prisma client"],
    ["lib/db.ts", "Shared database access layer"],
    ["prisma/schema.prisma", "Prisma data model"],
    ["drizzle.config.ts", "Drizzle configuration"],
    ["blyp.config.ts", "Blyp runtime and log configuration"],
    ["package.json", "Project scripts and dependencies"],
  ];
  const results: Array<{ path: string; reason: string }> = [];

  for (const [relativePath, reason] of candidates) {
    if (await pathExists(path.join(cwd, relativePath))) {
      results.push({ path: relativePath, reason });
    }
  }

  for (const file of hintFiles) {
    if (results.some((entry) => entry.path === file)) {
      continue;
    }

    results.push({
      path: file,
      reason: inferHintReason(file),
    });
  }

  return results.slice(0, 8);
}

async function findHintFiles(cwd: string): Promise<string[]> {
  const hintNames = ["auth", "prisma", "drizzle", "db", "stripe", "polar", "resend"];
  const roots = ["src/lib", "lib", "src/server", "server"];
  const matches: string[] = [];

  for (const root of roots) {
    const absoluteRoot = path.join(cwd, root);
    if (!(await pathExists(absoluteRoot))) {
      continue;
    }

    const entries = await readdir(absoluteRoot, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }

      if (hintNames.some((name) => entry.name.startsWith(`${name}.`))) {
        matches.push(path.posix.join(root.replaceAll(path.sep, "/"), entry.name));
      }
    }
  }

  return matches.sort();
}

function extractReadmeDescription(readme: string | null): string | null {
  if (!readme) {
    return null;
  }

  const paragraphs = readme
    .split(/\r?\n\r?\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  for (const paragraph of paragraphs) {
    if (
      paragraph.startsWith("#") ||
      paragraph.startsWith("```") ||
      /^(install|getting started|usage|cli|setup)\b/i.test(paragraph)
    ) {
      continue;
    }

    const cleaned = paragraph.replace(/\r?\n/g, " ").trim();

    if (cleaned.length > 0) {
      return cleaned;
    }
  }

  return null;
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  const contents = await readOptionalFile(filePath);

  if (!contents) {
    return null;
  }

  try {
    return JSON.parse(contents) as T;
  } catch {
    return null;
  }
}

async function readOptionalFile(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

async function findExistingPath(cwd: string, relativePaths: string[]): Promise<string | null> {
  for (const relativePath of relativePaths) {
    const absolutePath = path.join(cwd, relativePath);
    if (await pathExists(absolutePath)) {
      return absolutePath;
    }
  }

  return null;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function safeReadDir(dirPath: string): Promise<string[]> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

function hasFileSyncHint(cwd: string, relativePath: string): boolean {
  return existsSync(path.join(cwd, relativePath));
}

function tryReadSyncString(filePath: string): string {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function cleanVersion(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  return value.replace(/^[^\d]*/, "").trim() || null;
}

function formatFrameworkName(value: string): string {
  switch (value) {
    case "nextjs":
      return "Next.js";
    case "tanstack-start":
      return "TanStack Start";
    case "react-vite":
      return "React + Vite";
    default:
      return capitalizeKnownValue(value);
  }
}

function formatRouterStyle(value: string): string {
  switch (value) {
    case "app router":
      return "App Router";
    case "pages router":
      return "Pages Router";
    case "file-based routes":
      return "file-based routes";
    default:
      return value;
  }
}

function inferHintReason(filePath: string): string {
  if (filePath.includes("auth")) return "Authentication setup";
  if (filePath.includes("prisma")) return "Prisma integration";
  if (filePath.includes("drizzle")) return "Drizzle integration";
  if (filePath.includes("stripe")) return "Stripe integration";
  if (filePath.includes("polar")) return "Polar integration";
  if (filePath.includes("resend")) return "Email delivery integration";
  if (filePath.includes("db")) return "Database integration";
  return "Important project helper";
}

function toList(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function uniquePreservingOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }

  return result;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function capitalizeKnownValue(value: string): string {
  return value
    .split(/[\s-]/)
    .map((part) => capitalize(part))
    .join(value.includes("-") ? "-" : " ");
}

function formatAiProvider(provider: "openrouter" | "openai" | "anthropic"): string {
  switch (provider) {
    case "openrouter":
      return "OpenRouter";
    case "openai":
      return "OpenAI";
    case "anthropic":
      return "Anthropic";
  }
}

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}
