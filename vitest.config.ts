import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/__tests__/**/*.test.ts"],
    // Globs, not bare directory names: these replace Vitest's defaults, and a
    // bare "node_modules" matches nothing nested. Without the ** the suite
    // collected tests out of dependencies and of stale copies of this repo
    // under .claude/worktrees.
    exclude: ["**/node_modules/**", "**/.next/**", "**/.claude/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
