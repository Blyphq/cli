import { streamStudioAssistant } from "@blyp-cli/api/studio/service";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import type { UIMessage } from "ai";

const chatRequestSchema = z.object({
  messages: z.array(z.any()),
  projectPath: z.string().optional(),
  filters: z
    .object({
      level: z.string().optional(),
      type: z.string().optional(),
      search: z.string().optional(),
      fileId: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
    })
    .default({}),
  selectedRecordId: z.string().optional(),
  selectedGroupId: z.string().optional(),
  selectedBackgroundRunId: z.string().optional(),
  selectedAgentTaskId: z.string().optional(),
  selectedPaymentTraceId: z.string().optional(),
  mode: z.enum(["chat", "describe-selection"]).optional(),
  model: z.string().optional(),
});

async function handler({ request }: { request: Request }) {
  try {
    const payload = chatRequestSchema.parse(await request.json());
    const { result, references, model } = await streamStudioAssistant({
      ...payload,
      messages: payload.messages as UIMessage[],
    });

    return result.toUIMessageStreamResponse({
      sendReasoning: true,
      messageMetadata: () => ({
        references,
        model,
      }),
      onError: (error) =>
        error instanceof Error ? error.message : "Studio assistant failed.",
    });
  } catch (error) {
    return new Response(
      error instanceof Error ? error.message : "Studio assistant failed.",
      {
        status:
          error instanceof Error &&
          error.message.includes("AI is not configured:")
            ? 412
            : 500,
      },
    );
  }
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: handler,
    },
  },
});
