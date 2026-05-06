/**
 * One-shot backfill: add the lead_email itself as an auto_lead redaction
 * for every existing thread. Without this, cards show "████████@company.com"
 * — the local-part is masked but the domain leaks.
 *
 * Idempotent: ON CONFLICT(thread_id, text, match_type) DO NOTHING.
 */

import * as dotenv from "dotenv";
dotenv.config();

import { supabase } from "../trigger/lib/supabase.js";

async function main() {
  const sb = supabase();

  const { data: threads, error: tErr } = await sb
    .from("prw_threads")
    .select("id, lead_email")
    .not("lead_email", "is", null);
  if (tErr) throw new Error(`fetch threads: ${tErr.message}`);

  const rows = (threads ?? [])
    .filter((t: { lead_email: string }) => t.lead_email && t.lead_email.length >= 2)
    .map((t: { id: number; lead_email: string }) => ({
      thread_id: t.id,
      text: t.lead_email,
      match_type: "literal",
      source: "auto_lead",
    }));

  console.log(`Inserting ${rows.length} email redactions...`);
  const { error: iErr } = await sb
    .from("prw_redactions")
    .upsert(rows, { onConflict: "thread_id,text,match_type", ignoreDuplicates: true });
  if (iErr) throw new Error(`insert: ${iErr.message}`);
  console.log("Done.");
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
