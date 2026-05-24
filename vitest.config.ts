import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
    },
  },
  test: {
    environment: "node",
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "tests/unit/**/*.test.ts",
      "scripts/**/__tests__/**/*.test.ts",
    ],
    exclude: [
      "node_modules",
      ".next",
      "Chesskit/**",
      "cdk/**",
      "tests/e2e/**",
    ],
  },
});
