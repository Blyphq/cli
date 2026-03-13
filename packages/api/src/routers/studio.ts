import { z } from "zod";

import { publicProcedure, router } from "../index";
import { getStudioConfig, getStudioFiles, getStudioLogs, getStudioMeta } from "../studio/service";

const studioLogsInput = z.object({
  projectPath: z.string().optional(),
  limit: z.number().int().positive().max(500).optional(),
  offset: z.number().int().min(0).optional(),
  level: z.string().optional(),
  search: z.string().optional(),
  fileId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
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
        search: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
      }),
    )
    .query(({ input }) => getStudioLogs(input)),
});
