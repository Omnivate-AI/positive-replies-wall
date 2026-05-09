/**
 * GET /api/admin/threads/[id]
 *
 * Returns the full message timeline for a thread (every outbound step +
 * every inbound). Powers the admin's "Full thread" tab — the internal
 * "what we said that earned the reply" view.
 *
 * Internal-only — does not affect the public wall. Open access (admin
 * surface), no auth check.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";

const ParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export interface AdminThreadMessage {
  id: number;
  direction: "outbound" | "inbound";
  is_qualifying_reply: boolean;
  email_seq_number: number | null;
  from_name: string | null;
  from_email: string;
  to_email: string | null;
  subject: string | null;
  body_html: string | null;
  body_text: string | null;
  sent_at: string;
}

export interface AdminThreadDetail {
  thread_id: number;
  unibox_url: string | null;
  messages: AdminThreadMessage[];
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const raw = await context.params;
  const parsed = ParamsSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_id", message: parsed.error.message },
      { status: 400 },
    );
  }
  const threadId = parsed.data.id;
  const sb = supabaseAdmin();

  // Fetch thread (for unibox_url) + all messages in chronological order.
  const [threadResp, msgResp] = await Promise.all([
    sb.from("prw_threads").select("id, unibox_url").eq("id", threadId).single(),
    sb
      .from("prw_messages")
      .select(
        `id, direction, is_qualifying_reply, smartlead_email_seq_number,
         from_name, from_email, to_email, subject, body_html, body_text, sent_at`,
      )
      .eq("thread_id", threadId)
      .order("sent_at", { ascending: true }),
  ]);

  if (threadResp.error) {
    return NextResponse.json(
      { error: "thread_not_found", message: threadResp.error.message },
      { status: threadResp.error.code === "PGRST116" ? 404 : 500 },
    );
  }
  if (msgResp.error) {
    return NextResponse.json(
      { error: "messages_fetch_failed", message: msgResp.error.message },
      { status: 500 },
    );
  }

  const messages: AdminThreadMessage[] = (msgResp.data ?? []).map((m) => ({
    id: m.id,
    direction: m.direction,
    is_qualifying_reply: m.is_qualifying_reply,
    email_seq_number: m.smartlead_email_seq_number ?? null,
    from_name: m.from_name,
    from_email: m.from_email,
    to_email: m.to_email,
    subject: m.subject,
    body_html: m.body_html,
    body_text: m.body_text,
    sent_at: m.sent_at,
  }));

  const result: AdminThreadDetail = {
    thread_id: threadId,
    unibox_url: threadResp.data.unibox_url,
    messages,
  };
  return NextResponse.json(result);
}
