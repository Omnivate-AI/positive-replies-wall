/**
 * Integration test: classification storage in Supabase.
 * Validates the M6-relevant DB constraints with sentinel rows.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { supabase } from "../../trigger/lib/supabase.js";
import { PROMPT_VERSION } from "../../trigger/lib/classify.js";

const SENTINEL_PREFIX = "test-vitest-classify-";

const baseReply = {
  smartlead_lead_id: 999_888_777,
  smartlead_campaign_id: 999_888_777,
  smartlead_client_id: 999_888_777,
  reply_from_email: "test@example.test",
  reply_body_html: "<p>vitest sentinel reply</p>",
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

async function newSentinelReply(suffix: string): Promise<number> {
  const sb = supabase();
  const { data, error } = await sb
    .from("prw_replies")
    .insert({ ...baseReply, smartlead_message_id: `${SENTINEL_PREFIX}${suffix}` })
    .select("id")
    .single();
  if (error) throw new Error(`setup: ${error.message}`);
  return (data as { id: number }).id;
}

describe("prw_classifications writes", () => {
  it("inserts a valid classification row with all sub-scores", async () => {
    const replyId = await newSentinelReply("insert");
    const sb = supabase();
    const { data, error } = await sb
      .from("prw_classifications")
      .insert({
        reply_id: replyId,
        praise_score: 25,
        specificity_score: 20,
        authenticity_score: 22,
        standalone_score: 18,
        is_high_quality: true,
        categories: ["superlative", "personalization"],
        reasoning: "vitest sentinel — valid classification",
        prompt_version: "test-vitest-v0",
      })
      .select("total_score, categories")
      .single();
    expect(error).toBeNull();
    expect(data?.total_score).toBe(85); // GENERATED column verified
    expect(data?.categories).toEqual(["superlative", "personalization"]);
  });

  it("UNIQUE(reply_id, prompt_version) blocks duplicate at same version", async () => {
    const replyId = await newSentinelReply("uniq-version");
    const sb = supabase();
    const row = {
      reply_id: replyId,
      praise_score: 0,
      specificity_score: 0,
      authenticity_score: 0,
      standalone_score: 0,
      is_high_quality: false,
      prompt_version: "test-vitest-v0",
    };
    const { error: e1 } = await sb.from("prw_classifications").insert(row);
    expect(e1).toBeNull();
    const { error: e2 } = await sb.from("prw_classifications").insert(row);
    expect(e2?.code).toBe("23505"); // PG unique violation
  });

  it("ALLOWS multiple classifications per reply at different prompt versions", async () => {
    const replyId = await newSentinelReply("multi-version");
    const sb = supabase();
    const { error: e1 } = await sb.from("prw_classifications").insert({
      reply_id: replyId,
      praise_score: 10,
      specificity_score: 10,
      authenticity_score: 10,
      standalone_score: 10,
      is_high_quality: false,
      prompt_version: "test-vitest-v0",
    });
    expect(e1).toBeNull();
    const { error: e2 } = await sb.from("prw_classifications").insert({
      reply_id: replyId,
      praise_score: 25,
      specificity_score: 25,
      authenticity_score: 25,
      standalone_score: 20,
      is_high_quality: true,
      prompt_version: "test-vitest-v1",
    });
    expect(e2).toBeNull();

    // Both rows should be present.
    const { data } = await sb
      .from("prw_classifications")
      .select("prompt_version, total_score")
      .eq("reply_id", replyId)
      .order("prompt_version", { ascending: true });
    expect(data?.length).toBe(2);
    expect(data?.[0].prompt_version).toBe("test-vitest-v0");
    expect(data?.[0].total_score).toBe(40);
    expect(data?.[1].prompt_version).toBe("test-vitest-v1");
    expect(data?.[1].total_score).toBe(95);
  });

  it("ON CONFLICT DO NOTHING returns 0 inserts on a re-upsert (the orchestrator path)", async () => {
    const replyId = await newSentinelReply("conflict-skip");
    const sb = supabase();
    const row = {
      reply_id: replyId,
      praise_score: 15,
      specificity_score: 15,
      authenticity_score: 15,
      standalone_score: 15,
      is_high_quality: true,
      prompt_version: "test-vitest-v0",
    };

    const { data: first } = await sb
      .from("prw_classifications")
      .upsert([row], { onConflict: "reply_id,prompt_version", ignoreDuplicates: true })
      .select("id");
    expect(first?.length).toBe(1);

    const { data: second, error } = await sb
      .from("prw_classifications")
      .upsert([row], { onConflict: "reply_id,prompt_version", ignoreDuplicates: true })
      .select("id");
    expect(error).toBeNull();
    expect(second?.length).toBe(0);
  });

  it("constants from classify.ts match expected values", () => {
    // PROMPT_VERSION import is just a sanity thread — if classify.ts changes
    // this check tells the reader something is up.
    expect(PROMPT_VERSION).toMatch(/^v\d+\.\d+/);
  });
});
