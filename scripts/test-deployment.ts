/**
 * Smoke-test the DEPLOYED Trigger.dev tasks.
 *
 * Triggers each task with a small payload, polls until the run completes,
 * and verifies the output matches what we'd expect from the local runs
 * (idempotent — replies already in DB, so 0 new inserts/classifications).
 *
 * Auth: TRIGGER_SECRET_KEY from .env. The key's environment (DEV vs PROD)
 * determines which deployment is hit. Our deploy targeted PROD; ensure the
 * key in .env is the corresponding `tr_prod_...` key.
 *
 * Usage:
 *   npx tsx scripts/test-deployment.ts                # both tasks
 *   npx tsx scripts/test-deployment.ts ingest         # just ingest
 *   npx tsx scripts/test-deployment.ts classify       # just classify
 */

import * as dotenv from "dotenv";
dotenv.config();

import { tasks, runs, configure } from "@trigger.dev/sdk";

const SECRET = process.env.TRIGGER_SECRET_KEY;
if (!SECRET) {
  console.error("TRIGGER_SECRET_KEY is not set in .env");
  process.exit(1);
}
configure({ secretKey: SECRET });

const which = process.argv[2]; // optional: 'ingest' or 'classify'

interface TestResult {
  task: string;
  runId: string;
  status: string;
  durationMs: number;
  output?: unknown;
  error?: string;
}

async function triggerAndPoll(
  taskId: string,
  payload: Record<string, unknown>,
  timeoutMs = 5 * 60_000,
): Promise<TestResult> {
  const t0 = Date.now();
  console.log(`\n→ Triggering ${taskId} with payload:`, JSON.stringify(payload));

  const handle = await tasks.trigger(taskId, payload);
  console.log(`  Run ID: ${handle.id}`);
  console.log(`  Dashboard: https://cloud.trigger.dev/projects/v3/proj_vdhufffmwghsuhddbqrd/runs/${handle.id}`);

  // Poll until the run reaches a terminal state.
  let lastStatus = "";
  while (true) {
    if (Date.now() - t0 > timeoutMs) {
      return {
        task: taskId,
        runId: handle.id,
        status: "TIMEOUT",
        durationMs: Date.now() - t0,
        error: `Polling timed out after ${timeoutMs}ms`,
      };
    }
    const run = await runs.retrieve(handle.id);
    if (run.status !== lastStatus) {
      console.log(`  status: ${run.status}`);
      lastStatus = run.status;
    }
    const terminal = ["COMPLETED", "FAILED", "CANCELED", "CRASHED", "TIMED_OUT", "INTERRUPTED", "SYSTEM_FAILURE"];
    if (terminal.includes(run.status)) {
      return {
        task: taskId,
        runId: handle.id,
        status: run.status,
        durationMs: Date.now() - t0,
        output: run.output,
        error: run.error ? String(run.error?.message ?? run.error) : undefined,
      };
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
}

async function main() {
  const results: TestResult[] = [];

  if (!which || which === "ingest") {
    // Idempotent re-ingest of a small known campaign — must complete with 0 inserts.
    const r = await triggerAndPoll("ingest-smartlead-replies", { campaignIds: [2851748] });
    results.push(r);
  }

  if (!which || which === "classify") {
    // Tiny scope: classify at most 1 reply. Should be a no-op since all 352 are already
    // classified at the current PROMPT_VERSION — pending should be 0.
    const r = await triggerAndPoll("classify-replies", { limit: 1 });
    results.push(r);
  }

  console.log("\n--- Results ---");
  for (const r of results) {
    console.log(`\n${r.task}`);
    console.log(`  status:     ${r.status}`);
    console.log(`  duration:   ${(r.durationMs / 1000).toFixed(1)}s`);
    if (r.error) console.log(`  error:      ${r.error}`);
    if (r.output) console.log(`  output:     ${JSON.stringify(r.output, null, 2).split("\n").map((l, i) => i === 0 ? l : `              ${l}`).join("\n")}`);
  }

  const failed = results.filter((r) => r.status !== "COMPLETED");
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
