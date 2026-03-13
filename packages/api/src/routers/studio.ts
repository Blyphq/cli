import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { publicProcedure, router } from "../index";
import { StudioAssistantDisabledError } from "../studio/assistant-provider";
import {
  describeStudioSelection,
  getStudioAssistantStatus,
  getStudioConfig,
  getStudioFacets,
  getStudioFiles,
  getStudioGroup,
  getStudioLogs,
  getStudioMeta,
  getStudioRecord,
  replyWithStudioAssistant,
} from "../studio/service";

const studioLogsInput = z.object({
  projectPath: z.string().optional(),
  limit: z.number().int().positive().max(500).optional(),
  offset: z.number().int().min(0).optional(),
  level: z.string().optional(),
  type: z.string().optional(),
  search: z.string().optional(),
  fileId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  grouping: z.enum(["flat", "grouped"]).optional(),
});

const assistantInput = z.object({
  projectPath: z.string().optional(),
  history: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    }),
  ),
  filters: z.object({
    level: z.string().optional(),
    type: z.string().optional(),
    search: z.string().optional(),
    fileId: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
  }),
  selectedRecordId: z.string().optional(),
  selectedGroupId: z.string().optional(),
});

export const studioRouter = router({
  meta: publicProcedure
    .input(z.object({ projectPath: z.string().optional() }).optional())
    .query(({ input }) => getStudioMeta(input?.projectPath)),
  config: publicProcedure
    .input(z.object({ projectPath: z.string().optional() }).optional())
    .query(({ input }) => getStudioConfig(input?.projectPath)),
  files: publicProcedure
    .input(z.object({ projectPath: z.string().optional() }).optional())
    .query(({ input }) => getStudioFiles(input?.projectPath)),
  logs: publicProcedure
    .input(studioLogsInput.optional())
    .query(({ input }) => getStudioLogs(input ?? {})),
  fileLogs: publicProcedure
    .input(
      z.object({
        projectPath: z.string().optional(),
        fileId: z.string(),
        limit: z.number().int().positive().max(500).optional(),
        offset: z.number().int().min(0).optional(),
        level: z.string().optional(),
        type: z.string().optional(),
        search: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        grouping: z.enum(["flat", "grouped"]).optional(),
      }),
    )
    .query(({ input }) => getStudioLogs(input)),
  facets: publicProcedure
    .input(
      z
        .object({
          projectPath: z.string().optional(),
          level: z.string().optional(),
          search: z.string().optional(),
          fileId: z.string().optional(),
          from: z.string().optional(),
          to: z.string().optional(),
        })
        .optional(),
    )
    .query(({ input }) => getStudioFacets(input ?? {})),
  group: publicProcedure
    .input(
      z.object({
        projectPath: z.string().optional(),
        groupId: z.string(),
      }),
    )
    .query(({ input }) => getStudioGroup(input)),
  record: publicProcedure
    .input(
      z.object({
        projectPath: z.string().optional(),
        recordId: z.string(),
      }),
    )
    .query(({ input }) => getStudioRecord(input)),
  assistantStatus: publicProcedure
    .input(z.object({ projectPath: z.string().optional() }).optional())
    .query(({ input }) => getStudioAssistantStatus(input?.projectPath)),
  assistantReply: publicProcedure
    .input(assistantInput)
    .mutation(async ({ input }) => {
      try {
        return await replyWithStudioAssistant(input);
      } catch (error) {
        throw toAssistantTrpcError(error);
      }
    }),
  describeSelection: publicProcedure
    .input(assistantInput)
    .mutation(async ({ input }) => {
      try {
        return await describeStudioSelection(input);
      } catch (error) {
        throw toAssistantTrpcError(error);
      }
    }),
});

function toAssistantTrpcError(error: unknown): TRPCError {
  if (error instanceof StudioAssistantDisabledError) {
    return new TRPCError({
      code: "PRECONDITION_FAILED",
      message: error.message,
      cause: error,
    });
  }

  if (error instanceof Error && error.message.startsWith("AI is not configured:")) {
    return new TRPCError({
      code: "PRECONDITION_FAILED",
      message: error.message,
      cause: error,
    });
  }

  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: error instanceof Error ? error.message : "Studio assistant failed.",
    cause: error,
  });
}
