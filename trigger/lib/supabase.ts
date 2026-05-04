/**
 * Supabase client for the positive-replies-wall Trigger.dev tasks.
 *
 * Uses the service-role key (bypasses RLS) since this is server-side code
 * running in trusted contexts (Trigger.dev workers + local scripts).
 * Never use this key from client-side code.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import ws from "ws";

let _client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("SUPABASE_URL is not set");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");

  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Node 20 lacks a native WebSocket. supabase-js's Realtime client crashes
    // at construction without one, so we hand it the `ws` polyfill. We don't
    // actually use Realtime; this just satisfies the constructor.
    // `ws` and `WebSocketLikeConstructor` are runtime-compatible but typed
    // differently — cast through unknown to silence the strict mismatch.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    realtime: { transport: ws as unknown as any },
  });
  return _client;
}
