import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  // Reusing the existing Omnivate production Trigger.dev project (same ref as
  // outbound/trigger.config.ts) — our 2 tasks (ingest-smartlead-replies,
  // classify-replies) live alongside the 112 outbound tasks.
  project: "proj_vdhufffmwghsuhddbqrd",
  runtime: "node",
  logLevel: "info",
  // Mirror the outbound repo's post-OrbitalX-retro default (4h cap).
  // Smartlead ingestion across ~89 campaigns × paginated leads × per-lead message
  // history is well within this; classification batches even more so.
  maxDuration: 14400,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 30000,
      factor: 2,
      randomize: true,
    },
  },
  dirs: ["./trigger"],
  // Note: deliberately NOT using the syncEnvVars build extension that
  // outbound/trigger.config.ts uses. The Trigger.dev project is shared with
  // outbound's 112 tasks, and that extension would clobber outbound's env vars
  // with whatever's in our local .env on every deploy. Our tasks rely on env
  // vars that already exist at the project level (set there by outbound's
  // deploys). If a deployed task fails with "X is not set", add the var via
  // the Trigger.dev dashboard or `npx trigger.dev@latest envvars create` —
  // don't re-enable the bulk sync.
});
