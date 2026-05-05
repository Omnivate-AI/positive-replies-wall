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

/** Used by the /coming-soon page (M8) and any future public read of the
 * top-line numbers. Always pulls fresh counts — no client-side caching. */
export async function getReplyStats(): Promise<ReplyStats> {
  const sb = getClient();

  const { count: totalReplies, error: totalErr } = await sb
    .from("prw_replies")
    .select("*", { count: "exact", head: true });
  if (totalErr) throw new Error(`getReplyStats totalReplies: ${totalErr.message}`);

  // Find the latest PROMPT_VERSION present in the table — counting against the
  // most recent classifier version is the meaningful "publish-worthy" number.
  const { data: latestRow, error: latestErr } = await sb
    .from("prw_classifications")
    .select("prompt_version")
    .order("prompt_version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestErr) throw new Error(`getReplyStats latestRow: ${latestErr.message}`);
  const promptVersion = latestRow?.prompt_version ?? "v1.2";

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
