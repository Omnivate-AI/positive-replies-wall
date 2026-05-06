/**
 * Integration test: classification storage in Supabase under v2.0 thread model.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { supabase } from "../../trigger/lib/supabase.js";
import { PROMPT_VERSION } from "../../trigger/lib/classify.js";

const SENTINEL_CAMPAIGN_ID = 999_888_777;

const baseThread = {
  smartlead_campaign_id: SENTINEL_CAMPAIGN_ID,
  smartlead_client_id: 999_888_777,
  smartlead_campaign_lead_map_id: 999_888_777,
  lead_email: "test@example.test",
};

let cursor = 0;
const nextLeadId = () => 999_888_000 + cursor++;

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

async function newSentinelThread(): Promise<number> {
  const sb = supabase();
  const { data, error } = await sb
    .from("prw_threads")
    .insert({ ...baseThread, smartlead_lead_id: nextLeadId() })
    .select("id")
    .single();
  if (error) throw new Error(`setup: ${error.message}`);
  return (data as { id: number }).id;
}

describe("prw_classifications writes", () => {
  it("inserts a valid classification row with all sub-scores plus v2.0 fields", async () => {
    const threadId = await newSentinelThread();
    const sb = supabase();
    const { data, error } = await sb
      .from("prw_classifications")
      .insert({
        thread_id: threadId,
        praise_score: 25,
        specificity_score: 20,
        authenticity_score: 22,
        standalone_score: 18,
        is_high_quality: true,
        categories: ["superlative", "personalization"],
        reasoning: "vitest sentinel — valid classification",
        suggested_highlight_text: "this is one of the best",
        suggested_redactions: ["Heru"],
        prompt_version: "test-vitest-v0",
      })
      .select("total_score, categories, suggested_highlight_text, suggested_redactions")
      .single();
    expect(error).toBeNull();
    expect(data?.total_score).toBe(85);
    expect(data?.categories).toEqual(["superlative", "personalization"]);
    expect(data?.suggested_highlight_text).toBe("this is one of the best");
    expect(data?.suggested_redactions).toEqual(["Heru"]);
  });

  it("UNIQUE(thread_id, prompt_version) blocks duplicate at same version", async () => {
    const threadId = await newSentinelThread();
    const sb = supabase();
    const row = {
      thread_id: threadId,
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
    expect(e2?.code).toBe("23505");
  });

  it("ALLOWS multiple classifications per thread at different prompt versions", async () => {
    const threadId = await newSentinelThread();
    const sb = supabase();
    const { error: e1 } = await sb.from("prw_classifications").insert({
      thread_id: threadId,
      praise_score: 10,
      specificity_score: 10,
      authenticity_score: 10,
      standalone_score: 10,
      is_high_quality: false,
      prompt_version: "test-vitest-v0",
    });
    expect(e1).toBeNull();
    const { error: e2 } = await sb.from("prw_classifications").insert({
      thread_id: threadId,
      praise_score: 25,
      specificity_score: 25,
      authenticity_score: 25,
      standalone_score: 20,
      is_high_quality: true,
      prompt_version: "test-vitest-v1",
    });
    expect(e2).toBeNull();

    const { data } = await sb
      .from("prw_classifications")
      .select("prompt_version, total_score")
      .eq("thread_id", threadId)
      .order("prompt_version", { ascending: true });
    expect(data?.length).toBe(2);
    expect(data?.[0].prompt_version).toBe("test-vitest-v0");
    expect(data?.[0].total_score).toBe(40);
    expect(data?.[1].prompt_version).toBe("test-vitest-v1");
    expect(data?.[1].total_score).toBe(95);
  });

  it("ON CONFLICT DO NOTHING returns 0 inserts on a re-upsert (the orchestrator path)", async () => {
    const threadId = await newSentinelThread();
    const sb = supabase();
    const row = {
      thread_id: threadId,
      praise_score: 15,
      specificity_score: 15,
      authenticity_score: 15,
      standalone_score: 15,
      is_high_quality: true,
      prompt_version: "test-vitest-v0",
    };

    const { data: first } = await sb
      .from("prw_classifications")
      .upsert([row], { onConflict: "thread_id,prompt_version", ignoreDuplicates: true })
      .select("id");
    expect(first?.length).toBe(1);

    const { data: second, error } = await sb
      .from("prw_classifications")
      .upsert([row], { onConflict: "thread_id,prompt_version", ignoreDuplicates: true })
      .select("id");
    expect(error).toBeNull();
    expect(second?.length).toBe(0);
  });

  it("PROMPT_VERSION matches the v2.x convention", () => {
    expect(PROMPT_VERSION).toMatch(/^v\d+\.\d+/);
  });
});
