import { existsSync, readFileSync, statSync } from "node:fs";
import { writeFile } from "node:fs/promises";
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
  StudioCustomSectionDefinition,
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
  studio?: {
    sections?: Array<{
      name?: string;
      icon?: string;
      match?: {
        fields?: string[];
        routes?: string[];
        messages?: string[];
      };
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
    studio: value.studio
      ? {
          sections: normalizeCustomSections(value.studio.sections),
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
    studio: {
      sections: normalizeCustomSections(input.studio?.sections),
    },
    destination: input.destination ?? "file",
    database: mergeDatabaseConfig(input, configFileType),
  };
}

function normalizeCustomSections(
  input:
    | Array<{
        name?: string;
        icon?: string;
        match?: {
          fields?: string[];
          routes?: string[];
          messages?: string[];
        };
      }>
    | undefined,
): StudioCustomSectionDefinition[] {
  const source = Array.isArray(input) ? input : [];
  const sections: StudioCustomSectionDefinition[] = [];

  for (const section of source) {
    if (!section || typeof section.name !== "string" || section.name.trim().length === 0) {
      continue;
    }

    const slug = slugifySectionName(section.name);
    sections.push({
      id: `custom:${slug}`,
      name: section.name.trim(),
      icon: typeof section.icon === "string" && section.icon.trim().length > 0 ? section.icon.trim() : "✨",
      match: {
        fields: uniqueStrings(section.match?.fields),
        routes: uniqueStrings(section.match?.routes),
        messages: uniqueStrings(section.match?.messages),
      },
    });
  }

  return sections;
}

function uniqueStrings(values: string[] | undefined): string[] {
  return Array.from(
    new Set(
      (values ?? [])
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

function slugifySectionName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || "section";
}

export async function saveStudioCustomSection(input: {
  projectPath: string;
  name: string;
  icon: string;
  match: {
    fields?: string[];
    routes?: string[];
    messages?: string[];
  };
}): Promise<StudioCustomSectionDefinition[]> {
  const project = {
    absolutePath: input.projectPath,
    valid: true,
  } as StudioProjectResolution;
  const discovered = await discoverStudioConfig(project);
  const existing = discovered.resolved.studio.sections;
  const nextSection = normalizeCustomSections([
    {
      name: input.name,
      icon: input.icon,
      match: input.match,
    },
  ])[0];

  if (!nextSection) {
    return existing;
  }

  const nextSections = [
    ...existing.filter((section) => section.id !== nextSection.id),
    nextSection,
  ];

  const targetPath = discovered.winner?.path ?? path.join(input.projectPath, "blyp.config.json");
  const targetType = discovered.winner?.type ?? "json";

  if (targetType === "json") {
    const parsed = discovered.rawContent ? (JSON.parse(discovered.rawContent) as Record<string, unknown>) : {};
    const nextConfig = {
      ...parsed,
      studio: {
        ...(isPlainObject(parsed.studio) ? parsed.studio : {}),
        sections: nextSections.map((section) => ({
          name: section.name,
          icon: section.icon,
          match: section.match,
        })),
      },
    };
    await writeFile(targetPath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");
    return nextSections;
  }

  const raw = discovered.rawContent?.trim() || "export default {}";
  const sectionsSnippet = serializeSectionsForJs(nextSections);
  let updated = raw;

  if (hasStudioSectionsArray(raw)) {
    updated = replaceStudioSectionsArray(raw, sectionsSnippet);
  } else if (/studio\s*:\s*\{/m.test(raw)) {
    updated = raw.replace(/studio\s*:\s*\{/m, `studio: {\n    sections: ${sectionsSnippet},`);
  } else if (/export\s+default\s*\{/m.test(raw)) {
    updated = raw.replace(/export\s+default\s*\{/m, `export default {\n  studio: {\n    sections: ${sectionsSnippet},\n  },`);
  } else {
    updated = `export default {\n  studio: {\n    sections: ${sectionsSnippet},\n  },\n};\n`;
  }

  await writeFile(targetPath, `${updated.replace(/\n*$/, "")}\n`, "utf8");
  return nextSections;
}

function hasStudioSectionsArray(source: string): boolean {
  const studioKey = source.search(/studio\s*:/m);
  if (studioKey < 0) {
    return false;
  }

  const studioObjectStart = source.indexOf("{", studioKey);
  if (studioObjectStart < 0) {
    return false;
  }

  const studioObjectEnd = findMatchingBracket(source, studioObjectStart, "{", "}");
  if (studioObjectEnd < 0) {
    return false;
  }

  const studioSource = source.slice(studioObjectStart, studioObjectEnd + 1);
  return /sections\s*:\s*\[/m.test(studioSource);
}

function serializeSectionsForJs(sections: StudioCustomSectionDefinition[]): string {
  if (sections.length === 0) {
    return "[]";
  }

  const items = sections.map((section) =>
    [
      "      {",
      `        name: ${JSON.stringify(section.name)},`,
      `        icon: ${JSON.stringify(section.icon)},`,
      "        match: {",
      `          fields: ${JSON.stringify(section.match.fields)},`,
      `          routes: ${JSON.stringify(section.match.routes)},`,
      `          messages: ${JSON.stringify(section.match.messages)},`,
      "        },",
      "      }",
    ].join("\n"),
  );

  return `[\n${items.join(",\n")}\n    ]`;
}

function replaceStudioSectionsArray(source: string, sectionsSnippet: string): string {
  const studioKey = source.search(/studio\s*:/m);
  if (studioKey < 0) {
    throw new Error("Studio config rewrite could not find studio.");
  }

  const studioObjectStart = source.indexOf("{", studioKey);
  if (studioObjectStart < 0) {
    throw new Error("Studio config rewrite could not find studio object.");
  }

  const studioObjectEnd = findMatchingBracket(source, studioObjectStart, "{", "}");
  if (studioObjectEnd < 0) {
    throw new Error("Studio config rewrite could not find the end of studio.");
  }

  const studioSource = source.slice(studioObjectStart, studioObjectEnd + 1);
  const localSectionsKey = studioSource.search(/sections\s*:/m);
  const sectionsKey =
    localSectionsKey < 0 ? -1 : studioObjectStart + localSectionsKey;
  if (sectionsKey < 0) {
    throw new Error("Studio config rewrite could not find studio.sections.");
  }

  const arrayStart = source.indexOf("[", sectionsKey);
  if (arrayStart < 0) {
    throw new Error("Studio config rewrite could not find studio.sections array.");
  }

  const arrayEnd = findMatchingBracket(source, arrayStart, "[", "]");
  if (arrayEnd < 0) {
    throw new Error("Studio config rewrite could not find the end of studio.sections.");
  }

  return `${source.slice(0, arrayStart)}${sectionsSnippet}${source.slice(arrayEnd + 1)}`;
}

function findMatchingBracket(
  source: string,
  startIndex: number,
  openChar: "[" | "{",
  closeChar: "]" | "}",
): number {
  let depth = 0;
  let quote: "'" | "\"" | "`" | null = null;
  let escaping = false;

  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];

    if (!char) {
      continue;
    }

    if (quote) {
      if (escaping) {
        escaping = false;
        continue;
      }
      if (char === "\\") {
        escaping = true;
        continue;
      }
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "'" || char === "\"" || char === "`") {
      quote = char;
      continue;
    }

    if (char === openChar) {
      depth += 1;
      continue;
    }

    if (char === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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
