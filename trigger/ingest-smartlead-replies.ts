/**
 * Trigger.dev task: ingest Smartlead positive replies into Supabase.
 *
 * Wraps the pure logic in `./lib/ingest.ts`. The same logic also runs locally via
 * `npm run ingest:local` (see scripts/ingest-local.ts) — that's the path we use
 * for the M5 smoke test before deploying.
 *
 * Idempotent: re-runs only insert new replies (UNIQUE constraint on smartlead_message_id).
 */

import { logger, task } from "@trigger.dev/sdk";
import { runIngest, type IngestOptions, type IngestStats } from "./lib/ingest.js";

export const ingestSmartleadReplies = task({
  id: "ingest-smartlead-replies",
  // Inherits 4h default from trigger.config.ts; explicit here for clarity.
  maxDuration: 14400,
  run: async (payload: IngestOptions, { ctx }): Promise<IngestStats> => {
    logger.info("Starting Smartlead reply ingest", { payload });
    const stats = await runIngest({
      ...payload,
      triggerRunId: ctx.run.id,
      onProgress: (msg) => logger.info(msg),
    });
    logger.info("Ingest finished", {
      runId: stats.runId,
      clients: stats.clientsSeen,
      campaigns: stats.campaignsSeen,
      leads: stats.leadsSeen,
      replies: stats.repliesSeen,
      inserted: stats.repliesInserted,
      skipped: stats.repliesSkippedExisting,
      errorCount: stats.errors.length,
    });
    return stats;
  },
});
