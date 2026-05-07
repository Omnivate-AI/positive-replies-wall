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

/**
 * Retry transient fetch failures (`TypeError: fetch failed` from undici).
 * Node 20 + supabase-js occasionally drops a connection — without a retry
 * the wall page returns 500 even when the data is healthy.
 *
 * Retries: 3 attempts with exponential backoff (200ms, 400ms). After the
 * final attempt, returns the result of the last call (which the caller
 * can handle — typically by surfacing the error in the response).
 */
async function withRetry<T>(label: string, fn: () => PromiseLike<T>): Promise<T> {
  const ATTEMPTS = 3;
  let lastErr: unknown;
  for (let i = 0; i < ATTEMPTS; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const isFetchFail =
        e instanceof TypeError && /fetch failed/i.test(e.message);
      if (!isFetchFail || i === ATTEMPTS - 1) break;
      await new Promise((r) => setTimeout(r, 200 * Math.pow(2, i)));
      console.warn(
        `[supabase-public] ${label} retry ${i + 1}/${ATTEMPTS - 1} after fetch failure`,
      );
    }
  }
  throw lastErr;
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
  /** All highlight phrases for this thread (auto_classifier + admin merged).
   * Multiple per thread allowed; renderer wraps each occurrence in a purple
   * wash. Truncation anchors on the first highlight found in body. */
  highlights: string[];
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
      total_score,
      thread:prw_threads!inner(
        id,
        lead_first_name,
        lead_last_name,
        lead_email
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
    total_score: number;
    thread: {
      id: number;
      lead_first_name: string | null;
      lead_last_name: string | null;
      lead_email: string;
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

  // 4. Redactions + highlights for these threads.
  const [redResp, hlResp] = await Promise.all([
    sb.from("prw_redactions").select("thread_id, text").in("thread_id", threadIds),
    sb.from("prw_highlights").select("thread_id, text").in("thread_id", threadIds),
  ]);
  if (redResp.error) throw new Error(`getWallThreads redactions: ${redResp.error.message}`);
  if (hlResp.error) throw new Error(`getWallThreads highlights: ${hlResp.error.message}`);
  const redsByThread = new Map<number, Set<string>>();
  for (const r of (redResp.data ?? []) as { thread_id: number; text: string }[]) {
    if (!redsByThread.has(r.thread_id)) redsByThread.set(r.thread_id, new Set());
    redsByThread.get(r.thread_id)!.add(r.text);
  }
  const hlsByThread = new Map<number, string[]>();
  for (const h of (hlResp.data ?? []) as { thread_id: number; text: string }[]) {
    if (!hlsByThread.has(h.thread_id)) hlsByThread.set(h.thread_id, []);
    hlsByThread.get(h.thread_id)!.push(h.text);
  }

  return typed.map((r) => {
    const fullName = [r.thread.lead_first_name, r.thread.lead_last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    const msg = msgByThread.get(r.thread_id);
    const reds = redsByThread.get(r.thread_id);
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
      highlights: hlsByThread.get(r.thread_id) ?? [],
      received_at: msg?.sent_at ?? null,
      redactions: Array.from(allRedactions),
      total_score: r.total_score,
    };
  });
}

/** Fetch all published threads for the public wall, sorted per the M10 brief:
 * display_priority ASC, total_score DESC, qualifying-message sent_at DESC.
 * Filters require is_published=true AND a non-empty highlight (so the 4
 * borderline-pass threads with empty classifier highlights never reach
 * the wall). */
export async function getPublishedWallThreads(): Promise<WallThread[]> {
  const sb = getClient();

  // 1. Latest prompt version present.
  const { data: latest } = await withRetry("latest prompt_version", () =>
    sb
      .from("prw_classifications")
      .select("prompt_version")
      .order("prompt_version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  );
  const promptVersion = latest?.prompt_version ?? "v2.0";

  // 2. All published threads with at least one highlight, plus their
  // classification + publish state.
  const { data: rows, error } = await withRetry("getPublishedWallThreads", () =>
    sb
      .from("prw_threads")
      .select(
        `
        id,
        lead_first_name,
        lead_last_name,
        lead_email,
        classification:prw_classifications!inner(total_score, cleaned_reply_text, prompt_version, is_high_quality),
        publish_state:prw_publish_state!inner(is_published, display_priority),
        highlights:prw_highlights!inner(text)
        `,
      )
      .eq("classification.prompt_version", promptVersion)
      .eq("publish_state.is_published", true),
  );
  if (error) throw new Error(`getPublishedWallThreads: ${error.message}`);

  // Postgrest embed shape: 1:1 relations (FK to PK) come back as a single
  // object; 1:N come back as an array. prw_publish_state.thread_id is PK,
  // so publish_state is an object (or null). prw_classifications and
  // prw_highlights have non-unique thread_id, so they're arrays.
  type Row = {
    id: number;
    lead_first_name: string | null;
    lead_last_name: string | null;
    lead_email: string;
    classification: {
      total_score: number;
      cleaned_reply_text: string | null;
      prompt_version: string;
      is_high_quality: boolean;
    }[];
    publish_state: { is_published: boolean; display_priority: number } | null;
    highlights: { text: string }[];
  };

  const typed = (rows ?? []) as unknown as Row[];
  const threadIds = typed.map((r) => r.id);
  if (threadIds.length === 0) return [];

  // Qualifying messages
  const { data: msgs } = await withRetry("wall: messages", () =>
    sb
      .from("prw_messages")
      .select("thread_id, subject, sent_at, to_email")
      .in("thread_id", threadIds)
      .eq("is_qualifying_reply", true),
  );
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
    msgByThread.set(m.thread_id, m);
  }

  // Redactions
  const { data: reds } = await withRetry("wall: redactions", () =>
    sb.from("prw_redactions").select("thread_id, text").in("thread_id", threadIds),
  );
  const redsByThread = new Map<number, Set<string>>();
  for (const r of (reds ?? []) as { thread_id: number; text: string }[]) {
    if (!redsByThread.has(r.thread_id)) redsByThread.set(r.thread_id, new Set());
    redsByThread.get(r.thread_id)!.add(r.text);
  }

  // Bullet-proof field access — every nested resource gets optional
  // chaining + a fallback. Postgrest's `!inner` with nested filters
  // sometimes returns the parent row with an empty embedded array; this
  // map handles that without throwing, and the subsequent .filter drops
  // rows that lacked a real classification.
  return typed
    .map((r) => {
      const fullName = [r.lead_first_name, r.lead_last_name]
        .filter(Boolean)
        .join(" ")
        .trim();
      const c = r.classification?.[0];
      const ps = r.publish_state; // single object (1:1 via PK)
      const hls = r.highlights ?? [];
      const msg = msgByThread.get(r.id);
      const reds = redsByThread.get(r.id);
      const redactions = new Set<string>(reds ?? []);
      for (const n of SDR_FIRST_NAMES) redactions.add(n);
      return {
        thread_id: r.id,
        from_email: r.lead_email,
        from_display_name: fullName.length > 0 ? fullName : null,
        to_email: msg?.to_email ?? null,
        subject: msg?.subject ?? null,
        body: c?.cleaned_reply_text ?? "",
        highlights: hls.map((h) => h.text),
        received_at: msg?.sent_at ?? null,
        redactions: Array.from(redactions),
        total_score: c?.total_score ?? 0,
        _ok: !!(c && ps && hls.length > 0),
        _sortKey: {
          priority: ps?.display_priority ?? 0,
          score: c?.total_score ?? 0,
          sentAt: msg?.sent_at ?? "",
        },
      };
    })
    .filter((t) => t._ok)
    .sort((a, b) => {
      // display_priority ASC (lower number = more prominent? actually higher
      // is more prominent per the schema comment, so DESC). total_score DESC.
      // sent_at DESC.
      if (a._sortKey.priority !== b._sortKey.priority) {
        return b._sortKey.priority - a._sortKey.priority;
      }
      if (a._sortKey.score !== b._sortKey.score) {
        return b._sortKey.score - a._sortKey.score;
      }
      return b._sortKey.sentAt.localeCompare(a._sortKey.sentAt);
    })
    .map(({ _sortKey: _s, _ok: _o, ...rest }) => {
      void _s;
      void _o;
      return rest;
    });
}

export interface AdminThread {
  thread_id: number;
  from_email: string;
  from_display_name: string | null;
  to_email: string | null;
  subject: string | null;
  body: string;
  received_at: string | null;
  total_score: number;
  is_high_quality: boolean;
  is_published: boolean;
  display_priority: number;
  redactions: { id: number; text: string; source: string }[];
  highlights: { id: number; text: string; source: string }[];
}

/** Fetch ALL threads for the admin dashboard — published or not, scored or
 * not. Includes per-redaction id + source so the admin can delete only the
 * admin-added entries (auto_lead / auto_classifier are immutable in the UI). */
export async function getAdminThreads(): Promise<AdminThread[]> {
  const sb = getClient();

  // Threads + classifications + publish state, all in one Postgrest nested
  // select. order by classification.total_score desc.
  const { data: threadRows, error: tErr } = await sb
    .from("prw_threads")
    .select(
      `
      id,
      lead_first_name,
      lead_last_name,
      lead_email,
      classification:prw_classifications(total_score, is_high_quality, cleaned_reply_text, prompt_version),
      publish_state:prw_publish_state(is_published, display_priority)
      `,
    )
    .order("ingested_at", { ascending: false });
  if (tErr) throw new Error(`getAdminThreads threads: ${tErr.message}`);

  // Postgrest 1:1 (FK to PK) → single object; 1:N → array.
  // prw_publish_state is 1:1 (thread_id is PK).
  type RawThreadRow = {
    id: number;
    lead_first_name: string | null;
    lead_last_name: string | null;
    lead_email: string;
    classification:
      | {
          total_score: number;
          is_high_quality: boolean;
          cleaned_reply_text: string | null;
          prompt_version: string;
        }[]
      | null;
    publish_state: { is_published: boolean; display_priority: number } | null;
  };

  const rows = (threadRows ?? []) as unknown as RawThreadRow[];
  const threadIds = rows.map((r) => r.id);
  if (threadIds.length === 0) return [];

  // Qualifying messages
  const { data: msgs } = await sb
    .from("prw_messages")
    .select("thread_id, subject, sent_at, to_email")
    .in("thread_id", threadIds)
    .eq("is_qualifying_reply", true);
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
    msgByThread.set(m.thread_id, m);
  }

  // Redactions + highlights with id + source so admin UI can selectively
  // delete only the admin-source rows (auto entries are immutable).
  const [redResp, hlResp] = await Promise.all([
    sb.from("prw_redactions").select("id, thread_id, text, source").in("thread_id", threadIds),
    sb.from("prw_highlights").select("id, thread_id, text, source").in("thread_id", threadIds),
  ]);
  const redsByThread = new Map<
    number,
    { id: number; text: string; source: string }[]
  >();
  for (const r of (redResp.data ?? []) as {
    id: number;
    thread_id: number;
    text: string;
    source: string;
  }[]) {
    if (!redsByThread.has(r.thread_id)) redsByThread.set(r.thread_id, []);
    redsByThread.get(r.thread_id)!.push({ id: r.id, text: r.text, source: r.source });
  }
  const hlsByThread = new Map<
    number,
    { id: number; text: string; source: string }[]
  >();
  for (const h of (hlResp.data ?? []) as {
    id: number;
    thread_id: number;
    text: string;
    source: string;
  }[]) {
    if (!hlsByThread.has(h.thread_id)) hlsByThread.set(h.thread_id, []);
    hlsByThread.get(h.thread_id)!.push({ id: h.id, text: h.text, source: h.source });
  }

  return rows.map((r) => {
    const fullName = [r.lead_first_name, r.lead_last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    // Pick the latest classification (highest prompt_version).
    const classifs = r.classification ?? [];
    const latest = classifs.length > 0
      ? [...classifs].sort((a, b) => b.prompt_version.localeCompare(a.prompt_version))[0]
      : null;
    const ps = r.publish_state ?? null; // single object via 1:1 FK
    const msg = msgByThread.get(r.id);
    return {
      thread_id: r.id,
      from_email: r.lead_email,
      from_display_name: fullName.length > 0 ? fullName : null,
      to_email: msg?.to_email ?? null,
      subject: msg?.subject ?? null,
      body: latest?.cleaned_reply_text ?? "",
      received_at: msg?.sent_at ?? null,
      total_score: latest?.total_score ?? 0,
      is_high_quality: latest?.is_high_quality ?? false,
      is_published: ps?.is_published ?? false,
      display_priority: ps?.display_priority ?? 0,
      redactions: redsByThread.get(r.id) ?? [],
      highlights: hlsByThread.get(r.id) ?? [],
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
