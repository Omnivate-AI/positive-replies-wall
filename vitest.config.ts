import { defineConfig } from "vitest/config";
import * as dotenv from "dotenv";
import { fileURLToPath } from "node:url";

// Load .env so tests pick up SUPABASE_*, SMARTLEAD_API_KEY, etc.
dotenv.config();

export default defineConfig({
  resolve: {
    // Mirror the `@/*` alias from tsconfig.json so tests can import the
    // app's own modules through the same path the runtime code uses
    // (necessary for testing `app/api/admin/*/route.ts` and `lib/*` from
    // tests/integration without rewriting their imports).
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    // Sequential by default — integration/e2e tests can race on shared sentinel rows.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 30_000,
    include: ["tests/**/*.test.{ts,tsx}"],
    // Per-bucket timeouts handled inside each test via vitest's `it.concurrent`/timeouts.
    reporters: ["default"],
  },
});
