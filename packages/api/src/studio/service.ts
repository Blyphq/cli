import {
  replyWithAssistant,
  describeSelectionWithAssistant,
  streamAssistant,
  type StudioAssistantStreamResult,
} from "./assistant";
import { generateAssistantText, getAssistantStatus } from "./assistant-provider";
import { discoverStudioConfig, resolveStudioAiCredentials } from "./config";
import { getLogFacets } from "./facets";
import { buildGroupDetails } from "./grouping";
import { discoverLogFiles } from "./logs";
import { resolveStudioProject } from "./project";
import { loadNormalizedRecords, queryLogs } from "./query";

import type {
  StudioAssistantMessage,
  StudioAssistantReplyInput,
  StudioAssistantStatus,
  StudioConfigDiscovery,
  StudioLogDiscovery,
  StudioLogFacets,
  StudioLogsPage,
  StudioLogsQueryInput,
  StudioMeta,
  StudioStructuredGroupDetail,
} from "./types";

export async function getStudioMeta(projectPath?: string): Promise<StudioMeta> {
  const project = await resolveStudioProject(projectPath);
  const config = await discoverStudioConfig(project);
  const logs = project.valid
    ? await discoverLogFiles(project.absolutePath, config)
    : emptyLogDiscovery(config);

  return {
    project,
    config,
    logs: {
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
  return discoverStudioConfig(project);
}

export async function getStudioFiles(projectPath?: string): Promise<StudioLogDiscovery> {
  const project = await resolveStudioProject(projectPath);
  const config = await discoverStudioConfig(project);

  if (!project.valid) {
    return emptyLogDiscovery(config);
  }

  return discoverLogFiles(project.absolutePath, config);
}

export async function getStudioLogs(input: StudioLogsQueryInput): Promise<StudioLogsPage> {
  const files = await getStudioFiles(input.projectPath);
  return queryLogs({
    files: files.files,
    input,
  });
}

export async function getStudioFacets(
  input: Pick<
    StudioLogsQueryInput,
    "projectPath" | "level" | "search" | "fileId" | "from" | "to"
  >,
): Promise<StudioLogFacets> {
  const files = await getStudioFiles(input.projectPath);
  const loaded = await loadNormalizedRecords(files.files);

  return getLogFacets(loaded.records, input);
}

export async function getStudioGroup(input: {
  projectPath?: string;
  groupId: string;
}): Promise<StudioStructuredGroupDetail | null> {
  const files = await getStudioFiles(input.projectPath);
  const loaded = await loadNormalizedRecords(files.files);
  const groups = buildGroupDetails(loaded.records);

  return groups.get(input.groupId) ?? null;
}

export async function getStudioRecord(input: {
  projectPath?: string;
  recordId: string;
}) {
  const files = await getStudioFiles(input.projectPath);
  const loaded = await loadNormalizedRecords(files.files);

  return loaded.records.find((record) => record.id === input.recordId) ?? null;
}

export async function getStudioAssistantStatus(projectPath?: string): Promise<StudioAssistantStatus> {
  const project = await resolveStudioProject(projectPath);
  const config = await discoverStudioConfig(project);

  return getAssistantStatus(config.resolved.ai);
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
    ? await discoverLogFiles(project.absolutePath, config)
    : emptyLogDiscovery(config);
  const ai = resolveStudioAiCredentials(config, project.absolutePath);

  return replyWithAssistant({
    ...input,
    projectPath: project.absolutePath,
    ai,
    files: files.files,
  });
}

export async function describeStudioSelection(
  input: StudioAssistantReplyInput,
): Promise<StudioAssistantMessage> {
  const project = await resolveStudioProject(input.projectPath);
  const config = await discoverStudioConfig(project);
  const files = project.valid
    ? await discoverLogFiles(project.absolutePath, config)
    : emptyLogDiscovery(config);
  const ai = resolveStudioAiCredentials(config, project.absolutePath);

  return describeSelectionWithAssistant({
    ...input,
    projectPath: project.absolutePath,
    ai,
    files: files.files,
  });
}

export async function streamStudioAssistant(input: {
  projectPath?: string;
  filters: StudioAssistantReplyInput["filters"];
  selectedRecordId?: string;
  selectedGroupId?: string;
  messages: import("ai").UIMessage[];
  mode?: "chat" | "describe-selection";
  model?: string;
}): Promise<StudioAssistantStreamResult> {
  const project = await resolveStudioProject(input.projectPath);
  const config = await discoverStudioConfig(project);
  const files = project.valid
    ? await discoverLogFiles(project.absolutePath, config)
    : emptyLogDiscovery(config);
  const ai = resolveStudioAiCredentials(config, project.absolutePath);

  return streamAssistant({
    projectPath: project.absolutePath,
    files: files.files,
    filters: input.filters,
    selectedRecordId: input.selectedRecordId,
    selectedGroupId: input.selectedGroupId,
    messages: input.messages,
    mode: input.mode,
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
  };
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
