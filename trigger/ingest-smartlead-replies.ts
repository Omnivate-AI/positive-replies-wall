/**
 * Trigger.dev task: ingest Smartlead positive replies into Supabase as
 * thread + messages rows.
 *
 * Wraps the pure logic in `./lib/ingest.ts`. The same logic runs locally via
 * `npm run ingest:local` (see scripts/ingest-local.ts).
 *
 * Idempotent: re-runs only update snapshot fields and add new messages;
 * admin-edited highlight_text on prw_threads is preserved.
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
      clients: stats.clientsSeen,
      campaigns: stats.campaignsSeen,
      leads: stats.leadsSeen,
      threadsInserted: stats.threadsInserted,
      threadsUpdated: stats.threadsUpdated,
      threadsSkippedNoInbound: stats.threadsSkippedNoInbound,
      messagesInserted: stats.messagesInserted,
      leadsMatched: stats.leadsMatched,
      redactionsSeeded: stats.redactionsSeeded,
      errorCount: stats.errors.length,
    });
    return stats;
  },
});
