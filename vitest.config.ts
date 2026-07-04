import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // tsconfig sets jsx: "preserve" (Next.js default); force the automatic JSX
  // runtime on the oxc transformer so component tests (e.g. Logo/Loader) can be
  // rendered via renderToStaticMarkup without a jsdom/testing-library setup.
  oxc: { jsx: { runtime: "automatic" } },
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
