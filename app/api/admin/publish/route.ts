/**
 * POST /api/admin/publish
 *
 * Toggle publish state and/or update display priority on a thread.
 * Auth-gated: caller must have a valid Supabase session AND be on the
 * ADMIN_EMAILS allowlist. Writes use service-role to bypass RLS.
 *
 * Body shape:
 *   { thread_id: number, is_published?: boolean, display_priority?: number }
 *
 * Returns 200 with the updated row, or 401/400 on auth/validation failure.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";

const BodySchema = z.object({
  thread_id: z.number().int().positive(),
  is_published: z.boolean().optional(),
  display_priority: z.number().int().min(0).max(10000).optional(),
});

export async function POST(request: NextRequest) {
  let parsed: z.infer<typeof BodySchema>;
  try {
    parsed = BodySchema.parse(await request.json());
  } catch (e) {
    return NextResponse.json(
      { error: "invalid_body", message: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
  if (parsed.is_published === undefined && parsed.display_priority === undefined) {
    return NextResponse.json({ error: "no_changes" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const update: Record<string, unknown> = {
    edited_by: "open-access",
    edited_at: new Date().toISOString(),
  };
  if (parsed.is_published !== undefined) {
    update.is_published = parsed.is_published;
    if (parsed.is_published) update.published_at = new Date().toISOString();
  }
  if (parsed.display_priority !== undefined) {
    update.display_priority = parsed.display_priority;
  }

  const { data, error } = await sb
    .from("prw_publish_state")
    .upsert({ thread_id: parsed.thread_id, ...update }, { onConflict: "thread_id" })
    .select()
    .single();
  if (error) {
    return NextResponse.json({ error: "db_error", message: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, publish_state: data });
}
