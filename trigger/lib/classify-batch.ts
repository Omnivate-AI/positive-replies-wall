/**
 * Batch classifier orchestrator. Pure of Trigger.dev imports — same code path
 * runs in the Trigger.dev task wrapper and the local CLI runner.
 *
 * Flow:
 *   1. Find replies in prw_replies that don't yet have a classification at the
 *      current PROMPT_VERSION.
 *   2. For each: call classifyReply(), upsert into prw_classifications with
 *      ON CONFLICT(reply_id, prompt_version) DO NOTHING.
 *   3. Track stats; surface per-reply errors without aborting the batch.
 *
 * Idempotency: re-running with the same PROMPT_VERSION is a no-op (already-
 * classified replies are filtered out by the LEFT JOIN). Bumping PROMPT_VERSION
 * causes every reply to be re-classified on the next run.
 */

import { classifyReply, type ClassifyInput, type ClassifyResult, PROMPT_VERSION } from "./classify.js";
import { supabase } from "./supabase.js";
import { retry, isTransientFetchError } from "./retry.js";

export interface ClassifyBatchStats {
  promptVersion: string;
  repliesPending: number;
  repliesClassified: number;
  repliesHighQuality: number;
  errors: string[];
}

export interface ClassifyBatchOptions {
  /** Restrict to specific reply IDs (default: all unclassified at PROMPT_VERSION). */
  replyIds?: number[];
  /** Cap how many to classify in this run (default: unlimited). */
  limit?: number;
  /** Concurrency — how many OpenRouter calls in flight at once. Default 5. */
  concurrency?: number;
  onProgress?: (msg: string) => void;
}

interface ReplyRow {
  id: number;
  reply_subject: string | null;
  reply_body_html: string;
  reply_from_email: string;
  lead_first_name: string | null;
  lead_last_name: string | null;
  lead_company_name: string | null;
}

async function fetchPendingReplies(opts: ClassifyBatchOptions): Promise<ReplyRow[]> {
  const sb = supabase();
  // Pull the IDs of replies that already have a classification at this prompt version.
  const { data: classified, error: classErr } = await sb
    .from("prw_classifications")
    .select("reply_id")
    .eq("prompt_version", PROMPT_VERSION);
  if (classErr) throw new Error(`fetch classifications: ${classErr.message}`);

  const classifiedIds = new Set((classified ?? []).map((r) => (r as { reply_id: number }).reply_id));

  let q = sb
    .from("prw_replies")
    .select(
      "id, reply_subject, reply_body_html, reply_from_email, lead_first_name, lead_last_name, lead_company_name",
    )
    .order("id", { ascending: true });
  if (opts.replyIds && opts.replyIds.length > 0) q = q.in("id", opts.replyIds);
  if (opts.limit) q = q.limit(opts.limit);

  const { data, error } = await q;
  if (error) throw new Error(`fetch replies: ${error.message}`);

  return ((data ?? []) as ReplyRow[]).filter((r) => !classifiedIds.has(r.id));
}

async function writeClassification(
  replyId: number,
  result: ClassifyResult,
): Promise<void> {
  const sb = supabase();
  await retry(
    async () => {
      const res = await sb.from("prw_classifications").upsert(
        {
          reply_id: replyId,
          praise_score: result.praise_score,
          specificity_score: result.specificity_score,
          authenticity_score: result.authenticity_score,
          standalone_score: result.standalone_score,
          is_high_quality: result.is_high_quality,
          categories: result.categories,
          reasoning: result.reasoning,
          cleaned_reply_text: result.cleaned_reply_text,
          prompt_version: PROMPT_VERSION,
        },
        { onConflict: "reply_id,prompt_version", ignoreDuplicates: true },
      );
      if (res.error) throw new Error(res.error.message);
      return res;
    },
    { isRetryable: isTransientFetchError },
  );
}

export async function runClassifyBatch(
  opts: ClassifyBatchOptions = {},
): Promise<ClassifyBatchStats> {
  const log = opts.onProgress ?? ((m: string) => console.log(m));
  const concurrency = Math.max(1, opts.concurrency ?? 5);

  const stats: ClassifyBatchStats = {
    promptVersion: PROMPT_VERSION,
    repliesPending: 0,
    repliesClassified: 0,
    repliesHighQuality: 0,
    errors: [],
  };

  const pending = await fetchPendingReplies(opts);
  stats.repliesPending = pending.length;
  log(`Pending classifications at ${PROMPT_VERSION}: ${pending.length}`);
  if (pending.length === 0) return stats;

  // Simple concurrency: run a sliding window of `concurrency` promises.
  let cursor = 0;
  const inflight = new Set<Promise<void>>();

  const launch = (reply: ReplyRow): Promise<void> => {
    const input: ClassifyInput = {
      reply_subject: reply.reply_subject,
      reply_body: reply.reply_body_html,
      reply_from_email: reply.reply_from_email,
      lead_first_name: reply.lead_first_name,
      lead_last_name: reply.lead_last_name,
      lead_company_name: reply.lead_company_name,
    };
    const p = (async () => {
      try {
        const result = await classifyReply(input);
        await writeClassification(reply.id, result);
        stats.repliesClassified++;
        if (result.is_high_quality) stats.repliesHighQuality++;
        if (stats.repliesClassified % 25 === 0) {
          log(`  classified ${stats.repliesClassified}/${pending.length}`);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        stats.errors.push(`reply ${reply.id}: ${msg}`);
      }
    })();
    inflight.add(p);
    p.finally(() => inflight.delete(p));
    return p;
  };

  while (cursor < pending.length || inflight.size > 0) {
    while (inflight.size < concurrency && cursor < pending.length) {
      launch(pending[cursor++]);
    }
    if (inflight.size > 0) await Promise.race(inflight);
  }

  log(
    `Done: ${stats.repliesClassified}/${pending.length} classified, ${stats.repliesHighQuality} high-quality, ${stats.errors.length} errors`,
  );
  return stats;
}
