/**
 * Integration tests against the real Supabase project. Verify schema constraints
 * are enforced at the database level under the v2.0 thread+messages model.
 *
 * Sentinel rows: smartlead_lead_id and smartlead_campaign_id both 999_999_xxx
 * so cleanup matches them precisely. afterAll deletes via cascade from the
 * thread row.
 */

import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { supabase } from "../../trigger/lib/supabase.js";

const SENTINEL_LEAD_ID_BASE = 999_999_000;
const SENTINEL_CAMPAIGN_ID = 999_999_999;

const sentinelLeadId = (offset: number) => SENTINEL_LEAD_ID_BASE + offset;

const baseThread = {
  smartlead_campaign_id: SENTINEL_CAMPAIGN_ID,
  smartlead_client_id: 999_999_000,
  smartlead_campaign_lead_map_id: 999_999_001,
  lead_email: "test@example.test",
};

async function cleanupSentinels() {
  await supabase()
    .from("prw_threads")
    .delete()
    .eq("smartlead_campaign_id", SENTINEL_CAMPAIGN_ID);
}

beforeAll(async () => {
  await cleanupSentinels();
});

afterAll(async () => {
  await cleanupSentinels();
});

describe("prw_threads UNIQUE(smartlead_lead_id, smartlead_campaign_id) — dedup at the DB level", () => {
  it("rejects a duplicate (lead, campaign) tuple with 23505 unique-violation", async () => {
    const sb = supabase();
    const lead = sentinelLeadId(1);

    const { error: e1 } = await sb
      .from("prw_threads")
      .insert({ ...baseThread, smartlead_lead_id: lead });
    expect(e1).toBeNull();

    const { error: e2 } = await sb
      .from("prw_threads")
      .insert({ ...baseThread, smartlead_lead_id: lead });
    expect(e2?.code).toBe("23505");
  });
});

describe("prw_messages partial unique index — at most one qualifying reply per thread", () => {
  it("rejects a second is_qualifying_reply=true insert on the same thread", async () => {
    const sb = supabase();
    const lead = sentinelLeadId(2);
    const { data: thread } = await sb
      .from("prw_threads")
      .insert({ ...baseThread, smartlead_lead_id: lead })
      .select("id")
      .single();
    const threadId = thread!.id;

    const { error: e1 } = await sb.from("prw_messages").insert({
      thread_id: threadId,
      smartlead_message_id: `<test-vitest-qual-1-${lead}>`,
      direction: "inbound",
      is_qualifying_reply: true,
      from_email: "test@example.test",
      sent_at: "2026-01-01T00:00:00.000Z",
    });
    expect(e1).toBeNull();

    const { error: e2 } = await sb.from("prw_messages").insert({
      thread_id: threadId,
      smartlead_message_id: `<test-vitest-qual-2-${lead}>`,
      direction: "inbound",
      is_qualifying_reply: true,
      from_email: "test@example.test",
      sent_at: "2026-01-02T00:00:00.000Z",
    });
    expect(e2?.code).toBe("23505");
  });

  it("permits multiple is_qualifying_reply=false rows on the same thread", async () => {
    const sb = supabase();
    const lead = sentinelLeadId(3);
    const { data: thread } = await sb
      .from("prw_threads")
      .insert({ ...baseThread, smartlead_lead_id: lead })
      .select("id")
      .single();
    const threadId = thread!.id;

    for (let i = 0; i < 3; i++) {
      const { error } = await sb.from("prw_messages").insert({
        thread_id: threadId,
        smartlead_message_id: `<test-vitest-msg-${i}-${lead}>`,
        direction: i === 0 ? "outbound" : "inbound",
        is_qualifying_reply: false,
        from_email: "test@example.test",
        sent_at: `2026-01-0${i + 1}T00:00:00.000Z`,
      });
      expect(error).toBeNull();
    }
  });
});

describe("prw_classifications CHECK constraints — score ranges enforced", () => {
  it("rejects a praise_score above 30", async () => {
    const sb = supabase();
    const lead = sentinelLeadId(4);
    const { data: thread } = await sb
      .from("prw_threads")
      .insert({ ...baseThread, smartlead_lead_id: lead })
      .select("id")
      .single();

    const { error } = await sb.from("prw_classifications").insert({
      thread_id: thread!.id,
      praise_score: 31,
      specificity_score: 0,
      authenticity_score: 0,
      standalone_score: 0,
      is_high_quality: false,
      prompt_version: "test-v0",
    });
    expect(error?.code).toBe("23514");
  });

  it("accepts boundary values (max possible: 30+25+25+20=100)", async () => {
    const sb = supabase();
    const lead = sentinelLeadId(5);
    const { data: thread } = await sb
      .from("prw_threads")
      .insert({ ...baseThread, smartlead_lead_id: lead })
      .select("id")
      .single();

    const { data: classification, error } = await sb
      .from("prw_classifications")
      .insert({
        thread_id: thread!.id,
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
    expect(classification?.total_score).toBe(100);
  });
});

describe("CASCADE delete — removing a thread removes its dependents", () => {
  it("deleting a prw_threads row cascades to messages, classifications, redactions, publish_state", async () => {
    const sb = supabase();
    const lead = sentinelLeadId(6);
    const { data: thread } = await sb
      .from("prw_threads")
      .insert({ ...baseThread, smartlead_lead_id: lead })
      .select("id")
      .single();
    const threadId = thread!.id;

    await sb.from("prw_messages").insert({
      thread_id: threadId,
      smartlead_message_id: `<test-vitest-cascade-${lead}>`,
      direction: "inbound",
      from_email: "test@example.test",
      sent_at: "2026-01-01T00:00:00.000Z",
    });
    await sb.from("prw_publish_state").insert({ thread_id: threadId });
    await sb.from("prw_redactions").insert({ thread_id: threadId, text: "Mark Richards" });
    await sb.from("prw_classifications").insert({
      thread_id: threadId,
      praise_score: 0,
      specificity_score: 0,
      authenticity_score: 0,
      standalone_score: 0,
      is_high_quality: false,
      prompt_version: "test-v0",
    });

    const { error: delErr } = await sb.from("prw_threads").delete().eq("id", threadId);
    expect(delErr).toBeNull();

    for (const t of [
      "prw_messages",
      "prw_publish_state",
      "prw_redactions",
      "prw_classifications",
    ]) {
      const { count } = await sb
        .from(t)
        .select("*", { count: "exact", head: true })
        .eq("thread_id", threadId);
      expect(count, `${t} should be empty after cascade`).toBe(0);
    }
  });
});

describe("prw_redactions UNIQUE(thread_id, text, match_type) — same span can't be redacted twice", () => {
  it("rejects a duplicate (thread_id, text, match_type) tuple", async () => {
    const sb = supabase();
    const lead = sentinelLeadId(7);
    const { data: thread } = await sb
      .from("prw_threads")
      .insert({ ...baseThread, smartlead_lead_id: lead })
      .select("id")
      .single();

    const { error: e1 } = await sb
      .from("prw_redactions")
      .insert({ thread_id: thread!.id, text: "Acme Corp" });
    expect(e1).toBeNull();

    const { error: e2 } = await sb
      .from("prw_redactions")
      .insert({ thread_id: thread!.id, text: "Acme Corp" });
    expect(e2?.code).toBe("23505");

    const { error: e3 } = await sb
      .from("prw_redactions")
      .insert({ thread_id: thread!.id, text: "Acme Corp", match_type: "word_boundary" });
    expect(e3).toBeNull();
  });
});
