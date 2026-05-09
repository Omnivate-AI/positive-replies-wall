/**
 * Smoke-test runner for the deployed `classify-replies` task.
 *
 * Fires it via the Trigger.dev management API and polls until terminal,
 * so we can verify a fix without waiting for the daily 08:00 cron to
 * fire again.
 */
import * as dotenv from "dotenv";
dotenv.config();
import { tasks, runs, configure } from "@trigger.dev/sdk";

configure({ secretKey: process.env.TRIGGER_SECRET_KEY! });

(async () => {
  const handle = await tasks.trigger("classify-replies", {});
  console.log("Run id:", handle.id);
  console.log(
    `Inspect: https://cloud.trigger.dev/projects/v3/proj_vdhufffmwghsuhddbqrd/runs/${handle.id}`,
  );

  let last = "";
  for (let i = 0; i < 120; i++) {
    const r = await runs.retrieve(handle.id);
    if (r.status !== last) {
      console.log(`[${new Date().toISOString()}] status=${r.status}`);
      last = r.status;
    }
    if (
      ["COMPLETED", "FAILED", "CANCELED", "CRASHED", "SYSTEM_FAILURE", "TIMED_OUT"].includes(
        r.status,
      )
    ) {
      console.log("\nFinal status:", r.status);
      console.log("Output:", JSON.stringify(r.output, null, 2));
      process.exit(r.status === "COMPLETED" ? 0 : 1);
    }
    await new Promise((res) => setTimeout(res, 3000));
  }
  console.log("Timed out polling.");
  process.exit(2);
})();
