/**
 * Service-role Supabase client for server-side ADMIN writes.
 *
 * Distinct from `lib/supabase-public.ts` (anon key, RLS-gated, public reads)
 * and `trigger/lib/supabase.ts` (service-role, used by Trigger.dev workers).
 *
 * Used by /api/admin/* routes. Service-role bypasses RLS so toggling
 * publish state, editing redactions, etc. always succeeds. Never expose
 * this client to client-side code.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import ws from "ws";

let _client: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("SUPABASE_URL is not set");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Node 20 lacks a native WebSocket; supabase-js's Realtime client crashes
    // at construction without one. We don't use Realtime — this just satisfies
    // the constructor in vitest + any non-Vercel runtime.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    realtime: { transport: ws as unknown as any },
  });
  return _client;
}
