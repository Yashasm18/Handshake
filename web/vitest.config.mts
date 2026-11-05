import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // Server modules import "server-only" to stay out of client bundles; tests run them directly.
      "server-only": path.resolve(__dirname, "test/server-only-stub.ts"),
    },
  },
  test: { include: ["test/**/*.test.ts"], setupFiles: ["test/setup-db.ts"] },
});
