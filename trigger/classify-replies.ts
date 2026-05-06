/**
 * Trigger.dev task: classify positive replies in Supabase against the M4 rubric.
 *
 * Wraps trigger/lib/classify-batch.ts. The same batch logic also runs locally via
 * `npm run classify:local` (see scripts/classify-local.ts).
 *
 * Idempotent: each classification is keyed on UNIQUE(thread_id, prompt_version).
 * Re-running with the same prompt version is a no-op; bumping PROMPT_VERSION
 * (see trigger/lib/classify.ts) re-classifies every thread on the next run.
 */

import { logger, task } from "@trigger.dev/sdk";
import {
  runClassifyBatch,
  type ClassifyBatchOptions,
  type ClassifyBatchStats,
} from "./lib/classify-batch.js";

export const classifyReplies = task({
  id: "classify-replies",
  // 4-hour ceiling; classifying 352 replies at concurrency=5 / ~1.5s each = ~2 min.
  // Headroom for retries and any future scale-up.
  maxDuration: 14400,
  run: async (payload: ClassifyBatchOptions, { ctx }): Promise<ClassifyBatchStats> => {
    logger.info("Starting reply classification", { payload, runId: ctx.run.id });
    const stats = await runClassifyBatch({
      ...payload,
      onProgress: (msg) => logger.info(msg),
    });
    logger.info("Classification finished", {
      promptVersion: stats.promptVersion,
      pending: stats.threadsPending,
      classified: stats.threadsClassified,
      highQuality: stats.threadsHighQuality,
      highlightsApplied: stats.highlightsApplied,
      redactionsSeeded: stats.redactionsSeeded,
      errorCount: stats.errors.length,
    });
    return stats;
  },
});
