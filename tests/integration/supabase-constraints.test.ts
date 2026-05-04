/**
 * Integration tests against the real Supabase project. Verify schema constraints
 * are enforced at the database level (defense in depth — the application layer
 * may have bugs; the DB never lies).
 *
 * Uses sentinel rows with smartlead_message_id starting with `test-vitest-`.
 * cleanupSentinels() runs in afterAll.
 */

import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { supabase } from "../../trigger/lib/supabase.js";

const SENTINEL_PREFIX = "test-vitest-constraints-";
const sentinelMessageId = (suffix: string) => `${SENTINEL_PREFIX}${suffix}`;

const baseRow = {
  smartlead_lead_id: 999_999_999,
  smartlead_campaign_id: 999_999_999,
  smartlead_client_id: 999_999_999,
  reply_from_email: "test@example.test",
  reply_body_html: "<p>vitest sentinel</p>",
  reply_received_at: "2026-01-01T00:00:00.000Z",
};

async function cleanupSentinels() {
  await supabase()
    .from("prw_replies")
    .delete()
    .like("smartlead_message_id", `${SENTINEL_PREFIX}%`);
}

beforeAll(async () => {
  await cleanupSentinels();
});

afterAll(async () => {
  await cleanupSentinels();
});

describe("prw_replies UNIQUE(smartlead_message_id) — idempotency at the DB level", () => {
  it("rejects a duplicate insert (without ignoreDuplicates) with a 23505 unique-violation", async () => {
    const id = sentinelMessageId("dup");
    const sb = supabase();

    const { error: e1 } = await sb.from("prw_replies").insert({ ...baseRow, smartlead_message_id: id });
    expect(e1).toBeNull();

    const { error: e2 } = await sb.from("prw_replies").insert({ ...baseRow, smartlead_message_id: id });
    // Postgres unique violation surfaces as 23505 in `error.code`.
    expect(e2?.code).toBe("23505");
  });

  it("ignoreDuplicates: true silently skips (the ingest path)", async () => {
    const id = sentinelMessageId("ignore-dup");
    const sb = supabase();

    const { data: first } = await sb
      .from("prw_replies")
      .upsert(
        [{ ...baseRow, smartlead_message_id: id }],
        { onConflict: "smartlead_message_id", ignoreDuplicates: true },
      )
      .select("id");
    expect(first?.length).toBe(1);

    // Same message_id again with ignoreDuplicates → returns no rows.
    const { data: second, error } = await sb
      .from("prw_replies")
      .upsert(
        [{ ...baseRow, smartlead_message_id: id }],
        { onConflict: "smartlead_message_id", ignoreDuplicates: true },
      )
      .select("id");
    expect(error).toBeNull();
    expect(second?.length).toBe(0);
  });
});

describe("prw_classifications CHECK constraints — score ranges enforced", () => {
  it("rejects a praise_score above 30", async () => {
    const id = sentinelMessageId("score-praise");
    const sb = supabase();
    const { data: reply } = await sb
      .from("prw_replies")
      .insert({ ...baseRow, smartlead_message_id: id })
      .select("id")
      .single();

    const { error } = await sb.from("prw_classifications").insert({
      reply_id: reply!.id,
      praise_score: 31,
      specificity_score: 0,
      authenticity_score: 0,
      standalone_score: 0,
      is_high_quality: false,
      prompt_version: "test-v0",
    });
    expect(error?.code).toBe("23514"); // PG check violation
  });

  it("accepts boundary values (max possible: 30+25+25+20=100)", async () => {
    const id = sentinelMessageId("score-max");
    const sb = supabase();
    const { data: reply } = await sb
      .from("prw_replies")
      .insert({ ...baseRow, smartlead_message_id: id })
      .select("id")
      .single();

    const { data: classification, error } = await sb
      .from("prw_classifications")
      .insert({
        reply_id: reply!.id,
        praise_score: 30,
        specificity_score: 25,
        authenticity_score: 25,
        standalone_score: 20,
        is_high_quality: true,
        prompt_version: "test-v0",
      })
      .select("total_score")
      .single();

    expect(error).toBeNull();
    expect(classification?.total_score).toBe(100); // GENERATED column did its job
  });
});

describe("CASCADE delete — removing a reply removes its dependents", () => {
  it("deleting a prw_replies row cascades to publish_state, redactions, classifications", async () => {
    const id = sentinelMessageId("cascade");
    const sb = supabase();
    const { data: reply } = await sb
      .from("prw_replies")
      .insert({ ...baseRow, smartlead_message_id: id })
      .select("id")
      .single();
    const replyId = reply!.id;

    await sb.from("prw_publish_state").insert({ reply_id: replyId });
    await sb.from("prw_redactions").insert({ reply_id: replyId, text: "Mark Richards" });
    await sb.from("prw_classifications").insert({
      reply_id: replyId,
      praise_score: 0,
      specificity_score: 0,
      authenticity_score: 0,
      standalone_score: 0,
      is_high_quality: false,
      prompt_version: "test-v0",
    });

    // Delete the parent — children should vanish atomically.
    const { error: delErr } = await sb.from("prw_replies").delete().eq("id", replyId);
    expect(delErr).toBeNull();

    const { count: stateCount } = await sb
      .from("prw_publish_state")
      .select("*", { count: "exact", head: true })
      .eq("reply_id", replyId);
    const { count: redactionCount } = await sb
      .from("prw_redactions")
      .select("*", { count: "exact", head: true })
      .eq("reply_id", replyId);
    const { count: classCount } = await sb
      .from("prw_classifications")
      .select("*", { count: "exact", head: true })
      .eq("reply_id", replyId);

    expect(stateCount).toBe(0);
    expect(redactionCount).toBe(0);
    expect(classCount).toBe(0);
  });
});

describe("prw_redactions UNIQUE(reply_id, text, match_type) — same span can't be redacted twice", () => {
  it("rejects a duplicate (reply_id, text, match_type) tuple", async () => {
    const id = sentinelMessageId("redact-uniq");
    const sb = supabase();
    const { data: reply } = await sb
      .from("prw_replies")
      .insert({ ...baseRow, smartlead_message_id: id })
      .select("id")
      .single();

    const { error: e1 } = await sb
      .from("prw_redactions")
      .insert({ reply_id: reply!.id, text: "Acme Corp" });
    expect(e1).toBeNull();

    const { error: e2 } = await sb
      .from("prw_redactions")
      .insert({ reply_id: reply!.id, text: "Acme Corp" });
    expect(e2?.code).toBe("23505");

    // Same text but different match_type → allowed (different effective rule).
    const { error: e3 } = await sb
      .from("prw_redactions")
      .insert({ reply_id: reply!.id, text: "Acme Corp", match_type: "word_boundary" });
    expect(e3).toBeNull();
  });
});
