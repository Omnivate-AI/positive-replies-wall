/**
 * /api/admin/highlights — CRUD for prw_highlights (mirror of redactions).
 *
 * POST: add a highlight (source = 'admin') to a thread.
 *   Body: { thread_id: number, text: string }
 *
 * DELETE: remove a highlight by id.
 *   Body: { id: number }
 *
 * Auth-gated. Writes use service-role.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";

const PostSchema = z.object({
  thread_id: z.number().int().positive(),
  text: z.string().trim().min(1).max(1000),
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
    .from("prw_highlights")
    .upsert(
      {
        thread_id: parsed.thread_id,
        text: parsed.text,
        source: "admin",
        created_by: "open-access",
      },
      { onConflict: "thread_id,text" },
    )
    .select()
    .single();
  if (error) {
    return NextResponse.json({ error: "db_error", message: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, highlight: data });
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
  // Filter on source = 'admin' so auto_classifier rows can't be deleted via
  // the API. Auto rows re-seed on the next classify run; admin rows are the
  // only ones meant to be removable through this endpoint. See ticket #002.
  const { data, error } = await sb
    .from("prw_highlights")
    .delete()
    .eq("id", parsed.id)
    .eq("source", "admin")
    .select();
  if (error) {
    return NextResponse.json({ error: "db_error", message: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json(
      { error: "forbidden", message: "Only admin-source highlights can be deleted." },
      { status: 403 },
    );
  }
  return NextResponse.json({ ok: true, removed: data.length });
}
