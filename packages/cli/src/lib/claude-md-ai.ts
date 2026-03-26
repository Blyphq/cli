import { existsSync } from "node:fs";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { cancel, isCancel, password, select } from "@clack/prompts";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";

import { CliError } from "./errors.js";

import type { ClaudeMdProjectContext } from "./claude-md.js";

const MAX_TOTAL_CONTEXT_CHARS = 50_000;
const MAX_FILE_SNIPPET_CHARS = 2_000;
const MAX_KEY_FILE_SNIPPETS = 8;
const MAX_README_CHARS = 4_000;
const MAX_PACKAGE_JSON_CHARS = 4_000;
const MAX_CONFIG_CHARS = 2_500;

const CLAUDE_MD_AI_SCHEMA = z.object({
  projectDescription: z.string().trim().min(1),
  keyConventions: z.array(z.string().trim().min(1)).default([]),
  keyFiles: z
    .array(
      z.object({
        path: z.string().trim().min(1),
        reason: z.string().trim().min(1),
      }),
    )
    .default([]),
  domainKnowledge: z.array(z.string().trim().min(1)).default([]),
  warnings: z.array(z.string().trim().min(1)).default([]),
  uncertainties: z.array(z.string().trim().min(1)).default([]),
});

export type ClaudeMdAiProvider = "openrouter" | "openai" | "anthropic";

export interface ResolvedClaudeMdAiConfig {
  provider: ClaudeMdAiProvider;
  apiKey: string;
  model: string;
  source: "process-env" | "project-env" | "interactive";
}

export interface ClaudeMdAiContext {
  repoName: string;
  stackSummary: string[];
  structure: string;
  keyFiles: Array<{ path: string; reason: string }>;
  sections: Array<{
    label: string;
    content: string;
  }>;
}

export interface ClaudeMdAiDraft {
  projectDescription: string;
  keyConventions: string[];
  keyFiles: Array<{ path: string; reason: string }>;
  domainKnowledge: string[];
  warnings: string[];
  uncertainties: string[];
}

type PromptSelectFn = typeof select;
type PromptPasswordFn = typeof password;
type GenerateTextFn = typeof generateText;

let promptSelectFn: PromptSelectFn = select;
let promptPasswordFn: PromptPasswordFn = password;
let generateTextFn: GenerateTextFn = generateText;

const PROVIDER_DEFAULTS: Record<ClaudeMdAiProvider, { model: string; envKey: string; label: string }> =
  {
    openrouter: {
      model: "openai/gpt-5.4",
      envKey: "OPENROUTER_API_KEY",
      label: "OpenRouter",
    },
    openai: {
      model: "gpt-5.4",
      envKey: "OPENAI_API_KEY",
      label: "OpenAI",
    },
    anthropic: {
      model: "claude-sonnet-4-5",
      envKey: "ANTHROPIC_API_KEY",
      label: "Anthropic",
    },
  };

export async function resolveClaudeMdAiConfig(
  cwd: string,
): Promise<ResolvedClaudeMdAiConfig> {
  const projectEnv = await readProjectEnv(cwd);
  const available = getAvailableProviders(projectEnv);

  if (available.length === 1) {
    return available[0]!;
  }

  if (available.length > 1) {
    const provider = await promptForProvider(
      available.map((entry) => entry.provider),
      "Choose the AI provider for CLAUDE.md generation",
    );

    return available.find((entry) => entry.provider === provider)!;
  }

  const provider = await promptForProvider(
    ["openrouter", "openai", "anthropic"],
    "No supported API key was found. Choose an AI provider",
  );
  const key = await promptForApiKey(provider);

  return {
    provider,
    apiKey: key,
    model: PROVIDER_DEFAULTS[provider].model,
    source: "interactive",
  };
}

export async function buildClaudeMdAiContext(
  cwd: string,
  detected: ClaudeMdProjectContext,
): Promise<ClaudeMdAiContext> {
  const sections: Array<{ label: string; content: string }> = [];
  let usedChars = 0;
  const repoName = path.basename(cwd);

  const addSection = (label: string, content: string | null) => {
    const trimmed = content?.trim();

    if (!trimmed) {
      return;
    }

    const nextContent = trimmed.slice(0, Math.max(0, MAX_TOTAL_CONTEXT_CHARS - usedChars));

    if (!nextContent) {
      return;
    }

    sections.push({ label, content: nextContent });
    usedChars += label.length + nextContent.length;
  };

  const stackSummary = [
    detected.runtime ? `Runtime: ${detected.runtime}` : null,
    detected.packageManager ? `Package manager: ${detected.packageManager}` : null,
    detected.framework
      ? `Framework: ${detected.framework}${detected.frameworkVersion ? ` ${detected.frameworkVersion}` : ""}`
      : null,
    detected.routerStyle ? `Router style: ${detected.routerStyle}` : null,
    detected.orm ? `ORM: ${detected.orm}` : null,
    detected.database ? `Database: ${detected.database}` : null,
    detected.auth ? `Auth: ${detected.auth}` : null,
    detected.payments ? `Payments: ${detected.payments}` : null,
    detected.testing.length > 0 ? `Testing: ${detected.testing.join(", ")}` : null,
  ].filter((value): value is string => value !== null);

  addSection("Stack summary", stackSummary.join("\n"));
  addSection("Project structure", detected.structure);
  addSection("Detected key files", detected.keyFiles.map((file) => `${file.path}: ${file.reason}`).join("\n"));

  addSection(
    "README excerpt",
    await readCappedFile(path.join(cwd, "README.md"), MAX_README_CHARS),
  );
  addSection(
    "Package manifest",
    await readCappedFile(path.join(cwd, "package.json"), MAX_PACKAGE_JSON_CHARS),
  );

  for (const relativePath of [
    "tsconfig.json",
    "next.config.ts",
    "next.config.js",
    "next.config.mjs",
    "vite.config.ts",
    "vite.config.js",
    "vite.config.mjs",
    "astro.config.ts",
    "astro.config.js",
    "astro.config.mjs",
    "svelte.config.ts",
    "svelte.config.js",
    "nuxt.config.ts",
    "nuxt.config.js",
    "nuxt.config.mjs",
    "blyp.config.ts",
    "blyp.config.js",
    "drizzle.config.ts",
    "drizzle.config.js",
    "drizzle.config.mjs",
    "prisma/schema.prisma",
  ]) {
    addSection(
      `Config: ${relativePath}`,
      await readCappedFile(path.join(cwd, relativePath), MAX_CONFIG_CHARS),
    );
  }

  for (const file of detected.keyFiles.slice(0, MAX_KEY_FILE_SNIPPETS)) {
    addSection(
      `Key file snippet: ${file.path}`,
      await readCappedFile(path.join(cwd, file.path), MAX_FILE_SNIPPET_CHARS),
    );
  }

  return {
    repoName,
    stackSummary,
    structure: detected.structure,
    keyFiles: detected.keyFiles,
    sections,
  };
}

export async function generateClaudeMdDraftWithAi(input: {
  config: ResolvedClaudeMdAiConfig;
  context: ClaudeMdAiContext;
}): Promise<ClaudeMdAiDraft> {
  const system = [
    "You generate project context for an engineering assistant.",
    "Use only the provided repository context.",
    "Distinguish facts from likely conventions and omit unsupported claims.",
    "Do not invent architecture, workflows, or domain rules.",
    "Return valid JSON only with the requested schema.",
  ].join(" ");
  const prompt = [
    `Repository: ${input.context.repoName}`,
    "Return JSON with this schema:",
    JSON.stringify(
      {
        projectDescription: "string",
        keyConventions: ["string"],
        keyFiles: [{ path: "string", reason: "string" }],
        domainKnowledge: ["string"],
        warnings: ["string"],
        uncertainties: ["string"],
      },
      null,
      2,
    ),
    "Repository context:",
    ...input.context.sections.map(
      (section) => `## ${section.label}\n${section.content}`,
    ),
  ].join("\n\n");

  const model = createModel(input.config);
  const result = await generateTextFn({
    model,
    system,
    prompt,
    temperature: 0.2,
  });

  return parseClaudeMdAiDraft(result.text);
}

export function parseClaudeMdAiDraft(value: string): ClaudeMdAiDraft {
  const normalized = value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  return CLAUDE_MD_AI_SCHEMA.parse(JSON.parse(normalized));
}

export function __setClaudeMdAiTestHooks(input: {
  select?: PromptSelectFn;
  password?: PromptPasswordFn;
  generateText?: GenerateTextFn;
} | null): void {
  promptSelectFn = input?.select ?? select;
  promptPasswordFn = input?.password ?? password;
  generateTextFn = input?.generateText ?? generateText;
}

function createModel(config: ResolvedClaudeMdAiConfig) {
  switch (config.provider) {
    case "openrouter": {
      const openrouter = createOpenRouter({ apiKey: config.apiKey });
      return openrouter(config.model);
    }
    case "openai": {
      const openai = createOpenAI({ apiKey: config.apiKey });
      return openai(config.model);
    }
    case "anthropic": {
      const anthropic = createAnthropic({ apiKey: config.apiKey });
      return anthropic(config.model);
    }
  }
}

function getAvailableProviders(
  projectEnv: Record<string, string>,
): ResolvedClaudeMdAiConfig[] {
  const resolved: ResolvedClaudeMdAiConfig[] = [];

  for (const provider of ["openrouter", "openai", "anthropic"] as const) {
    const envKey = PROVIDER_DEFAULTS[provider].envKey;
    const processValue = process.env[envKey]?.trim();
    const projectValue = projectEnv[envKey]?.trim();

    if (processValue) {
      resolved.push({
        provider,
        apiKey: processValue,
        model: PROVIDER_DEFAULTS[provider].model,
        source: "process-env",
      });
      continue;
    }

    if (projectValue) {
      resolved.push({
        provider,
        apiKey: projectValue,
        model: PROVIDER_DEFAULTS[provider].model,
        source: "project-env",
      });
    }
  }

  return resolved;
}

async function promptForProvider(
  providers: ClaudeMdAiProvider[],
  message: string,
): Promise<ClaudeMdAiProvider> {
  const selected = await promptSelectFn({
    message,
    options: providers.map((provider) => ({
      value: provider,
      label: PROVIDER_DEFAULTS[provider].label,
    })),
  });

  if (isCancel(selected)) {
    cancel("CLAUDE.md generation was cancelled.");
    throw new CliError("CLAUDE.md generation was cancelled.");
  }

  return selected;
}

async function promptForApiKey(provider: ClaudeMdAiProvider): Promise<string> {
  const input = await promptPasswordFn({
    message: `Enter your ${PROVIDER_DEFAULTS[provider].label} API key`,
    validate(value) {
      return value.trim().length > 0 ? undefined : "API key is required.";
    },
  });

  if (isCancel(input)) {
    cancel("CLAUDE.md generation was cancelled.");
    throw new CliError("CLAUDE.md generation was cancelled.");
  }

  return input.trim();
}

async function readCappedFile(filePath: string, maxChars: number): Promise<string | null> {
  if (!(await pathExists(filePath))) {
    return null;
  }

  try {
    const contents = await readFile(filePath, "utf8");
    return contents.slice(0, maxChars);
  } catch {
    return null;
  }
}

async function readProjectEnv(projectPath: string): Promise<Record<string, string>> {
  const envPath = path.join(projectPath, ".env");

  try {
    const contents = await readFile(envPath, "utf8");
    return parseEnv(contents);
  } catch {
    return {};
  }
}

function parseEnv(contents: string): Record<string, string> {
  const entries: Record<string, string> = {};

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    entries[key] = value;
  }

  return entries;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function isSupportedClaudeMdProviderEnvKey(key: string): boolean {
  return (
    key === "OPENROUTER_API_KEY" ||
    key === "OPENAI_API_KEY" ||
    key === "ANTHROPIC_API_KEY"
  );
}

export function hasLocalFile(relativePath: string, cwd: string): boolean {
  return existsSync(path.join(cwd, relativePath));
}
