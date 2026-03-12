export async function createContext({ req }: { req: Request }) {
  // No auth configured
  return {
    session: null,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
