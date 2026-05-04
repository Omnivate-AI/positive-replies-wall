import { defineConfig } from "vitest/config";
import * as dotenv from "dotenv";

// Load .env so tests pick up SUPABASE_*, SMARTLEAD_API_KEY, etc.
dotenv.config();

export default defineConfig({
  test: {
    // Sequential by default — integration/e2e tests can race on shared sentinel rows.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 30_000,
    include: ["tests/**/*.test.ts"],
    // Per-bucket timeouts handled inside each test via vitest's `it.concurrent`/timeouts.
    reporters: ["default"],
  },
});
