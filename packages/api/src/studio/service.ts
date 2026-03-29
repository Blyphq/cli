import path from "node:path";

import {
  replyWithAssistant,
  describeSelectionWithAssistant,
  streamAssistant,
  type StudioAssistantStreamResult,
} from "./assistant";
import { generateAssistantText, getAssistantStatus } from "./assistant-provider";
import { analyzeAuthRecords } from "./auth";
import { buildBackgroundJobRunDetail, buildBackgroundJobsOverview } from "./background-jobs";
import { analyzeDatabaseRecords } from "./database-section";
import {
  discoverStudioConfig,
  resolveStudioAiCredentials,
  saveStudioCustomSection,
} from "./config";
import {
  buildSyntheticDatabaseFile,
  loadDatabaseRecords,
} from "./database";
import { buildErrorGroupDetail, buildErrorsPage } from "./errors";
import { getLogFacets } from "./facets";
import { buildGroupDetails } from "./grouping";
import { discoverLogFiles } from "./logs";
import { buildStudioOverview } from "./overview";
import { buildPaymentTraceDetail, buildPaymentsOverview } from "./payments";
import { loadProjectClaudeMd } from "./project-context";
import { resolveStudioProject } from "./project";
import { filterRecords, loadNormalizedRecords, queryLogs } from "./query";
import { buildDetectedSections } from "./sections";
import { createUnavailableSourceContext, resolveRecordSourceContext } from "./source";

import type {
  StudioAssistantMessage,
  StudioAssistantReplyInput,
  StudioAssistantStatus,
  StudioAuthOverview,
  StudioAuthQueryInput,
  StudioBackgroundJobRunDetail,
  StudioBackgroundJobsOverview,
  StudioBackgroundJobsQueryInput,
  StudioConfigDiscovery,
  StudioDatabaseOverview,
  StudioDatabaseQueryInput,
  StudioDetectedSection,
  StudioErrorGroupDetail,
  StudioLogDiscovery,
  StudioLogFacets,
  StudioErrorsPage,
  StudioLogsPage,
  StudioErrorsQueryInput,
  StudioLogsQueryInput,
  StudioMeta,
  StudioNormalizedRecord,
  StudioOverview,
  StudioOverviewQueryInput,
  StudioPaymentTraceDetail,
  StudioPaymentsOverview,
  StudioPaymentsQueryInput,
  StudioSourceContext,
  StudioStructuredGroupDetail,
} from "./types";

async function discoverLogSource(
  projectPath: string,
  config: StudioConfigDiscovery,
): Promise<StudioLogDiscovery> {
  if (config.resolved.destination === "database") {
    const syntheticFile = buildSyntheticDatabaseFile(config.resolved);

    return {
      logDir: config.resolved.file.dir,
      archiveDir: config.resolved.file.archiveDir,
      logDirExists: false,
      archiveDirExists: false,
      files: [syntheticFile],
      mode: "database",
      database: config.resolved.database,
    };
  }

  return discoverLogFiles(projectPath, config);
}

async function loadProjectRecords(
  projectPath: string,
  config: StudioConfigDiscovery,
  files: StudioLogDiscovery,
  filters: Pick<StudioLogsQueryInput, "level" | "type" | "from" | "to" | "search"> = {},
): Promise<{
  records: StudioNormalizedRecord[];
  scannedRecords: number;
  truncated: boolean;
}> {
  if (files.mode === "database") {
    return loadDatabaseRecords({ projectPath, config, input: filters });
  }

  return loadNormalizedRecords(files.files, projectPath);
}

export async function getStudioMeta(projectPath?: string): Promise<StudioMeta> {
  const project = await resolveStudioProject(projectPath);
  const config = await discoverStudioConfig(project);
  const logs = project.valid
    ? await discoverLogSource(project.absolutePath, config)
    : emptyLogDiscovery(config);
  const sections =
    project.valid
      ? await getStudioSections(project.absolutePath)
      : [];

  return {
    project,
    config: stripParsedConfig(config),
    sections,
    logs: {
      mode: logs.mode,
      database: logs.database,
      logDir: logs.logDir,
      archiveDir: logs.archiveDir,
      logDirExists: logs.logDirExists,
      archiveDirExists: logs.archiveDirExists,
      fileCount: logs.files.length,
      activeFileCount: logs.files.filter((file) => file.kind === "active").length,
      archiveFileCount: logs.files.filter((file) => file.kind === "archive").length,
    },
  };
}

export async function getStudioConfig(projectPath?: string): Promise<StudioConfigDiscovery> {
  const project = await resolveStudioProject(projectPath);
  const config = await discoverStudioConfig(project);
  return stripParsedConfig(config);
}

export async function getStudioFiles(projectPath?: string): Promise<StudioLogDiscovery> {
  const project = await resolveStudioProject(projectPath);
  const config = await discoverStudioConfig(project);

  if (!project.valid) {
    return emptyLogDiscovery(config);
  }

  return discoverLogSource(project.absolutePath, config);
}

export async function getStudioLogs(input: StudioLogsQueryInput): Promise<StudioLogsPage> {
  const { files, project, config } = await getStudioProjectFiles(input.projectPath);

  if (files.mode === "database") {
    const dbLoaded = await loadDatabaseRecords({
      projectPath: project.absolutePath,
      config,
      input,
    });

    return queryLogs({
      files: files.files,
      input,
      projectPath: project.absolutePath,
      customSections: config.resolved.studio.sections,
      preloaded: dbLoaded,
    });
  }

  return queryLogs({
    files: files.files,
    input,
    projectPath: project.absolutePath,
    customSections: config.resolved.studio.sections,
  });
}

export async function getStudioErrors(
  input: StudioErrorsQueryInput,
): Promise<StudioErrorsPage> {
  const { files, project, config } = await getStudioProjectFiles(input.projectPath);
  const candidateFiles = input.fileId
    ? files.files.filter((file) => file.id === input.fileId)
    : files.files;

  const loaded =
    files.mode === "database"
      ? await loadDatabaseRecords({
          projectPath: project.absolutePath,
          config,
          input,
        })
      : await loadProjectRecords(
          project.absolutePath,
          config,
          { ...files, files: candidateFiles },
          input,
        );

  return buildErrorsPage({
    records: loaded.records,
    query: input,
    customSections: config.resolved.studio.sections,
    scannedRecords: loaded.scannedRecords,
    truncated: loaded.truncated,
    projectPath: project.absolutePath,
  });
}

export async function getStudioSections(projectPath?: string): Promise<StudioDetectedSection[]> {
  const { files, project, config } = await getStudioProjectFiles(projectPath);
  if (!project.valid) {
    return [];
  }

  const loaded = await loadProjectRecords(project.absolutePath, config, files);
  return buildDetectedSections(loaded.records, config.resolved.studio.sections);
}

export async function getStudioOverview(
  input: StudioOverviewQueryInput,
): Promise<StudioOverview> {
  const { files, project, config } = await getStudioProjectFiles(input.projectPath);
  const candidateFiles = input.fileId
    ? files.files.filter((file) => file.id === input.fileId)
    : files.files;

  const loaded =
    files.mode === "database"
      ? await loadDatabaseRecords({
          projectPath: project.absolutePath,
          config,
          input,
        })
      : await loadProjectRecords(
          project.absolutePath,
          config,
          { ...files, files: candidateFiles },
          input,
        );

  const filtered = filterRecords(
    loaded.records,
    {
      fileId: input.fileId,
      from: input.from,
      to: input.to,
      search: input.search,
    },
    config.resolved.studio.sections,
  );
  const sections = buildDetectedSections(filtered, config.resolved.studio.sections);

  return buildStudioOverview({
    records: filtered,
    projectPath: project.absolutePath,
    generatedAt: new Date().toISOString(),
    sections,
    customSections: config.resolved.studio.sections,
  });
}

export async function getStudioAuth(input: StudioAuthQueryInput): Promise<StudioAuthOverview> {
  const { files, project, config } = await getStudioProjectFiles(input.projectPath);
  if (!project.valid) {
    return {
      stats: {
        loginAttemptsTotal: 0,
        loginSuccessCount: 0,
        loginFailureCount: 0,
        activeSessionCount: 0,
        authErrorCount: 0,
        suspiciousActivityCount: 0,
      },
      timeline: [],
      totalTimelineEvents: 0,
      suspiciousPatterns: [],
      users: [],
    };
  }

  const loaded = await loadProjectRecords(project.absolutePath, config, files, {
    from: input.from,
    to: input.to,
    search: input.search,
  });
  const filtered = filterRecords(
    loaded.records,
    {
      fileId: input.fileId,
      from: input.from,
      to: input.to,
      search: input.search,
      sectionId: input.sectionId,
    },
    config.resolved.studio.sections,
  );

  return analyzeAuthRecords(filtered, input);
}

export async function getStudioDatabase(
  input: StudioDatabaseQueryInput,
): Promise<StudioDatabaseOverview> {
  const { files, project, config } = await getStudioProjectFiles(input.projectPath);
  if (!project.valid) {
    return {
      stats: {
        totalQueries: 0,
        slowQueries: 0,
        failedQueries: 0,
        avgQueryTimeMs: null,
        activeTransactions: 0,
      },
      queries: [],
      totalQueries: 0,
      slowQueries: [],
      transactions: [],
      migrationEvents: [],
    };
  }

  const loaded = await loadProjectRecords(project.absolutePath, config, files, {
    from: input.from,
    to: input.to,
    search: input.search,
  });
  const filtered = filterRecords(
    loaded.records,
    {
      fileId: input.fileId,
      from: input.from,
      to: input.to,
      search: input.search,
      sectionId: "database",
    },
    config.resolved.studio.sections,
  );

  return analyzeDatabaseRecords(filtered, input);
}

export async function getStudioBackgroundJobs(
  input: StudioBackgroundJobsQueryInput,
): Promise<StudioBackgroundJobsOverview> {
  const { files, project, config } = await getStudioProjectFiles(input.projectPath);
  if (!project.valid) {
    return {
      stats: {
        jobsDetected: 0,
        totalRuns: 0,
        successRate: 0,
        failedRuns: 0,
        mostCommonFailureReason: null,
        avgDurationMs: null,
      },
      runs: [],
      performance: [],
      totalRuns: 0,
      offset: input.offset ?? 0,
      limit: input.limit ?? 100,
      truncated: false,
    };
  }

  const loaded = await loadProjectRecords(project.absolutePath, config, files, {
    from: input.from,
    to: input.to,
    search: input.search,
  });
  const filtered = filterRecords(
    loaded.records,
    {
      fileId: input.fileId,
      from: input.from,
      to: input.to,
      search: input.search,
      sectionId: "background",
    },
    config.resolved.studio.sections,
  );

  return buildBackgroundJobsOverview({
    records: filtered,
    query: input,
    customSections: config.resolved.studio.sections,
    truncated: loaded.truncated,
  });
}

export async function getStudioBackgroundJobRun(input: {
  projectPath?: string;
  runId: string;
  fileId?: string;
  from?: string;
  to?: string;
  search?: string;
}): Promise<StudioBackgroundJobRunDetail | null> {
  const { files, project, config } = await getStudioProjectFiles(input.projectPath);
  if (!project.valid) {
    return null;
  }

  const loaded = await loadProjectRecords(project.absolutePath, config, files, {
    from: input.from,
    to: input.to,
    search: input.search,
  });
  const filtered = filterRecords(
    loaded.records,
    {
      fileId: input.fileId,
      from: input.from,
      to: input.to,
      search: input.search,
      sectionId: "background",
    },
    config.resolved.studio.sections,
  );

  return buildBackgroundJobRunDetail({
    runId: input.runId,
    records: filtered,
    customSections: config.resolved.studio.sections,
  });
}

export async function getStudioPayments(
  input: StudioPaymentsQueryInput,
): Promise<StudioPaymentsOverview> {
  const { files, project, config } = await getStudioProjectFiles(input.projectPath);
  if (!project.valid) {
    return {
      stats: {
        checkoutAttempts: 0,
        successRate: 0,
        successRateTrend: "flat",
        successRateDeltaPercent: null,
        successRateComparisonWindowLabel: "vs previous session window",
        failedPayments: 0,
        mostCommonFailureReason: null,
        revenueProcessed: null,
        currency: null,
        webhookEvents: 0,
      },
      traces: [],
      failures: [],
      webhooks: [],
      totalTraces: 0,
      offset: input.offset ?? 0,
      limit: input.limit ?? 100,
      truncated: false,
    };
  }

  const loaded = await loadProjectRecords(project.absolutePath, config, files, {
    from: input.from,
    to: input.to,
    search: input.search,
  });
  const filtered = filterRecords(
    loaded.records,
    {
      fileId: input.fileId,
      from: input.from,
      to: input.to,
      search: input.search,
      sectionId: "payments",
    },
    config.resolved.studio.sections,
  );

  return buildPaymentsOverview({
    records: filtered,
    query: input,
    customSections: config.resolved.studio.sections,
    truncated: loaded.truncated,
  });
}

export async function getStudioPaymentTrace(input: {
  projectPath?: string;
  traceId: string;
  fileId?: string;
  from?: string;
  to?: string;
  search?: string;
}): Promise<StudioPaymentTraceDetail | null> {
  const { files, project, config } = await getStudioProjectFiles(input.projectPath);
  if (!project.valid) {
    return null;
  }

  const loaded = await loadProjectRecords(project.absolutePath, config, files, {
    from: input.from,
    to: input.to,
    search: input.search,
  });
  const filtered = filterRecords(
    loaded.records,
    {
      fileId: input.fileId,
      from: input.from,
      to: input.to,
      search: input.search,
      sectionId: "payments",
    },
    config.resolved.studio.sections,
  );

  return buildPaymentTraceDetail({
    traceId: input.traceId,
    records: filtered,
    customSections: config.resolved.studio.sections,
  });
}

export async function addStudioCustomSection(input: {
  projectPath?: string;
  name: string;
  icon: string;
  match: {
    fields?: string[];
    routes?: string[];
    messages?: string[];
  };
}): Promise<{ sections: StudioDetectedSection[] }> {
  const project = await resolveStudioProject(input.projectPath);
  if (!project.valid) {
    return { sections: [] };
  }

  await saveStudioCustomSection({
    projectPath: project.absolutePath,
    name: input.name,
    icon: input.icon,
    match: input.match,
  });

  return {
    sections: await getStudioSections(project.absolutePath),
  };
}

export async function getStudioFacets(
  input: Pick<
    StudioLogsQueryInput,
    "projectPath" | "level" | "search" | "fileId" | "from" | "to" | "sectionId"
  >,
): Promise<StudioLogFacets> {
  const { files, project, config } = await getStudioProjectFiles(input.projectPath);
  const loaded = await loadProjectRecords(project.absolutePath, config, files, input);

  return getLogFacets(loaded.records, input, config.resolved.studio.sections);
}

export async function getStudioGroup(input: {
  projectPath?: string;
  groupId: string;
}): Promise<StudioStructuredGroupDetail | null> {
  const { files, project, config } = await getStudioProjectFiles(input.projectPath);
  const loaded = await loadProjectRecords(project.absolutePath, config, files);
  const groups = buildGroupDetails(loaded.records);

  return groups.get(input.groupId) ?? null;
}

export async function getStudioErrorGroup(input: {
  projectPath?: string;
  fingerprint: string;
}): Promise<StudioErrorGroupDetail | null> {
  const { files, project, config } = await getStudioProjectFiles(input.projectPath);
  const loaded = await loadProjectRecords(project.absolutePath, config, files);

  return buildErrorGroupDetail({
    records: loaded.records,
    fingerprint: input.fingerprint,
    customSections: config.resolved.studio.sections,
    projectPath: project.absolutePath,
  });
}

export async function getStudioRecord(input: {
  projectPath?: string;
  recordId: string;
}) {
  const { files, project, config } = await getStudioProjectFiles(input.projectPath);
  const loaded = await loadProjectRecords(project.absolutePath, config, files);

  return loaded.records.find((record) => record.id === input.recordId) ?? null;
}

export async function getStudioRecordSource(input: {
  projectPath?: string;
  recordId: string;
}): Promise<StudioSourceContext> {
  const { files, project, config } = await getStudioProjectFiles(input.projectPath);
  const loaded = await loadProjectRecords(project.absolutePath, config, files);
  const record = loaded.records.find((candidate) => candidate.id === input.recordId);

  if (!record) {
    return createUnavailableSourceContext("no_location");
  }

  return resolveRecordSourceContext(project.absolutePath, record);
}

export async function getStudioAssistantStatus(projectPath?: string): Promise<StudioAssistantStatus> {
  const project = await resolveStudioProject(projectPath);
  const config = await discoverStudioConfig(project);
  const status = getAssistantStatus(config.resolved.ai);
  const claudeMd = await loadProjectClaudeMd(project.absolutePath);

  return {
    ...status,
    projectContext: {
      claudeMdPresent: claudeMd.exists,
      claudeMdPath: claudeMd.exists ? path.join(project.absolutePath, "CLAUDE.md") : null,
    },
  };
}

export async function generateStudioChatTitle(input: {
  projectPath?: string;
  prompt: string;
}): Promise<{ title: string }> {
  const project = await resolveStudioProject(input.projectPath);
  const config = await discoverStudioConfig(project);
  const ai = resolveStudioAiCredentials(config, project.absolutePath);
  const title = await generateAssistantText({
    apiKey: ai.apiKey ?? "",
    model: "x-ai/grok-4.1-fast",
    system:
      "Generate a concise chat title from the user's first message. Return only the title, no quotes, no markdown, no punctuation wrappers, and keep it under 48 characters.",
    prompt: input.prompt,
  });

  return {
    title: sanitizeGeneratedChatTitle(title),
  };
}

export async function replyWithStudioAssistant(
  input: StudioAssistantReplyInput,
): Promise<StudioAssistantMessage> {
  const project = await resolveStudioProject(input.projectPath);
  const config = await discoverStudioConfig(project);
  const files = project.valid
    ? await discoverLogSource(project.absolutePath, config)
    : emptyLogDiscovery(config);
  const ai = resolveStudioAiCredentials(config, project.absolutePath);

  let preloadedRecords: StudioNormalizedRecord[] | undefined;
  const claudeMd = await loadProjectClaudeMd(project.absolutePath);

  if (files.mode === "database" && project.valid) {
    const loaded = await loadProjectRecords(project.absolutePath, config, files);
    preloadedRecords = loaded.records;
  }

  return replyWithAssistant({
    ...input,
    projectPath: project.absolutePath,
    projectContextMarkdown: claudeMd.managedContent ?? claudeMd.content,
    ai,
    files: files.files,
    preloadedRecords,
  });
}

export async function describeStudioSelection(
  input: StudioAssistantReplyInput,
): Promise<StudioAssistantMessage> {
  const project = await resolveStudioProject(input.projectPath);
  const config = await discoverStudioConfig(project);
  const files = project.valid
    ? await discoverLogSource(project.absolutePath, config)
    : emptyLogDiscovery(config);
  const ai = resolveStudioAiCredentials(config, project.absolutePath);

  let preloadedRecords: StudioNormalizedRecord[] | undefined;
  const claudeMd = await loadProjectClaudeMd(project.absolutePath);

  if (files.mode === "database" && project.valid) {
    const loaded = await loadProjectRecords(project.absolutePath, config, files);
    preloadedRecords = loaded.records;
  }

  return describeSelectionWithAssistant({
    ...input,
    projectPath: project.absolutePath,
    projectContextMarkdown: claudeMd.managedContent ?? claudeMd.content,
    ai,
    files: files.files,
    preloadedRecords,
  });
}

export async function streamStudioAssistant(input: {
  projectPath?: string;
  filters: StudioAssistantReplyInput["filters"];
  selectedRecordId?: string;
  selectedGroupId?: string;
  selectedBackgroundRunId?: string;
  selectedPaymentTraceId?: string;
  messages: import("ai").UIMessage[];
  mode?: "chat" | "describe-selection";
  model?: string;
}): Promise<StudioAssistantStreamResult> {
  const project = await resolveStudioProject(input.projectPath);
  const config = await discoverStudioConfig(project);
  const files = project.valid
    ? await discoverLogSource(project.absolutePath, config)
    : emptyLogDiscovery(config);
  const ai = resolveStudioAiCredentials(config, project.absolutePath);

  let preloadedRecords: StudioNormalizedRecord[] | undefined;
  const claudeMd = await loadProjectClaudeMd(project.absolutePath);

  if (files.mode === "database" && project.valid) {
    const loaded = await loadProjectRecords(project.absolutePath, config, files);
    preloadedRecords = loaded.records;
  }

  return streamAssistant({
    projectPath: project.absolutePath,
    projectContextMarkdown: claudeMd.managedContent ?? claudeMd.content,
    files: files.files,
    filters: input.filters,
    selectedRecordId: input.selectedRecordId,
    selectedGroupId: input.selectedGroupId,
    selectedBackgroundRunId: input.selectedBackgroundRunId,
    selectedPaymentTraceId: input.selectedPaymentTraceId,
    messages: input.messages,
    mode: input.mode,
    preloadedRecords,
    ai: {
      apiKey: ai.apiKey,
      model: ai.model,
      overrideModel: input.model,
    },
  });
}

function emptyLogDiscovery(config: StudioConfigDiscovery): StudioLogDiscovery {
  return {
    logDir: config.resolved.file.dir,
    archiveDir: config.resolved.file.archiveDir,
    logDirExists: false,
    archiveDirExists: false,
    files: [],
    mode: config.resolved.destination === "database" ? "database" : "file",
    database:
      config.resolved.destination === "database"
        ? config.resolved.database
        : null,
  };
}

async function getStudioProjectFiles(projectPath?: string): Promise<{
  project: Awaited<ReturnType<typeof resolveStudioProject>>;
  config: StudioConfigDiscovery;
  files: StudioLogDiscovery;
}> {
  const project = await resolveStudioProject(projectPath);
  const config = await discoverStudioConfig(project);

  return {
    project,
    config,
    files: project.valid
      ? await discoverLogSource(project.absolutePath, config)
      : emptyLogDiscovery(config),
  };
}

// parsedConfig may contain live ORM runtime objects (PrismaClient, Drizzle db)
// that cannot be JSON-serialized. Strip it before any tRPC response leaves the
// service layer. Internal service helpers use discoverStudioConfig() directly
// and retain the full object for DB queries.
function stripParsedConfig(config: StudioConfigDiscovery): StudioConfigDiscovery {
  return { ...config, parsedConfig: null };
}

function sanitizeGeneratedChatTitle(value: string): string {
  const normalized = value
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (normalized.length <= 48) {
    return normalized || "New chat";
  }

  return `${normalized.slice(0, 47).trimEnd()}…`;
}
