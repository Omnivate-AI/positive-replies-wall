/**
 * Local CLI runner for the ingestion logic — same code path as the Trigger.dev task,
 * minus the Trigger runtime. Useful for the M5 smoke test before deploying.
 *
 * Usage:
 *   npm run ingest:local                                  # all clients, all campaigns
 *   npm run ingest:local -- --client-id 221217           # OrbitalX only
 *   npm run ingest:local -- --campaign-id 2851748        # one campaign
 *   npm run ingest:local -- --status ACTIVE,COMPLETED    # filter campaign statuses
 */

import * as dotenv from "dotenv";
dotenv.config();

import { runIngest, type IngestOptions } from "../trigger/lib/ingest.js";

function parseArg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

const clientArg = parseArg("client-id");
const campaignArg = parseArg("campaign-id");
const statusArg = parseArg("status");

const opts: IngestOptions = {
  clientIds: clientArg ? clientArg.split(",").map(Number) : undefined,
  campaignIds: campaignArg ? campaignArg.split(",").map(Number) : undefined,
  campaignStatuses: statusArg ? statusArg.split(",") : undefined,
  onProgress: (msg) => console.log(msg),
};

console.log("Starting local ingest with options:", {
  clientIds: opts.clientIds,
  campaignIds: opts.campaignIds,
  campaignStatuses: opts.campaignStatuses,
});

runIngest(opts)
  .then((stats) => {
    console.log("\n--- Final stats ---");
    console.log(JSON.stringify({ ...stats, errors: stats.errors }, null, 2));
    process.exit(stats.errors.length ? 1 : 0);
  })
  .catch((e) => {
    console.error("Fatal error:", e);
    process.exit(1);
  });
