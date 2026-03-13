import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { createJiti } from "jiti";

import type {
  StudioAiSummary,
  StudioClientLoggingSummary,
  StudioConfigDiscovery,
  StudioConfigFileMatch,
  StudioConfigFileType,
  StudioLogFileSummary,
  StudioLogRotationSummary,
  StudioProjectResolution,
  StudioResolvedConfigSummary,
  StudioResolvedConnectorsSummary,
  StudioResolvedOtlpConnectorSummary,
  StudioResolvedPostHogConnectorSummary,
  StudioResolvedSentryConnectorSummary,
} from "./types";

const CONFIG_FILE_NAMES = [
  "blyp.config.ts",
  "blyp.config.mts",
  "blyp.config.cts",
  "blyp.config.js",
  "blyp.config.mjs",
  "blyp.config.cjs",
  "blyp.config.json",
] as const;

const DEFAULT_ROTATION_CONFIG: StudioLogRotationSummary = {
  enabled: true,
  maxSizeBytes: 10 * 1024 * 1024,
  maxArchives: 5,
  compress: true,
};

const DEFAULT_FILE_CONFIG: StudioLogFileSummary = {
  enabled: true,
  dir: "",
  archiveDir: "",
  format: "ndjson",
  rotation: DEFAULT_ROTATION_CONFIG,
};

const DEFAULT_CLIENT_LOGGING_CONFIG: StudioClientLoggingSummary = {
  enabled: true,
  path: "/inngest",
};

const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";
const DEFAULT_CONNECTOR_SERVICE_NAME = "blyp-app";

interface StudioConfigInput {
  pretty?: boolean;
  level?: string;
  logDir?: string;
  ai?: {
    apiKey?: string;
    model?: string;
  };
  file?: {
    enabled?: boolean;
    dir?: string;
    archiveDir?: string;
    format?: "ndjson";
    rotation?: {
      enabled?: boolean;
      maxSizeBytes?: number;
      maxArchives?: number;
      compress?: boolean;
    };
  };
  clientLogging?:
    | boolean
    | {
        enabled?: boolean;
        path?: string;
      };
  connectors?: {
    posthog?: {
      enabled?: boolean;
      mode?: string;
      projectKey?: string;
      host?: string;
      serviceName?: string;
      errorTracking?: {
        enabled?: boolean;
        mode?: string;
        enableExceptionAutocapture?: boolean;
      };
    };
    sentry?: {
      enabled?: boolean;
      mode?: string;
      dsn?: string;
      environment?: string;
      release?: string;
    };
    otlp?: Array<{
      name: string;
      enabled?: boolean;
      mode?: string;
      endpoint?: string;
      headers?: Record<string, string>;
      auth?: string;
      serviceName?: string;
    }>;
  };
}

type PostHogConnectorInput = NonNullable<NonNullable<StudioConfigInput["connectors"]>["posthog"]>;
type SentryConnectorInput = NonNullable<NonNullable<StudioConfigInput["connectors"]>["sentry"]>;
type OtlpConnectorInput = NonNullable<NonNullable<StudioConfigInput["connectors"]>["otlp"]>[number];

export async function discoverStudioConfig(
  project: StudioProjectResolution,
): Promise<StudioConfigDiscovery> {
  const defaults = buildResolvedConfig({}, project.absolutePath);

  if (!project.valid) {
    return {
      status: "error",
      winner: null,
      ignored: [],
      rawContent: null,
      parsedConfig: null,
      loadError: project.error,
      resolved: defaults,
    };
  }

  const matches = findConfigFiles(project.absolutePath);

  if (matches.length === 0) {
    return {
      status: "not-found",
      winner: null,
      ignored: [],
      rawContent: null,
      parsedConfig: null,
      loadError: null,
      resolved: defaults,
    };
  }

  const winner = matches[0]!;
  const ignored = matches.slice(1);
  const rawContent = readConfigRawContent(winner.path);

  try {
    const loaded = loadConfigFile(winner, project.absolutePath);
    const parsedConfig = normalizeLoadedConfig(loaded);

    return {
      status: "found",
      winner,
      ignored,
      rawContent,
      parsedConfig,
      loadError: null,
      resolved: buildResolvedConfig(parsedConfig, project.absolutePath),
    };
  } catch (error) {
    return {
      status: "error",
      winner,
      ignored,
      rawContent,
      parsedConfig: null,
      loadError: error instanceof Error ? error.message : "Failed to load config.",
      resolved: defaults,
    };
  }
}

export function resolveStudioAiCredentials(config: StudioConfigDiscovery, projectPath: string): {
  apiKey: string | null;
  model: string | null;
} {
  const parsedConfig = isStudioConfigInput(config.parsedConfig) ? config.parsedConfig : {};
  const projectEnv = readProjectEnv(projectPath);

  return {
    apiKey:
      firstNonEmptyString(
        process.env.OPENROUTER_API_KEY,
        projectEnv.OPENROUTER_API_KEY,
        parsedConfig.ai?.apiKey,
      ) ?? null,
    model:
      firstNonEmptyString(
        parsedConfig.ai?.model,
        projectEnv.OPENROUTER_MODEL,
        process.env.OPENROUTER_MODEL,
      ) ?? null,
  };
}

export function findConfigFiles(projectPath: string): StudioConfigFileMatch[] {
  return CONFIG_FILE_NAMES.map((fileName) => path.join(projectPath, fileName))
    .filter((candidatePath) => existsSync(candidatePath))
    .map((candidatePath) => ({
      path: candidatePath,
      type: getConfigFileType(candidatePath),
    }));
}

function getConfigFileType(filePath: string): StudioConfigFileType {
  return filePath.endsWith(".json") ? "json" : "jiti";
}

function readConfigRawContent(filePath: string): string | null {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function loadConfigFile(match: StudioConfigFileMatch, projectPath: string): unknown {
  if (match.type === "json") {
    return JSON.parse(readFileSync(match.path, "utf8"));
  }

  const jiti = createJiti(projectPath, {
    interopDefault: true,
    moduleCache: false,
    fsCache: false,
  });

  return jiti(match.path);
}

function normalizeLoadedConfig(value: unknown): StudioConfigInput {
  const normalized =
    value &&
    typeof value === "object" &&
    "default" in value &&
    (value as { default?: unknown }).default !== undefined
      ? (value as { default: unknown }).default
      : value;

  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
    throw new Error("Config file did not export an object.");
  }

  return normalized as StudioConfigInput;
}

function isStudioConfigInput(value: unknown): value is StudioConfigInput {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function buildResolvedConfig(
  input: StudioConfigInput,
  projectPath: string,
): StudioResolvedConfigSummary {
  const file = mergeFileConfig(input.file, input.logDir, projectPath);
  const logDir = file.dir || path.join(projectPath, "logs");

  return {
    pretty: input.pretty ?? true,
    level: input.level ?? "info",
    logDir,
    file,
    clientLogging: mergeClientLoggingConfig(input.clientLogging),
    ai: mergeAiConfig(input.ai, projectPath),
    connectors: mergeConnectorsConfig(input.connectors, projectPath),
  };
}

function mergeAiConfig(
  input: StudioConfigInput["ai"],
  projectPath: string,
): StudioAiSummary {
  const projectEnv = readProjectEnv(projectPath);
  const configuredApiKey = firstNonEmptyString(
    process.env.OPENROUTER_API_KEY,
    projectEnv.OPENROUTER_API_KEY,
    input?.apiKey,
  );
  const apiKeySource: StudioAiSummary["apiKeySource"] =
    typeof process.env.OPENROUTER_API_KEY === "string" && process.env.OPENROUTER_API_KEY.trim().length > 0
      ? "process-env"
      : typeof projectEnv.OPENROUTER_API_KEY === "string" && projectEnv.OPENROUTER_API_KEY.trim().length > 0
        ? "project-env"
        : typeof input?.apiKey === "string" && input.apiKey.trim().length > 0
          ? "config"
          : "missing";
  const configuredModel = firstNonEmptyString(
    input?.model,
    projectEnv.OPENROUTER_MODEL,
    process.env.OPENROUTER_MODEL,
  ) ?? null;
  const modelSource: StudioAiSummary["modelSource"] =
    typeof input?.model === "string" && input.model.trim().length > 0
      ? "config"
      : typeof projectEnv.OPENROUTER_MODEL === "string" && projectEnv.OPENROUTER_MODEL.trim().length > 0
        ? "project-env"
        : typeof process.env.OPENROUTER_MODEL === "string" && process.env.OPENROUTER_MODEL.trim().length > 0
          ? "process-env"
          : "missing";

  return {
    apiKeyConfigured: typeof configuredApiKey === "string" && configuredApiKey.length > 0,
    apiKeySource,
    model: configuredModel,
    modelSource,
    enabled:
      typeof configuredApiKey === "string" &&
      configuredApiKey.length > 0 &&
      typeof configuredModel === "string" &&
      configuredModel.length > 0,
  };
}

function mergeFileConfig(
  input: StudioConfigInput["file"],
  logDir: string | undefined,
  projectPath: string,
): StudioLogFileSummary {
  const resolvedDir = resolveProjectPath(
    firstNonEmptyString(input?.dir, logDir) ?? "logs",
    projectPath,
  );
  const resolvedArchiveDir = resolveProjectPath(
    firstNonEmptyString(input?.archiveDir) ?? path.join(resolvedDir, "archive"),
    projectPath,
  );

  return {
    enabled: input?.enabled ?? DEFAULT_FILE_CONFIG.enabled,
    dir: resolvedDir,
    archiveDir: resolvedArchiveDir,
    format: "ndjson",
    rotation: {
      enabled: input?.rotation?.enabled ?? DEFAULT_ROTATION_CONFIG.enabled,
      maxSizeBytes: input?.rotation?.maxSizeBytes ?? DEFAULT_ROTATION_CONFIG.maxSizeBytes,
      maxArchives: input?.rotation?.maxArchives ?? DEFAULT_ROTATION_CONFIG.maxArchives,
      compress: input?.rotation?.compress ?? DEFAULT_ROTATION_CONFIG.compress,
    },
  };
}

function mergeClientLoggingConfig(
  input: StudioConfigInput["clientLogging"],
): StudioClientLoggingSummary {
  if (typeof input === "boolean") {
    return {
      enabled: input,
      path: DEFAULT_CLIENT_LOGGING_CONFIG.path,
    };
  }

  return {
    enabled: input?.enabled ?? DEFAULT_CLIENT_LOGGING_CONFIG.enabled,
    path: input?.path ?? DEFAULT_CLIENT_LOGGING_CONFIG.path,
  };
}

function mergeConnectorsConfig(
  input: StudioConfigInput["connectors"],
  projectPath: string,
): StudioResolvedConnectorsSummary {
  return {
    posthog: mergePostHogConnector(input?.posthog, projectPath),
    sentry: mergeSentryConnector(input?.sentry),
    otlp: mergeOtlpConnectors(input?.otlp, projectPath),
  };
}

function mergePostHogConnector(
  input: PostHogConnectorInput | undefined,
  projectPath: string,
): StudioResolvedPostHogConnectorSummary {
  const enabled = input?.enabled ?? false;
  const projectKey = input?.projectKey;
  const errorTrackingMode = input?.errorTracking?.mode ?? "auto";
  const errorTrackingEnabled = input?.errorTracking?.enabled ?? enabled;
  const errorTrackingReady =
    enabled &&
    errorTrackingEnabled &&
    typeof projectKey === "string" &&
    projectKey.trim().length > 0;

  return {
    enabled,
    mode: input?.mode ?? "auto",
    projectKey,
    host: input?.host ?? DEFAULT_POSTHOG_HOST,
    serviceName: input?.serviceName ?? findNearestPackageName(projectPath) ?? DEFAULT_CONNECTOR_SERVICE_NAME,
    errorTracking: {
      enabled: errorTrackingEnabled,
      mode: errorTrackingMode,
      enableExceptionAutocapture:
        input?.errorTracking?.enableExceptionAutocapture ?? errorTrackingMode === "auto",
      ready: errorTrackingReady,
      status: errorTrackingReady ? "enabled" : "missing",
    },
  };
}

function mergeSentryConnector(
  input: SentryConnectorInput | undefined,
): StudioResolvedSentryConnectorSummary {
  const enabled = input?.enabled ?? false;
  const dsn = input?.dsn;
  const ready = enabled && typeof dsn === "string" && dsn.trim().length > 0;

  return {
    enabled,
    mode: input?.mode ?? "auto",
    dsn,
    environment: input?.environment,
    release: input?.release,
    ready,
    status: ready ? "enabled" : "missing",
  };
}

function mergeOtlpConnectors(
  input: OtlpConnectorInput[] | undefined,
  projectPath: string,
): StudioResolvedOtlpConnectorSummary[] {
  const source = input ?? [];
  const deduped = new Map<string, StudioResolvedOtlpConnectorSummary>();

  for (const connector of source) {
    if (!connector?.name) {
      continue;
    }

    deduped.set(connector.name, {
      name: connector.name,
      enabled: connector.enabled ?? false,
      mode: connector.mode ?? "auto",
      endpoint: connector.endpoint,
      headers: connector.headers ?? {},
      auth: connector.auth,
      serviceName:
        connector.serviceName ?? findNearestPackageName(projectPath) ?? DEFAULT_CONNECTOR_SERVICE_NAME,
      ready:
        (connector.enabled ?? false) &&
        typeof connector.endpoint === "string" &&
        /^https?:\/\//.test(connector.endpoint),
      status:
        (connector.enabled ?? false) &&
        typeof connector.endpoint === "string" &&
        /^https?:\/\//.test(connector.endpoint)
          ? "enabled"
          : "missing",
    });
  }

  return Array.from(deduped.values());
}

function resolveProjectPath(candidate: string, projectPath: string): string {
  return path.isAbsolute(candidate) ? candidate : path.resolve(projectPath, candidate);
}

function firstNonEmptyString(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return undefined;
}

function readProjectEnv(projectPath: string): Record<string, string> {
  const envPath = path.join(projectPath, ".env");

  if (!existsSync(envPath)) {
    return {};
  }

  try {
    const contents = readFileSync(envPath, "utf8");
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
  } catch {
    return {};
  }
}

function findNearestPackageName(startDir: string): string | undefined {
  let currentDir = startDir;

  while (true) {
    const packageJsonPath = path.join(currentDir, "package.json");

    if (existsSync(packageJsonPath)) {
      try {
        const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { name?: unknown };

        if (typeof parsed.name === "string" && parsed.name.trim().length > 0) {
          return parsed.name;
        }
      } catch {
        return undefined;
      }
    }

    const parentDir = path.dirname(currentDir);

    if (parentDir === currentDir) {
      return undefined;
    }

    currentDir = parentDir;
  }
}
