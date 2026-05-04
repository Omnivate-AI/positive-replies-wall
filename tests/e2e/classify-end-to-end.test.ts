/**
 * E2E test: real OpenRouter call + real Supabase write through the public
 * `runClassifyBatch` entry point.
 *
 * Strategy: insert a sentinel reply, classify only that reply (replyIds filter),
 * verify a classification row landed with valid sub-scores, then re-run and
 * verify idempotency (no second classification at the same prompt_version).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { supabase } from "../../trigger/lib/supabase.js";
import { runClassifyBatch } from "../../trigger/lib/classify-batch.js";
import { PROMPT_VERSION } from "../../trigger/lib/classify.js";

const SENTINEL_PREFIX = "test-vitest-e2e-classify-";

const SUPERLATIVE_REPLY = {
  smartlead_lead_id: 999_111_111,
  smartlead_campaign_id: 999_111_111,
  smartlead_client_id: 999_111_111,
  reply_from_email: "mauritz.gilfillan@jellyfish.com",
  reply_subject: "Re: e2e test",
  reply_body_html:
    "<p>Hi Omar,</p><p>Thank you so much for this email! I have to say, this is one of the best cold/outbound emails I've received in years. It really stood out.</p>",
  reply_received_at: "2026-01-01T00:00:00.000Z",
  lead_first_name: "Mauritz",
  lead_last_name: "Gilfillan",
  lead_company_name: "Jellyfish",
};

let sentinelReplyId: number;

async function cleanup() {
  await supabase()
    .from("prw_replies")
    .delete()
    .like("smartlead_message_id", `${SENTINEL_PREFIX}%`);
}

beforeAll(async () => {
  await cleanup();
  const { data, error } = await supabase()
    .from("prw_replies")
    .insert({ ...SUPERLATIVE_REPLY, smartlead_message_id: `${SENTINEL_PREFIX}superlative` })
    .select("id")
    .single();
  if (error) throw new Error(`E2E setup: ${error.message}`);
  sentinelReplyId = (data as { id: number }).id;
});

afterAll(async () => {
  await cleanup();
});

describe("End-to-end classification", () => {
  it(
    "first run: classifies the superlative sentinel and writes a valid row",
    async () => {
      const stats = await runClassifyBatch({ replyIds: [sentinelReplyId] });
      expect(stats.errors, JSON.stringify(stats.errors)).toEqual([]);
      expect(stats.repliesPending).toBe(1);
      expect(stats.repliesClassified).toBe(1);
      expect(stats.repliesHighQuality).toBe(1);

      const { data, error } = await supabase()
        .from("prw_classifications")
        .select("praise_score, specificity_score, authenticity_score, standalone_score, total_score, is_high_quality, categories, prompt_version")
        .eq("reply_id", sentinelReplyId)
        .eq("prompt_version", PROMPT_VERSION)
        .single();

      expect(error).toBeNull();
      expect(data).toBeTruthy();
      expect(data!.is_high_quality).toBe(true);
      expect(data!.total_score).toBeGreaterThanOrEqual(55);
      // Mauritz's reply should hit the rubric ceiling territory (>=85 in calibration).
      expect(data!.total_score).toBeGreaterThanOrEqual(80);
      expect(data!.categories).toContain("superlative");
      expect(data!.prompt_version).toBe(PROMPT_VERSION);
    },
    180_000,
  );

  it(
    "second run: idempotent — already-classified reply is filtered out before the OpenRouter call",
    async () => {
      const stats = await runClassifyBatch({ replyIds: [sentinelReplyId] });
      expect(stats.errors, JSON.stringify(stats.errors)).toEqual([]);
      expect(stats.repliesPending).toBe(0);
      expect(stats.repliesClassified).toBe(0);
    },
    60_000,
  );
});
