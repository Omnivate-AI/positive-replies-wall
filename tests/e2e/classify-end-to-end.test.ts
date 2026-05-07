/**
 * E2E test: real OpenRouter call + real Supabase write through `runClassifyBatch`
 * under the v2.0 thread+messages schema.
 *
 * Strategy: insert a sentinel thread + qualifying inbound message, classify only
 * that thread (threadIds filter), verify a classification row landed with valid
 * sub-scores plus the new highlight + suggested_redactions fields, then re-run
 * and verify idempotency.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { supabase } from "../../trigger/lib/supabase.js";
import { runClassifyBatch } from "../../trigger/lib/classify-batch.js";
import { PROMPT_VERSION } from "../../trigger/lib/classify.js";

const SENTINEL_LEAD_ID = 999_111_111;
const SENTINEL_CAMPAIGN_ID = 999_111_111;

const SUPERLATIVE_THREAD = {
  smartlead_lead_id: SENTINEL_LEAD_ID,
  smartlead_campaign_id: SENTINEL_CAMPAIGN_ID,
  smartlead_client_id: 999_111_111,
  smartlead_campaign_lead_map_id: 999_111_111,
  lead_email: "mauritz.gilfillan@jellyfish.com",
  lead_first_name: "Mauritz",
  lead_last_name: "Gilfillan",
  company_name: "Jellyfish",
};

const SUPERLATIVE_MESSAGE_BODY =
  "<p>Hi Omar,</p><p>Thank you so much for this email! I have to say, this is one of the best cold/outbound emails I've received in years. It really stood out.</p>";

let sentinelThreadId: number;

async function cleanup() {
  await supabase()
    .from("prw_threads")
    .delete()
    .eq("smartlead_campaign_id", SENTINEL_CAMPAIGN_ID);
}

beforeAll(async () => {
  await cleanup();
  const { data: thread, error: tErr } = await supabase()
    .from("prw_threads")
    .insert(SUPERLATIVE_THREAD)
    .select("id")
    .single();
  if (tErr) throw new Error(`E2E setup thread: ${tErr.message}`);
  sentinelThreadId = (thread as { id: number }).id;

  const { error: mErr } = await supabase().from("prw_messages").insert({
    thread_id: sentinelThreadId,
    smartlead_message_id: `<test-vitest-e2e-classify-superlative>`,
    direction: "inbound",
    is_qualifying_reply: true,
    from_email: "mauritz.gilfillan@jellyfish.com",
    subject: "Re: e2e test",
    body_html: SUPERLATIVE_MESSAGE_BODY,
    sent_at: "2026-01-01T00:00:00.000Z",
  });
  if (mErr) throw new Error(`E2E setup message: ${mErr.message}`);
});

afterAll(async () => {
  await cleanup();
});

describe("End-to-end classification", () => {
  it(
    "first run: classifies the superlative sentinel and writes a valid row",
    async () => {
      const stats = await runClassifyBatch({ threadIds: [sentinelThreadId] });
      expect(stats.errors, JSON.stringify(stats.errors)).toEqual([]);
      expect(stats.threadsPending).toBe(1);
      expect(stats.threadsClassified).toBe(1);
      expect(stats.threadsHighQuality).toBe(1);

      const { data, error } = await supabase()
        .from("prw_classifications")
        .select(
          "praise_score, specificity_score, authenticity_score, standalone_score, total_score, is_high_quality, categories, prompt_version, suggested_highlight_text, suggested_redactions",
        )
        .eq("thread_id", sentinelThreadId)
        .eq("prompt_version", PROMPT_VERSION)
        .single();

      expect(error).toBeNull();
      expect(data).toBeTruthy();
      expect(data!.is_high_quality).toBe(true);
      expect(data!.total_score).toBeGreaterThanOrEqual(80);
      expect(data!.categories).toContain("superlative");
      expect(data!.prompt_version).toBe(PROMPT_VERSION);
      // v2.0: highlight should be a non-empty verbatim phrase from the reply.
      expect(typeof data!.suggested_highlight_text).toBe("string");
      expect((data!.suggested_highlight_text as string).length).toBeGreaterThan(0);
      expect(Array.isArray(data!.suggested_redactions)).toBe(true);

      // Highlight should have been written to prw_highlights with
      // source='auto_classifier'. (Migration 004 moved highlights off
      // prw_threads.highlight_text — that column is now dormant.)
      const { data: highlights } = await supabase()
        .from("prw_highlights")
        .select("text, source")
        .eq("thread_id", sentinelThreadId)
        .eq("source", "auto_classifier");
      expect(highlights?.length ?? 0).toBeGreaterThan(0);
      expect((highlights![0].text as string).length).toBeGreaterThan(0);
    },
    180_000,
  );

  it(
    "second run: idempotent — already-classified thread is filtered out before the OpenRouter call",
    async () => {
      const stats = await runClassifyBatch({ threadIds: [sentinelThreadId] });
      expect(stats.errors, JSON.stringify(stats.errors)).toEqual([]);
      expect(stats.threadsPending).toBe(0);
      expect(stats.threadsClassified).toBe(0);
    },
    60_000,
  );
});
