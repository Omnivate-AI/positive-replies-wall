/**
 * Trigger.dev scheduled task — daily ingest + classify.
 *
 * Runs at 08:00 Europe/London every day (BST/GMT auto-handled by the
 * timezone field). Chains two existing tasks:
 *
 *   1. ingestSmartleadReplies  — pulls new positive replies from Smartlead
 *                                into prw_threads + prw_messages.
 *   2. classifyReplies         — scores any unclassified threads at the
 *                                latest prompt_version.
 *
 * Failure handling:
 *   Both child tasks are independent jobs. If today's ingest fails we
 *   STILL run classify, because classify operates on the full set of
 *   unclassified threads — it can catch up older work even when this run's
 *   ingest didn't add anything. The two failures surface independently in
 *   the Trigger.dev dashboard; the project's built-in alert wiring handles
 *   the operator notification (the in-task Slack notification is M11's
 *   deferred follow-up — see docs/m11-runbook.md).
 *
 * Manual re-trigger:
 *   - From the dashboard: hit Trigger on this task (no payload needed).
 *   - Or trigger the children directly with their own payloads — see
 *     docs/m11-runbook.md.
 */

import { schedules, logger } from "@trigger.dev/sdk";
import { ingestSmartleadReplies } from "./ingest-smartlead-replies.js";
import { classifyReplies } from "./classify-replies.js";

interface RunSummary {
  ingest: { ok: boolean; runId?: string; threadsInserted?: number; error?: string };
  classify: { ok: boolean; runId?: string; classified?: number; highQuality?: number; error?: string };
}

export const scheduledIngestAndClassify = schedules.task({
  id: "scheduled-ingest-and-classify",
  // 08:00 London daily — Trigger.dev handles BST/GMT switches via the
  // timezone field, so the wall-time stays at 8 AM regardless of the season.
  cron: { pattern: "0 8 * * *", timezone: "Europe/London" },
  run: async (): Promise<RunSummary> => {
    logger.info("Daily ingest+classify scheduled run starting");

    const summary: RunSummary = {
      ingest: { ok: false },
      classify: { ok: false },
    };

    // 1. Ingest. Empty payload = full sweep across all clients/campaigns.
    const ingestResult = await ingestSmartleadReplies.triggerAndWait({});
    if (ingestResult.ok) {
      summary.ingest = {
        ok: true,
        runId: ingestResult.id,
        threadsInserted: ingestResult.output.threadsInserted,
      };
      logger.info("Ingest finished", { ingest: summary.ingest });
    } else {
      summary.ingest = {
        ok: false,
        runId: ingestResult.id,
        error: ingestResult.error instanceof Error ? ingestResult.error.message : String(ingestResult.error ?? "unknown"),
      };
      logger.error("Ingest failed — continuing to classify", { ingest: summary.ingest });
      // Deliberately continuing — classify is independent.
    }

    // 2. Classify. Empty payload = classify all unclassified threads at the
    // latest prompt_version.
    const classifyResult = await classifyReplies.triggerAndWait({});
    if (classifyResult.ok) {
      summary.classify = {
        ok: true,
        runId: classifyResult.id,
        classified: classifyResult.output.threadsClassified,
        highQuality: classifyResult.output.threadsHighQuality,
      };
      logger.info("Classify finished", { classify: summary.classify });
    } else {
      summary.classify = {
        ok: false,
        runId: classifyResult.id,
        error: classifyResult.error instanceof Error ? classifyResult.error.message : String(classifyResult.error ?? "unknown"),
      };
      logger.error("Classify failed", { classify: summary.classify });
    }

    logger.info("Daily run summary", { summary });
    return summary;
  },
});
