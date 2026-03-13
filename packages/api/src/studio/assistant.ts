import { randomUUID } from "node:crypto";

import {
  convertToModelMessages,
  smoothStream,
  streamText,
  type StreamTextResult,
  type UIMessage,
} from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

import { buildAssistantContext } from "./assistant-context";
import { generateAssistantText } from "./assistant-provider";
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

interface AiConfigInput {
  apiKey: string | null;
  model: string | null;
}

type TestStreamTextFn = (input: {
  system: string;
  prompt: string;
  model: string;
  history: UIMessage[];
  references: StudioAssistantMessage["references"];
}) => Promise<StudioAssistantStreamResult>;

let testStreamText: TestStreamTextFn | null = null;

interface RunAssistantInput extends StudioAssistantReplyInput {
  files: StudioLogDiscovery["files"];
  projectPath: string;
  ai: AiConfigInput;
}

export interface StreamAssistantInput {
  projectPath: string;
  files: StudioLogDiscovery["files"];
  filters: StudioAssistantReplyInput["filters"];
  selectedRecordId?: string;
  selectedGroupId?: string;
  messages: UIMessage[];
  mode?: "chat" | "describe-selection";
  ai: {
    apiKey: string | null;
    model: string | null;
    overrideModel?: string | null;
  };
}

export interface StudioAssistantStreamResult {
  result: StreamTextResult<Record<string, never>, never>;
  references: StudioAssistantMessage["references"];
  model: string;
}

export async function replyWithAssistant(
  input: RunAssistantInput,
): Promise<StudioAssistantMessage> {
  const loaded = await loadNormalizedRecords(input.files, input.projectPath);
  const history = input.history.slice(-8);
  const latestUserMessage = history
    .slice()
    .reverse()
    .find((item) => item.role === "user")?.content ?? "Summarize the current logs.";
  const context = await buildAssistantContext({
    allRecords: loaded.records,
    filters: input.filters,
    selectedRecordId: input.selectedRecordId,
    selectedGroupId: input.selectedGroupId,
    projectPath: input.projectPath,
    userQuestion: latestUserMessage,
  });
  const content = await generateAssistantText({
    apiKey: requireApiKey(input.ai),
    model: requireModel(input.ai),
    system: buildAssistantSystemPrompt(),
    prompt: buildAssistantReplyPrompt({
      projectPath: input.projectPath,
      selectedRecord: context.selectedRecord,
      selectedRecordSource: context.selectedRecordSource,
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
  const loaded = await loadNormalizedRecords(input.files, input.projectPath);
  const context = await buildAssistantContext({
    allRecords: loaded.records,
    filters: input.filters,
    selectedRecordId: input.selectedRecordId,
    selectedGroupId: input.selectedGroupId,
    projectPath: input.projectPath,
    userQuestion: "Describe this selection.",
  });
  const content = await generateAssistantText({
    apiKey: requireApiKey(input.ai),
    model: requireModel(input.ai),
    system: buildAssistantSystemPrompt(),
    prompt: buildDescribeSelectionPrompt({
      projectPath: input.projectPath,
      selectedRecord: context.selectedRecord,
      selectedRecordSource: context.selectedRecordSource,
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

export async function streamAssistant(
  input: StreamAssistantInput,
): Promise<StudioAssistantStreamResult> {
  const loaded = await loadNormalizedRecords(input.files, input.projectPath);
  const latestUserMessage =
    input.messages
      .slice()
      .reverse()
      .find((message) => message.role === "user")?.parts.find((part) => part.type === "text")
      ?.text ?? "Summarize the current logs.";
  const context = await buildAssistantContext({
    allRecords: loaded.records,
    filters: input.filters,
    selectedRecordId: input.selectedRecordId,
    selectedGroupId: input.selectedGroupId,
    projectPath: input.projectPath,
    userQuestion: latestUserMessage,
  });
  const prompt =
    input.mode === "describe-selection"
      ? buildDescribeSelectionPrompt({
          projectPath: input.projectPath,
          selectedRecord: context.selectedRecord,
          selectedRecordSource: context.selectedRecordSource,
          selectedGroup: context.selectedGroup,
          records: context.evidenceRecords,
          references: context.references,
          userQuestion: latestUserMessage,
          history: [],
          filtersSummary: summarizeFilters(input.filters),
        })
      : buildAssistantReplyPrompt({
          projectPath: input.projectPath,
          selectedRecord: context.selectedRecord,
          selectedRecordSource: context.selectedRecordSource,
          selectedGroup: context.selectedGroup,
          records: context.evidenceRecords,
          references: context.references,
          userQuestion: latestUserMessage,
          history: extractHistory(input.messages),
          filtersSummary: summarizeFilters(input.filters),
        });
  const modelId = input.ai.overrideModel ?? requireModel(input.ai);
  const openrouter = createOpenRouter({
    apiKey: requireApiKey(input.ai),
  });
  const history = input.messages.slice(0, -1);
  const modelMessages = await convertToModelMessages(history);

  if (testStreamText) {
    return testStreamText({
      system: buildAssistantSystemPrompt(),
      prompt,
      model: modelId,
      history: input.messages,
      references: context.references,
    });
  }

  return {
    result: streamText({
      model: openrouter(modelId),
      system: buildAssistantSystemPrompt(),
      messages: [
        ...modelMessages,
        {
          role: "user",
          content: [{ type: "text", text: prompt }],
        },
      ],
      temperature: 0.35,
      experimental_transform: smoothStream(),
    }),
    references: context.references,
    model: modelId,
  };
}

export function __setStreamTextForTests(fn: TestStreamTextFn | null): void {
  testStreamText = fn;
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

function requireApiKey(ai: AiConfigInput): string {
  if (!ai.apiKey) {
    throw new Error("AI is not configured: missing_api_key");
  }

  return ai.apiKey;
}

function requireModel(ai: AiConfigInput): string {
  if (!ai.model) {
    throw new Error("AI is not configured: missing_model");
  }

  return ai.model;
}

function extractHistory(messages: UIMessage[]): StudioAssistantReplyInput["history"] {
  return messages
    .map((message) => {
      const text = message.parts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n")
        .trim();

      return text
        ? {
            role:
              message.role === "assistant"
                ? ("assistant" as const)
                : ("user" as const),
            content: text,
          }
        : null;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .slice(-8);
}
