import { defineConfig } from "@trigger.dev/sdk";
import { syncEnvVars } from "@trigger.dev/build/extensions/core";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

export default defineConfig({
  // TODO: replace with the actual Trigger.dev project ref once Omar confirms
  // (new project for positive-replies-wall vs reusing the existing Omnivate project).
  project: "proj_REPLACE_ME",
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
  build: {
    extensions: [
      syncEnvVars(async () => {
        const envPath = path.resolve(process.cwd(), ".env");
        if (!fs.existsSync(envPath)) return [];
        const envConfig = dotenv.parse(fs.readFileSync(envPath));
        return Object.entries(envConfig).map(([name, value]) => ({ name, value }));
      }),
    ],
  },
});
