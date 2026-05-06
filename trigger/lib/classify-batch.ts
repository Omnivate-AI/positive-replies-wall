/**
 * Batch classifier orchestrator. Pure of Trigger.dev imports — same code path
 * runs in the Trigger.dev task wrapper and the local CLI runner.
 *
 * Flow under the v2.0 thread model:
 *   1. Find threads in prw_threads that don't yet have a classification at the
 *      current PROMPT_VERSION.
 *   2. For each: load the qualifying inbound message, call classifyReply(),
 *      upsert into prw_classifications with ON CONFLICT(thread_id, prompt_version) DO NOTHING.
 *   3. Copy the classifier's suggested_highlight_text onto prw_threads.highlight_text
 *      ONLY when the thread has no admin-set highlight yet. Admin edits survive
 *      re-classification.
 *   4. Seed prw_redactions for each classifier-suggested third-party name with
 *      source='auto_classifier'.
 *
 * Idempotency: re-running with the same PROMPT_VERSION is a no-op (already-
 * classified threads are filtered out). Bumping PROMPT_VERSION causes every
 * thread to be re-classified on the next run; admin-edited highlight_text
 * survives the re-classification.
 */

import {
  classifyReply,
  type ClassifyInput,
  type ClassifyResult,
  PROMPT_VERSION,
} from "./classify.js";
import { supabase } from "./supabase.js";
import { retry, isTransientFetchError } from "./retry.js";

export interface ClassifyBatchStats {
  promptVersion: string;
  threadsPending: number;
  threadsClassified: number;
  threadsHighQuality: number;
  highlightsApplied: number;
  redactionsSeeded: number;
  errors: string[];
}

export interface ClassifyBatchOptions {
  /** Restrict to specific thread IDs (default: all unclassified at PROMPT_VERSION). */
  threadIds?: number[];
  /** Cap how many to classify in this run. */
  limit?: number;
  /** Concurrency — how many OpenRouter calls in flight at once. Default 5. */
  concurrency?: number;
  onProgress?: (msg: string) => void;
}

interface PendingThread {
  thread_id: number;
  reply_subject: string | null;
  reply_body_html: string;
  reply_from_email: string;
  lead_first_name: string | null;
  lead_last_name: string | null;
  company_name: string | null;
  has_admin_highlight: boolean;
}

async function fetchPendingThreads(
  opts: ClassifyBatchOptions,
): Promise<PendingThread[]> {
  const sb = supabase();

  // Threads already classified at this prompt version.
  const { data: classified, error: classErr } = await sb
    .from("prw_classifications")
    .select("thread_id")
    .eq("prompt_version", PROMPT_VERSION);
  if (classErr) throw new Error(`fetch classifications: ${classErr.message}`);
  const classifiedIds = new Set(
    (classified ?? []).map((r) => (r as { thread_id: number }).thread_id),
  );

  // For each thread, the qualifying inbound message gives us the reply body
  // the classifier scores against.
  let q = sb
    .from("prw_threads")
    .select(
      `id, lead_first_name, lead_last_name, company_name, highlight_text,
       prw_messages!inner(subject, body_html, from_email, is_qualifying_reply)`,
    )
    .eq("prw_messages.is_qualifying_reply", true)
    .order("id", { ascending: true });
  if (opts.threadIds && opts.threadIds.length > 0) q = q.in("id", opts.threadIds);
  if (opts.limit) q = q.limit(opts.limit);

  const { data, error } = await q;
  if (error) throw new Error(`fetch threads: ${error.message}`);

  type Row = {
    id: number;
    lead_first_name: string | null;
    lead_last_name: string | null;
    company_name: string | null;
    highlight_text: string | null;
    prw_messages: {
      subject: string | null;
      body_html: string;
      from_email: string;
      is_qualifying_reply: boolean;
    }[];
  };

  return ((data ?? []) as Row[])
    .filter((r) => !classifiedIds.has(r.id))
    .map((r) => {
      const msg = r.prw_messages[0];
      return {
        thread_id: r.id,
        reply_subject: msg?.subject ?? null,
        reply_body_html: msg?.body_html ?? "",
        reply_from_email: msg?.from_email ?? "",
        lead_first_name: r.lead_first_name,
        lead_last_name: r.lead_last_name,
        company_name: r.company_name,
        has_admin_highlight: !!(r.highlight_text && r.highlight_text.trim().length > 0),
      };
    })
    .filter((r) => r.reply_body_html); // skip if qualifying message somehow missing
}

async function writeClassification(
  thread: PendingThread,
  result: ClassifyResult,
): Promise<{ highlightApplied: boolean; redactionsSeeded: number }> {
  const sb = supabase();

  // 1. Insert the classification row (idempotent on (thread_id, prompt_version)).
  await retry(
    async () => {
      const res = await sb.from("prw_classifications").upsert(
        {
          thread_id: thread.thread_id,
          praise_score: result.praise_score,
          specificity_score: result.specificity_score,
          authenticity_score: result.authenticity_score,
          standalone_score: result.standalone_score,
          is_high_quality: result.is_high_quality,
          categories: result.categories,
          reasoning: result.reasoning,
          cleaned_reply_text: result.cleaned_reply_text,
          suggested_highlight_text: result.suggested_highlight_text || null,
          suggested_redactions: result.suggested_redactions,
          prompt_version: PROMPT_VERSION,
        },
        { onConflict: "thread_id,prompt_version", ignoreDuplicates: true },
      );
      if (res.error) throw new Error(res.error.message);
      return res;
    },
    { isRetryable: isTransientFetchError },
  );

  // 2. Copy highlight onto the thread when admin hasn't set one. Skip empty
  //    highlights (rejection cases) — leaving highlight_text null.
  let highlightApplied = false;
  if (
    !thread.has_admin_highlight &&
    result.suggested_highlight_text &&
    result.suggested_highlight_text.trim().length > 0
  ) {
    const upd = await sb
      .from("prw_threads")
      .update({ highlight_text: result.suggested_highlight_text })
      .eq("id", thread.thread_id);
    if (!upd.error) highlightApplied = true;
  }

  // 3. Seed auto_classifier redactions. Idempotent on (thread_id, text, match_type).
  let redactionsSeeded = 0;
  if (result.suggested_redactions.length > 0) {
    const rows = result.suggested_redactions.map((text) => ({
      thread_id: thread.thread_id,
      text,
      match_type: "literal",
      source: "auto_classifier",
    }));
    const res = await sb
      .from("prw_redactions")
      .upsert(rows, {
        onConflict: "thread_id,text,match_type",
        ignoreDuplicates: true,
      })
      .select("id");
    if (!res.error) redactionsSeeded = res.data?.length ?? 0;
  }

  return { highlightApplied, redactionsSeeded };
}

export async function runClassifyBatch(
  opts: ClassifyBatchOptions = {},
): Promise<ClassifyBatchStats> {
  const log = opts.onProgress ?? ((m: string) => console.log(m));
  const concurrency = Math.max(1, opts.concurrency ?? 5);

  const stats: ClassifyBatchStats = {
    promptVersion: PROMPT_VERSION,
    threadsPending: 0,
    threadsClassified: 0,
    threadsHighQuality: 0,
    highlightsApplied: 0,
    redactionsSeeded: 0,
    errors: [],
  };

  const pending = await fetchPendingThreads(opts);
  stats.threadsPending = pending.length;
  log(`Pending classifications at ${PROMPT_VERSION}: ${pending.length}`);
  if (pending.length === 0) return stats;

  let cursor = 0;
  const inflight = new Set<Promise<void>>();

  const launch = (thread: PendingThread): Promise<void> => {
    const input: ClassifyInput = {
      reply_subject: thread.reply_subject,
      reply_body: thread.reply_body_html,
      reply_from_email: thread.reply_from_email,
      lead_first_name: thread.lead_first_name,
      lead_last_name: thread.lead_last_name,
      lead_company_name: thread.company_name,
    };
    const p = (async () => {
      try {
        const result = await classifyReply(input);
        const writeStats = await writeClassification(thread, result);
        stats.threadsClassified++;
        if (result.is_high_quality) stats.threadsHighQuality++;
        if (writeStats.highlightApplied) stats.highlightsApplied++;
        stats.redactionsSeeded += writeStats.redactionsSeeded;
        if (stats.threadsClassified % 25 === 0) {
          log(`  classified ${stats.threadsClassified}/${pending.length}`);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        stats.errors.push(`thread ${thread.thread_id}: ${msg}`);
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
    `Done: ${stats.threadsClassified}/${pending.length} classified, ${stats.threadsHighQuality} high-quality, ${stats.highlightsApplied} highlights applied, ${stats.redactionsSeeded} auto_classifier redactions seeded, ${stats.errors.length} errors`,
  );
  return stats;
}
