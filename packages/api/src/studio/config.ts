import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { createJiti } from "jiti";

import type {
  StudioAiSummary,
  StudioResolvedBetterStackConnectorSummary,
  StudioClientLoggingSummary,
  StudioConfigDiscovery,
  StudioConfigFileMatch,
  StudioConfigFileType,
  StudioResolvedDatabuddyConnectorSummary,
  StudioLogFileSummary,
  StudioLogRotationSummary,
  StudioProjectResolution,
  StudioResolvedConfigSummary,
  StudioResolvedConnectorsSummary,
  StudioResolvedOtlpConnectorSummary,
  StudioResolvedPostHogConnectorSummary,
  StudioResolvedSentryConnectorSummary,
} from "./types";

// Cache jiti-loaded configs by absolute config path + mtime so that concurrent
// tRPC queries on page load share the same loaded module (and the same ORM
// runtime objects like PrismaClient) instead of each spawning a fresh one.
const jitiConfigCache = new Map<string, { mtime: number; result: unknown }>();

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
  destination?: "file" | "database";
  database?: {
    dialect?: string;
    adapter?: {
      type?: string;
      client?: unknown;
      model?: string;
      db?: unknown;
      table?: unknown;
      dialect?: string;
    };
  };
  connectors?: {
    betterstack?: {
      enabled?: boolean;
      mode?: string;
      sourceToken?: string;
      ingestingHost?: string;
    };
    databuddy?: {
      enabled?: boolean;
      mode?: string;
      apiKey?: string;
      websiteId?: string;
    };
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

type BetterStackConnectorInput = NonNullable<NonNullable<StudioConfigInput["connectors"]>["betterstack"]>;
type DatabuddyConnectorInput = NonNullable<NonNullable<StudioConfigInput["connectors"]>["databuddy"]>;
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
      parsedConfig: sanitizeConfigForStudio(parsedConfig),
      loadError: null,
      resolved: buildResolvedConfig(parsedConfig, project.absolutePath, winner.type),
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

  // Return cached result when the config file hasn't changed on disk.
  // This prevents each parallel tRPC query from re-executing the module via
  // jiti, which would create multiple ORM client instances (e.g. PrismaClient)
  // and exhaust the database connection pool.
  try {
    const mtime = statSync(match.path).mtimeMs;
    const cached = jitiConfigCache.get(match.path);

    if (cached && cached.mtime === mtime) {
      return cached.result;
    }
  } catch {
    // statSync failed — fall through to a fresh load
  }

  // Inject the project's .env into process.env before jiti executes the config.
  // This lets runtime adapters (e.g. new PrismaClient(), drizzle()) pick up
  // DATABASE_URL and other connection vars without the user having to set them
  // globally. We only set keys that aren't already present so we never override
  // the caller's own environment.
  const projectEnv = readProjectEnv(projectPath);

  for (const [key, value] of Object.entries(projectEnv)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  const jiti = createJiti(projectPath, {
    interopDefault: true,
    moduleCache: false,
    fsCache: false,
  });

  const result = jiti(match.path);

  try {
    const mtime = statSync(match.path).mtimeMs;
    jitiConfigCache.set(match.path, { mtime, result });
  } catch {
    // couldn't stat after load — skip caching, not fatal
  }

  return result;
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

function sanitizeConfigForStudio(value: StudioConfigInput): StudioConfigInput {
  return {
    ...value,
    database: value.database
      ? {
          ...value.database,
          adapter: value.database.adapter
            ? {
                type: value.database.adapter.type,
                model: value.database.adapter.model,
                dialect: value.database.adapter.dialect,
              }
            : undefined,
        }
      : undefined,
  };
}

function isStudioConfigInput(value: unknown): value is StudioConfigInput {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mergeDatabaseConfig(
  input: StudioConfigInput,
  configFileType: StudioConfigFileType | null,
): import("./types").StudioDatabaseConfigSummary {
  void configFileType;
  const destination = input.destination ?? "file";

  if (destination !== "database") {
    return {
      enabled: false,
      ready: false,
      dialect: null,
      adapterKind: null,
      model: null,
      label: null,
      status: "missing",
    };
  }

  const adapter = input.database?.adapter;
  const rawAdapterType = typeof adapter?.type === "string" && adapter.type ? adapter.type : null;
  const adapterKind: "prisma" | "drizzle" | null =
    rawAdapterType === "prisma" || rawAdapterType === "drizzle" ? rawAdapterType : null;
  const rawDialect = firstNonEmptyString(input.database?.dialect, adapter?.dialect);
  const dialect: "postgres" | "mysql" | null =
    rawDialect === "postgres" || rawDialect === "mysql" ? rawDialect : null;
  const ready = dialect !== null;

  if (!adapterKind) {
    return {
      enabled: true,
      ready,
      dialect,
      adapterKind: null,
      model: null,
      label: null,
      status: ready ? "enabled" : "invalid",
    };
  }

  const model =
    adapterKind === "prisma"
      ? (typeof adapter?.model === "string" && adapter.model ? adapter.model : "blypLog")
      : null;
  const label = adapterKind === "prisma" ? (model ?? "blypLog") : "blyp_logs";
  const status: import("./types").StudioDatabaseConfigSummary["status"] =
    ready
      ? "enabled"
      : "invalid";

  return {
    enabled: true,
    ready,
    dialect,
    adapterKind,
    model,
    label,
    status,
  };
}

function buildResolvedConfig(
  input: StudioConfigInput,
  projectPath: string,
  configFileType: StudioConfigFileType | null = null,
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
    destination: input.destination ?? "file",
    database: mergeDatabaseConfig(input, configFileType),
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
    betterstack: mergeBetterStackConnector(input?.betterstack),
    databuddy: mergeDatabuddyConnector(input?.databuddy),
    posthog: mergePostHogConnector(input?.posthog, projectPath),
    sentry: mergeSentryConnector(input?.sentry),
    otlp: mergeOtlpConnectors(input?.otlp, projectPath),
  };
}

function mergeBetterStackConnector(
  input: BetterStackConnectorInput | undefined,
): StudioResolvedBetterStackConnectorSummary {
  const enabled = input?.enabled ?? false;
  const sourceToken = input?.sourceToken;
  const ingestingHost = input?.ingestingHost;
  const ready =
    enabled &&
    typeof sourceToken === "string" &&
    sourceToken.trim().length > 0 &&
    typeof ingestingHost === "string" &&
    /^https?:\/\//.test(ingestingHost);

  return {
    enabled,
    mode: input?.mode ?? "auto",
    sourceToken,
    ingestingHost,
    ready,
    status: ready ? "enabled" : "missing",
  };
}

function mergeDatabuddyConnector(
  input: DatabuddyConnectorInput | undefined,
): StudioResolvedDatabuddyConnectorSummary {
  const enabled = input?.enabled ?? false;
  const apiKey = input?.apiKey;
  const websiteId = input?.websiteId;
  const ready =
    enabled &&
    typeof apiKey === "string" &&
    apiKey.trim().length > 0 &&
    typeof websiteId === "string" &&
    websiteId.trim().length > 0;

  return {
    enabled,
    mode: input?.mode ?? "auto",
    apiKey,
    websiteId,
    ready,
    status: ready ? "enabled" : "missing",
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

export function readProjectEnv(projectPath: string): Record<string, string> {
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
