import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Tests run without the TanStack Start plugin, which rewrites React entrypoints
// for SSR and breaks hook dispatch under jsdom.
export default defineConfig({
  plugins: [tsconfigPaths(), viteReact()],
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  test: {
    // Lets @testing-library/react register its automatic afterEach cleanup.
    globals: true,
  },
});
