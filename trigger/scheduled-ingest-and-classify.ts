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

interface StageSummary {
  ok: boolean;
  runId?: string;
  error?: string;
}
interface IngestSummary extends StageSummary {
  threadsInserted?: number;
}
interface ClassifySummary extends StageSummary {
  classified?: number;
  highQuality?: number;
}
interface RunSummary {
  ingest: IngestSummary;
  classify: ClassifySummary;
}

const errString = (e: unknown): string =>
  e instanceof Error ? e.message : String(e ?? "unknown");

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

    // ── Stage 1: Ingest ────────────────────────────────────────────────────
    // Each stage is wrapped in its own try/catch so an exception in one
    // CANNOT prevent the next stage from running. (The earlier version of
    // this task crashed silently between stages when `result.output` was
    // undefined, leaving the daily run with ingest done but classify never
    // fired.)
    logger.info("Entering stage: ingest");
    try {
      const r = await ingestSmartleadReplies.triggerAndWait({});
      if (r.ok) {
        summary.ingest = {
          ok: true,
          runId: r.id,
          threadsInserted: r.output?.threadsInserted ?? 0,
        };
      } else {
        summary.ingest = {
          ok: false,
          runId: r.id,
          error: errString(r.error),
        };
      }
    } catch (e) {
      summary.ingest = { ok: false, error: errString(e) };
      logger.error("Ingest stage threw", { error: errString(e) });
    }
    logger.info("Stage done: ingest", { ingest: summary.ingest });

    // ── Stage 2: Classify ──────────────────────────────────────────────────
    // Independent of ingest's outcome — classify can catch up older
    // unclassified threads even if today's ingest pulled nothing new.
    logger.info("Entering stage: classify");
    try {
      const r = await classifyReplies.triggerAndWait({});
      if (r.ok) {
        summary.classify = {
          ok: true,
          runId: r.id,
          classified: r.output?.threadsClassified ?? 0,
          highQuality: r.output?.threadsHighQuality ?? 0,
        };
      } else {
        summary.classify = {
          ok: false,
          runId: r.id,
          error: errString(r.error),
        };
      }
    } catch (e) {
      summary.classify = { ok: false, error: errString(e) };
      logger.error("Classify stage threw", { error: errString(e) });
    }
    logger.info("Stage done: classify", { classify: summary.classify });

    logger.info("Daily run summary", { summary });
    return summary;
  },
});
