import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    env: { SESSION_SECRET: "test-secret-test-secret-test-secret-123", APP_DOMAIN: "loops.test", CHAIN_ID: "97" },
  },
});
