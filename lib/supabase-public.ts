/**
 * Server-side Supabase client for the Next.js app's PUBLIC reads.
 *
 * Uses the anon (publishable) key, which is RLS-gated and safe to expose. This
 * client is read-only by convention — writes happen exclusively from the
 * Trigger.dev tasks (which use the service-role key in `trigger/lib/supabase.ts`).
 *
 * Lives at /lib (not /trigger/lib) because Next.js Server Components import
 * from here and don't need the `ws` polyfill / service-role concerns from the
 * Trigger.dev path.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SDR_FIRST_NAMES } from "./sdr";

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url) throw new Error("SUPABASE_URL is not set");
  if (!key) throw new Error("SUPABASE_ANON_KEY is not set");
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

export interface ReplyStats {
  totalReplies: number;
  highQualityCount: number;
  promptVersion: string;
}

export interface WallThread {
  thread_id: number;
  from_email: string;
  from_display_name: string | null;
  /** SDR mailbox the lead replied to (the "to" of the inbound message).
   * Reads as a real email reply on the wall once redacted. */
  to_email: string | null;
  subject: string | null;
  /** Cleaned reply text (plaintext) — what the AI scored. */
  body: string;
  /** Admin-final highlight (falls back to classifier-suggested when admin
   * hasn't edited). */
  highlight: string | null;
  /** ISO timestamp of the qualifying inbound message. */
  received_at: string | null;
  /** Distinct redaction strings to mask, deduped across all sources. */
  redactions: string[];
  total_score: number;
}

/** Fetch the top N high-quality threads at the latest prompt version, with
 * everything needed to render a WallReplyCard. Used by /demo and (later) by
 * the public wall in M10. */
export async function getWallThreads(limit = 10): Promise<WallThread[]> {
  const sb = getClient();

  // 1. Latest prompt_version present.
  const { data: latest } = await sb
    .from("prw_classifications")
    .select("prompt_version")
    .order("prompt_version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const promptVersion = latest?.prompt_version ?? "v2.0";

  // 2. Top N high-quality classifications + their threads.
  const { data: rows, error: cErr } = await sb
    .from("prw_classifications")
    .select(
      `
      thread_id,
      cleaned_reply_text,
      suggested_highlight_text,
      total_score,
      thread:prw_threads!inner(
        id,
        lead_first_name,
        lead_last_name,
        lead_email,
        highlight_text
      )
      `,
    )
    .eq("prompt_version", promptVersion)
    .eq("is_high_quality", true)
    .order("total_score", { ascending: false })
    .limit(limit);
  if (cErr) throw new Error(`getWallThreads classifications: ${cErr.message}`);

  type Row = {
    thread_id: number;
    cleaned_reply_text: string | null;
    suggested_highlight_text: string | null;
    total_score: number;
    thread: {
      id: number;
      lead_first_name: string | null;
      lead_last_name: string | null;
      lead_email: string;
      highlight_text: string | null;
    };
  };

  const typed = (rows ?? []) as unknown as Row[];
  const threadIds = typed.map((r) => r.thread_id);
  if (threadIds.length === 0) return [];

  // 3. Qualifying inbound message per thread (for subject, sent_at, to_email).
  const { data: msgs, error: mErr } = await sb
    .from("prw_messages")
    .select("thread_id, subject, sent_at, to_email")
    .in("thread_id", threadIds)
    .eq("is_qualifying_reply", true);
  if (mErr) throw new Error(`getWallThreads messages: ${mErr.message}`);
  const msgByThread = new Map<
    number,
    { subject: string | null; sent_at: string; to_email: string | null }
  >();
  for (const m of (msgs ?? []) as {
    thread_id: number;
    subject: string | null;
    sent_at: string;
    to_email: string | null;
  }[]) {
    msgByThread.set(m.thread_id, {
      subject: m.subject,
      sent_at: m.sent_at,
      to_email: m.to_email,
    });
  }

  // 4. All redactions (auto_lead + auto_classifier + admin) for these threads.
  const { data: reds, error: rErr } = await sb
    .from("prw_redactions")
    .select("thread_id, text")
    .in("thread_id", threadIds);
  if (rErr) throw new Error(`getWallThreads redactions: ${rErr.message}`);
  const redsByThread = new Map<number, Set<string>>();
  for (const r of (reds ?? []) as { thread_id: number; text: string }[]) {
    if (!redsByThread.has(r.thread_id)) redsByThread.set(r.thread_id, new Set());
    redsByThread.get(r.thread_id)!.add(r.text);
  }

  return typed.map((r) => {
    const fullName = [r.thread.lead_first_name, r.thread.lead_last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    const msg = msgByThread.get(r.thread_id);
    const reds = redsByThread.get(r.thread_id);
    // Augment with SDR first names — the wall masks our own SDRs alongside
    // the lead's identity for uniform visual treatment. Also include the
    // recipient SDR mailbox (`to_email` of the qualifying inbound) so the
    // mailbox domain doesn't leak ("christie@████" vs "████████████").
    const allRedactions = new Set<string>(reds ?? []);
    for (const name of SDR_FIRST_NAMES) allRedactions.add(name);
    if (msg?.to_email) allRedactions.add(msg.to_email);
    return {
      thread_id: r.thread_id,
      from_email: r.thread.lead_email,
      from_display_name: fullName.length > 0 ? fullName : null,
      to_email: msg?.to_email ?? null,
      subject: msg?.subject ?? null,
      body: r.cleaned_reply_text ?? "",
      highlight: r.thread.highlight_text || r.suggested_highlight_text || null,
      received_at: msg?.sent_at ?? null,
      redactions: Array.from(allRedactions),
      total_score: r.total_score,
    };
  });
}

/** Used by the /coming-soon page (M8) and any future public read of the
 * top-line numbers. Always pulls fresh counts — no client-side caching.
 *
 * Under the v2.0 thread model, "totalReplies" is the count of threads (each
 * thread has exactly one qualifying reply, so it's a 1:1 number that matches
 * what visitors expect). */
export async function getReplyStats(): Promise<ReplyStats> {
  const sb = getClient();

  const { count: totalReplies, error: totalErr } = await sb
    .from("prw_threads")
    .select("*", { count: "exact", head: true });
  if (totalErr) throw new Error(`getReplyStats totalReplies: ${totalErr.message}`);

  const { data: latestRow, error: latestErr } = await sb
    .from("prw_classifications")
    .select("prompt_version")
    .order("prompt_version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestErr) throw new Error(`getReplyStats latestRow: ${latestErr.message}`);
  const promptVersion = latestRow?.prompt_version ?? "v2.0";

  const { count: highQualityCount, error: hqErr } = await sb
    .from("prw_classifications")
    .select("*", { count: "exact", head: true })
    .eq("is_high_quality", true)
    .eq("prompt_version", promptVersion);
  if (hqErr) throw new Error(`getReplyStats highQualityCount: ${hqErr.message}`);

  return {
    totalReplies: totalReplies ?? 0,
    highQualityCount: highQualityCount ?? 0,
    promptVersion,
  };
}
