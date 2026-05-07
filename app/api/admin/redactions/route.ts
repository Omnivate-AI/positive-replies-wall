/**
 * /api/admin/redactions
 *
 * POST: add a redaction (source = 'admin') to a thread.
 *   Body: { thread_id: number, text: string }
 *
 * DELETE: remove a redaction by id.
 *   Body: { id: number }
 *
 * Auth-gated. Writes use service-role.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";

const PostSchema = z.object({
  thread_id: z.number().int().positive(),
  text: z.string().trim().min(1).max(500),
});

const DeleteSchema = z.object({
  id: z.number().int().positive(),
});

export async function POST(request: NextRequest) {
  let parsed: z.infer<typeof PostSchema>;
  try {
    parsed = PostSchema.parse(await request.json());
  } catch (e) {
    return NextResponse.json(
      { error: "invalid_body", message: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("prw_redactions")
    .upsert(
      {
        thread_id: parsed.thread_id,
        text: parsed.text,
        match_type: "literal",
        source: "admin",
        created_by: "open-access",
      },
      { onConflict: "thread_id,text,match_type" },
    )
    .select()
    .single();
  if (error) {
    return NextResponse.json({ error: "db_error", message: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, redaction: data });
}

export async function DELETE(request: NextRequest) {
  let parsed: z.infer<typeof DeleteSchema>;
  try {
    parsed = DeleteSchema.parse(await request.json());
  } catch (e) {
    return NextResponse.json(
      { error: "invalid_body", message: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("prw_redactions")
    .delete()
    .eq("id", parsed.id)
    .select();
  if (error) {
    return NextResponse.json({ error: "db_error", message: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, removed: data?.length ?? 0 });
}
