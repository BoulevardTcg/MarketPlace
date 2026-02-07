import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    setupFiles: [resolve(__dirname, "src/test/setup.ts")],
    fileParallelism: false,
  },
  resolve: {
    alias: { "#": resolve(__dirname, "src") },
  },
});
