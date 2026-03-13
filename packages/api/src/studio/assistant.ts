import { randomUUID } from "node:crypto";

import { buildAssistantContext } from "./assistant-context";
import {
  generateAssistantText,
} from "./assistant-provider";
import {
  buildAssistantReplyPrompt,
  buildAssistantSystemPrompt,
  buildDescribeSelectionPrompt,
} from "./assistant-prompt";
import { loadNormalizedRecords } from "./query";

import type {
  StudioAssistantMessage,
  StudioAssistantReplyInput,
  StudioLogDiscovery,
} from "./types";

interface RunAssistantInput extends StudioAssistantReplyInput {
  files: StudioLogDiscovery["files"];
  projectPath: string;
  ai: {
    apiKey: string | null;
    model: string | null;
  };
}

export async function replyWithAssistant(
  input: RunAssistantInput,
): Promise<StudioAssistantMessage> {
  const loaded = await loadNormalizedRecords(input.files);
  const history = input.history.slice(-8);
  const latestUserMessage = history
    .slice()
    .reverse()
    .find((item) => item.role === "user")?.content ?? "Summarize the current logs.";
  const context = buildAssistantContext({
    allRecords: loaded.records,
    filters: input.filters,
    selectedRecordId: input.selectedRecordId,
    selectedGroupId: input.selectedGroupId,
    userQuestion: latestUserMessage,
  });

  if (!input.ai.apiKey) {
    throw new Error("AI is not configured: missing_api_key");
  }

  if (!input.ai.model) {
    throw new Error("AI is not configured: missing_model");
  }

  const content = await generateAssistantText({
    apiKey: input.ai.apiKey ?? "",
    model: input.ai.model ?? "",
    system: buildAssistantSystemPrompt(),
    prompt: buildAssistantReplyPrompt({
      projectPath: input.projectPath,
      selectedRecord: context.selectedRecord,
      selectedGroup: context.selectedGroup,
      records: context.evidenceRecords,
      references: context.references,
      userQuestion: latestUserMessage,
      history,
      filtersSummary: summarizeFilters(input.filters),
    }),
  });

  return {
    id: randomUUID(),
    role: "assistant",
    content,
    references: context.references,
  };
}

export async function describeSelectionWithAssistant(
  input: RunAssistantInput,
): Promise<StudioAssistantMessage> {
  const loaded = await loadNormalizedRecords(input.files);
  const context = buildAssistantContext({
    allRecords: loaded.records,
    filters: input.filters,
    selectedRecordId: input.selectedRecordId,
    selectedGroupId: input.selectedGroupId,
    userQuestion: "Describe this selection.",
  });

  if (!input.ai.apiKey) {
    throw new Error("AI is not configured: missing_api_key");
  }

  if (!input.ai.model) {
    throw new Error("AI is not configured: missing_model");
  }

  const content = await generateAssistantText({
    apiKey: input.ai.apiKey ?? "",
    model: input.ai.model ?? "",
    system: buildAssistantSystemPrompt(),
    prompt: buildDescribeSelectionPrompt({
      projectPath: input.projectPath,
      selectedRecord: context.selectedRecord,
      selectedGroup: context.selectedGroup,
      records: context.evidenceRecords,
      references: context.references,
      userQuestion: "Describe this selection.",
      history: [],
      filtersSummary: summarizeFilters(input.filters),
    }),
  });

  return {
    id: randomUUID(),
    role: "assistant",
    content,
    references: context.references,
  };
}

function summarizeFilters(filters: StudioAssistantReplyInput["filters"]): string {
  const parts = [
    filters.level ? `level=${filters.level}` : null,
    filters.type ? `type=${filters.type}` : null,
    filters.fileId ? `file=${filters.fileId}` : null,
    filters.from ? `from=${filters.from}` : null,
    filters.to ? `to=${filters.to}` : null,
    filters.search ? `search=${filters.search}` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : "none";
}
