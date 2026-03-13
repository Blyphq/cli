import { existsSync, readFileSync } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { cancel, isCancel, note, password, select } from "@clack/prompts";
import { createJiti } from "jiti";

import { CliError } from "./errors.js";

const CONFIG_FILE_NAMES = [
  "blyp.config.ts",
  "blyp.config.mts",
  "blyp.config.cts",
  "blyp.config.js",
  "blyp.config.mjs",
  "blyp.config.cjs",
  "blyp.config.json",
] as const;

export const STUDIO_AI_MODELS = [
  "x-ai/grok-4.20-beta",
  "google/gemini-3-flash-preview",
  "anthropic/claude-sonnet-4.6",
  "openai/gpt-5.4",
  "google/gemini-3.1-pro-preview",
  "minimax/minimax-m2.5",
  "z-ai/glm-5",
] as const;

interface StudioCliConfig {
  ai?: {
    apiKey?: string;
    model?: string;
  };
}

export async function ensureStudioAiSetup(projectPath: string): Promise<void> {
  const projectStats = await safeStat(projectPath);

  if (!projectStats?.isDirectory()) {
    throw new CliError(`Target project path is invalid: ${projectPath}`);
  }

  const config = loadProjectConfig(projectPath);
  const projectEnv = await readProjectEnv(projectPath);
  let apiKey =
    firstNonEmptyString(
      process.env.OPENROUTER_API_KEY,
      projectEnv.OPENROUTER_API_KEY,
      config.ai?.apiKey,
    ) ?? null;
  let model =
    firstNonEmptyString(
      config.ai?.model,
      projectEnv.OPENROUTER_MODEL,
      process.env.OPENROUTER_MODEL,
    ) ?? null;

  if (apiKey && model) {
    return;
  }

  note(
    "Studio AI needs an OpenRouter API key and model before the assistant can work.\nMissing values will be saved to the target project's .env file.",
    "AI Setup",
  );

  if (!apiKey) {
    const input = await password({
      message: "Enter your OpenRouter API key",
      validate(value) {
        return value.trim().length > 0 ? undefined : "API key is required.";
      },
    });

    if (isCancel(input)) {
      cancel("Studio AI onboarding was cancelled.");
      throw new CliError("Studio AI onboarding was cancelled.");
    }

    apiKey = input;
    await upsertEnvValue(projectPath, "OPENROUTER_API_KEY", input);
    process.env.OPENROUTER_API_KEY = input;
  }

  if (!model) {
    const selected = await select({
      message: "Choose the Studio AI model",
      options: STUDIO_AI_MODELS.map((value) => ({
        value,
        label: value,
      })),
      initialValue: "openai/gpt-5.4",
    });

    if (isCancel(selected)) {
      cancel("Studio AI onboarding was cancelled.");
      throw new CliError("Studio AI onboarding was cancelled.");
    }

    model = selected;
    await upsertEnvValue(projectPath, "OPENROUTER_MODEL", selected);
    process.env.OPENROUTER_MODEL = selected;
  }
}

function loadProjectConfig(projectPath: string): StudioCliConfig {
  const configPath = CONFIG_FILE_NAMES.map((fileName) => path.join(projectPath, fileName)).find(
    (candidate) => existsSync(candidate),
  );

  if (!configPath) {
    return {};
  }

  try {
    if (configPath.endsWith(".json")) {
      return JSON.parse(readFileSync(configPath, "utf8")) as StudioCliConfig;
    }

    const jiti = createJiti(projectPath, {
      interopDefault: true,
      moduleCache: false,
      fsCache: false,
    });
    const loaded = jiti(configPath) as unknown;
    const normalized =
      loaded &&
      typeof loaded === "object" &&
      "default" in loaded &&
      (loaded as { default?: unknown }).default !== undefined
        ? (loaded as { default: unknown }).default
        : loaded;

    if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
      return {};
    }

    return normalized as StudioCliConfig;
  } catch {
    return {};
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

async function upsertEnvValue(projectPath: string, key: string, value: string): Promise<void> {
  const envPath = path.join(projectPath, ".env");

  let contents = "";

  try {
    contents = await readFile(envPath, "utf8");
  } catch {
    contents = "";
  }

  const lines = contents.length > 0 ? contents.split(/\r?\n/) : [];
  let replaced = false;
  const nextLines = lines.map((line) => {
    if (line.startsWith(`${key}=`)) {
      replaced = true;
      return `${key}=${value}`;
    }

    return line;
  });

  if (!replaced) {
    if (nextLines.length > 0 && nextLines[nextLines.length - 1] !== "") {
      nextLines.push("");
    }

    nextLines.push(`${key}=${value}`);
  }

  await writeFile(envPath, `${nextLines.join("\n").replace(/\n*$/, "")}\n`, "utf8");
}

function firstNonEmptyString(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return undefined;
}

async function safeStat(targetPath: string) {
  try {
    return await stat(targetPath);
  } catch {
    return null;
  }
}
