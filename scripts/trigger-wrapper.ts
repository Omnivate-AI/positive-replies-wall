/**
 * Smoke-test runner for `scheduled-ingest-and-classify`.
 *
 * Fires the wrapper task in prod via the Trigger.dev management API,
 * prints the run handle URL, and (optionally) polls for completion.
 *
 * Usage:
 *   npx tsx scripts/trigger-wrapper.ts          # fire and print URL, exit
 *   npx tsx scripts/trigger-wrapper.ts --wait   # fire and poll until terminal
 *
 * Requires TRIGGER_SECRET_KEY in .env (already present for prod).
 */

import * as dotenv from "dotenv";
dotenv.config();

import { tasks, runs, configure } from "@trigger.dev/sdk";

const TASK_ID = "scheduled-ingest-and-classify";
const wait = process.argv.includes("--wait");

async function main() {
  const secret = process.env.TRIGGER_SECRET_KEY;
  if (!secret) throw new Error("TRIGGER_SECRET_KEY not set in .env");
  configure({ secretKey: secret });

  console.log(`Triggering ${TASK_ID} in prod...`);
  const handle = await tasks.trigger(TASK_ID, {});
  console.log("Run id:", handle.id);
  console.log(
    `Inspect: https://cloud.trigger.dev/projects/v3/proj_vdhufffmwghsuhddbqrd/runs/${handle.id}`,
  );

  if (!wait) {
    console.log("\nNot waiting (use --wait to poll).");
    return;
  }

  console.log("\nPolling until terminal...");
  let lastStatus = "";
  for (let i = 0; i < 240; i++) {
    const run = await runs.retrieve(handle.id);
    if (run.status !== lastStatus) {
      console.log(`[${new Date().toISOString()}] status: ${run.status}`);
      lastStatus = run.status;
    }
    if (
      run.status === "COMPLETED" ||
      run.status === "FAILED" ||
      run.status === "CANCELED" ||
      run.status === "CRASHED" ||
      run.status === "SYSTEM_FAILURE" ||
      run.status === "TIMED_OUT"
    ) {
      console.log("\n--- Final ---");
      console.log("Status:", run.status);
      console.log("Output:", JSON.stringify(run.output, null, 2));
      if (run.error) console.log("Error:", run.error);
      process.exit(run.status === "COMPLETED" ? 0 : 1);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  console.log("Polling timed out after 20 minutes — run may still be in progress.");
  process.exit(2);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
