import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globalSetup: ["./test/global-setup.ts"],
    env: {
      DB_FILE: "file:flexfit.test.db",
    },
    fileParallelism: false,
  },
});
