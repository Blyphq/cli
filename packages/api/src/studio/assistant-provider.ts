import { generateText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

import { STUDIO_AI_MODELS } from "./models";
import type { StudioAiSummary, StudioAssistantStatus } from "./types";

type TestGenerateTextFn = (input: {
  system: string;
  prompt: string;
}) => Promise<{ text: string }>;

let testGenerateText: TestGenerateTextFn | null = null;

export class StudioAssistantDisabledError extends Error {
  constructor(readonly reason: NonNullable<StudioAssistantStatus["reason"]>) {
    super(`Studio AI is not configured: ${reason}`);
    this.name = "StudioAssistantDisabledError";
  }
}

export function getAssistantStatus(ai: StudioAiSummary): StudioAssistantStatus {
  if (!ai.apiKeyConfigured) {
    return {
      enabled: false,
      provider: "openrouter",
      model: ai.model,
      availableModels: [...STUDIO_AI_MODELS],
      apiKeySource: ai.apiKeySource,
      modelSource: ai.modelSource,
      reason: "missing_api_key",
      projectContext: {
        claudeMdPresent: false,
        claudeMdPath: null,
      },
    };
  }

  if (!ai.model) {
    return {
      enabled: false,
      provider: "openrouter",
      model: null,
      availableModels: [...STUDIO_AI_MODELS],
      apiKeySource: ai.apiKeySource,
      modelSource: ai.modelSource,
      reason: "missing_model",
      projectContext: {
        claudeMdPresent: false,
        claudeMdPath: null,
      },
    };
  }

  return {
    enabled: true,
    provider: "openrouter",
    model: ai.model,
    availableModels: [...STUDIO_AI_MODELS],
    apiKeySource: ai.apiKeySource,
    modelSource: ai.modelSource,
    reason: null,
    projectContext: {
      claudeMdPresent: false,
      claudeMdPath: null,
    },
  };
}

export async function generateAssistantText(input: {
  apiKey: string;
  model: string;
  system: string;
  prompt: string;
}): Promise<string> {
  if (!input.apiKey.trim()) {
    throw new StudioAssistantDisabledError("missing_api_key");
  }

  if (!input.model.trim()) {
    throw new StudioAssistantDisabledError("missing_model");
  }

  if (testGenerateText) {
    const result = await testGenerateText(input);
    return result.text;
  }

  const openrouter = createOpenRouter({
    apiKey: input.apiKey,
  });
  const result = await generateText({
    model: openrouter(input.model),
    system: input.system,
    prompt: input.prompt,
    temperature: 0.2,
  });

  return result.text;
}

export function __setGenerateTextForTests(fn: TestGenerateTextFn | null): void {
  testGenerateText = fn;
}
