import { publicProcedure, router } from "../index";
import { studioRouter } from "./studio";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  studio: studioRouter,
});
export type AppRouter = typeof appRouter;
