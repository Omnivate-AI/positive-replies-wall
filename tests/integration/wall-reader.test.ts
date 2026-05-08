/**
 * Integration tests: wall reader queries (ticket #012).
 *
 * Exercises `getPublishedWallThreads` and `getAdminThreads` against live
 * Supabase. Pinned to a sentinel campaign id so the assertions are
 * deterministic regardless of what's in production data.
 *
 * What's covered:
 *   - getPublishedWallThreads filters to is_published=true threads.
 *   - The Postgrest 1:1 vs 1:N embed shape (the file at
 *     lib/supabase-public.ts:300-305 documents a previous production bug
 *     here — this test guards against re-introduction).
 *   - getAdminThreads returns ALL sentinel threads regardless of publish
 *     state.
 *   - The match_type column round-trips through the redactions projection.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { supabase } from "../../trigger/lib/supabase.js";
import { PROMPT_VERSION } from "../../trigger/lib/classify.js";
import {
  getPublishedWallThreads,
  getAdminThreads,
} from "../../lib/supabase-public.js";

const SENTINEL_CAMPAIGN_ID = 998_111_222;

let leadCursor = 0;
const nextLeadId = (): number => 998_100_000 + leadCursor++;

async function cleanup(): Promise<void> {
  await supabase()
    .from("prw_threads")
    .delete()
    .eq("smartlead_campaign_id", SENTINEL_CAMPAIGN_ID);
}

interface SeedOpts {
  isPublished: boolean;
  isHighQuality?: boolean;
  withHighlight?: boolean;
  withRedactionMatchType?: "literal" | "word_boundary";
}

async function seedThread(opts: SeedOpts): Promise<number> {
  const sb = supabase();
  // 1. Thread row.
  const { data: t, error: tErr } = await sb
    .from("prw_threads")
    .insert({
      smartlead_campaign_id: SENTINEL_CAMPAIGN_ID,
      smartlead_client_id: SENTINEL_CAMPAIGN_ID,
      smartlead_campaign_lead_map_id: nextLeadId(),
      smartlead_lead_id: nextLeadId(),
      lead_email: "wall-reader-test@example.test",
      lead_first_name: "WallTest",
      lead_last_name: "Sentinel",
    })
    .select("id")
    .single();
  if (tErr) throw new Error(`seedThread thread: ${tErr.message}`);
  const threadId = (t as { id: number }).id;

  // 2. Qualifying message (so prw_messages row exists for the wall query).
  const { error: mErr } = await sb.from("prw_messages").insert({
    thread_id: threadId,
    direction: "inbound",
    smartlead_message_id: `sentinel-${threadId}-${Date.now()}`,
    body_html: "Wall reader sentinel body.",
    from_email: "wall-reader-test@example.test",
    to_email: "sdr@omnivate.test",
    subject: "Sentinel reply",
    sent_at: new Date().toISOString(),
    is_qualifying_reply: true,
  });
  if (mErr) throw new Error(`seedThread message: ${mErr.message}`);

  // 3. Classification at the current PROMPT_VERSION.
  const { error: cErr } = await sb.from("prw_classifications").insert({
    thread_id: threadId,
    praise_score: opts.isHighQuality ? 30 : 5,
    specificity_score: opts.isHighQuality ? 25 : 5,
    authenticity_score: opts.isHighQuality ? 25 : 5,
    standalone_score: opts.isHighQuality ? 20 : 5,
    is_high_quality: !!opts.isHighQuality,
    categories: ["superlative"],
    reasoning: "vitest sentinel",
    cleaned_reply_text: "Wall reader sentinel body.",
    suggested_highlight_text: opts.withHighlight ? "sentinel body" : "",
    suggested_redactions: [],
    prompt_version: PROMPT_VERSION,
  });
  if (cErr) throw new Error(`seedThread classification: ${cErr.message}`);

  // 4. Publish state.
  const { error: psErr } = await sb.from("prw_publish_state").upsert(
    {
      thread_id: threadId,
      is_published: opts.isPublished,
      display_priority: 0,
    },
    { onConflict: "thread_id" },
  );
  if (psErr) throw new Error(`seedThread publish_state: ${psErr.message}`);

  // 5. Highlight (optional — needed for the published-wall filter).
  if (opts.withHighlight) {
    const { error: hErr } = await sb.from("prw_highlights").insert({
      thread_id: threadId,
      text: "sentinel body",
      source: "auto_classifier",
    });
    if (hErr) throw new Error(`seedThread highlight: ${hErr.message}`);
  }

  // 6. Redaction (optional — to verify match_type round-trips).
  if (opts.withRedactionMatchType) {
    const { error: rErr } = await sb.from("prw_redactions").insert({
      thread_id: threadId,
      text: "WallTest",
      source: "auto_lead",
      match_type: opts.withRedactionMatchType,
    });
    if (rErr) throw new Error(`seedThread redaction: ${rErr.message}`);
  }

  return threadId;
}

beforeAll(async () => {
  await cleanup();
});

afterAll(async () => {
  await cleanup();
});

describe("getPublishedWallThreads", () => {
  it("returns published + highlighted threads only (filters out unpublished)", async () => {
    const publishedId = await seedThread({
      isPublished: true,
      isHighQuality: true,
      withHighlight: true,
    });
    const unpublishedId = await seedThread({
      isPublished: false,
      isHighQuality: true,
      withHighlight: true,
    });

    const threads = await getPublishedWallThreads();
    const ids = threads.map((t) => t.thread_id);
    expect(ids).toContain(publishedId);
    expect(ids).not.toContain(unpublishedId);
  });

  it("filters out published threads with no highlight (4-borderline-pass safeguard)", async () => {
    const noHighlightId = await seedThread({
      isPublished: true,
      isHighQuality: true,
      withHighlight: false,
    });

    const threads = await getPublishedWallThreads();
    const ids = threads.map((t) => t.thread_id);
    expect(ids).not.toContain(noHighlightId);
  });

  it("projects redactions with match_type (typed shape, ticket #013)", async () => {
    const threadId = await seedThread({
      isPublished: true,
      isHighQuality: true,
      withHighlight: true,
      withRedactionMatchType: "word_boundary",
    });

    const threads = await getPublishedWallThreads();
    const found = threads.find((t) => t.thread_id === threadId);
    expect(found).toBeDefined();
    // Each redaction has shape { text, match_type } — the renderer routes
    // by match_type, so this is the contract that must hold. Also
    // implicitly tests the batched IN fix in lib/supabase-public.ts: the
    // production DB has > 1000 redactions, so an unbatched query would
    // truncate and miss the WallTest row.
    const wallTestRedaction = found!.redactions.find((r) => r.text === "WallTest");
    expect(wallTestRedaction).toBeDefined();
    expect(wallTestRedaction!.match_type).toBe("word_boundary");
  });

  it("returns publish_state as a single object (1:1 FK→PK), not an array", async () => {
    // This is the regression guard for the bug in lib/supabase-public.ts:300-305.
    // If publish_state ever comes back as an array (1:N shape), the wall reader's
    // .display_priority access becomes undefined and threads sort wrong.
    const threadId = await seedThread({
      isPublished: true,
      isHighQuality: true,
      withHighlight: true,
    });

    const threads = await getPublishedWallThreads();
    const found = threads.find((t) => t.thread_id === threadId);
    // If the shape is wrong, the thread won't appear at all (because
    // ps?.display_priority would be undefined and the filter+sort would
    // misbehave). Presence here is the load-bearing assertion.
    expect(found).toBeDefined();
  });
});

describe("getAdminThreads", () => {
  it("returns ALL sentinel threads regardless of publish state", async () => {
    const publishedId = await seedThread({
      isPublished: true,
      isHighQuality: true,
      withHighlight: true,
    });
    const unpublishedId = await seedThread({
      isPublished: false,
      isHighQuality: false,
      withHighlight: false,
    });

    const threads = await getAdminThreads();
    const ids = threads.map((t) => t.thread_id);
    expect(ids).toContain(publishedId);
    expect(ids).toContain(unpublishedId);
  });

  it("includes match_type in the redactions projection (ticket #013)", async () => {
    const threadId = await seedThread({
      isPublished: false,
      isHighQuality: false,
      withRedactionMatchType: "word_boundary",
    });

    const threads = await getAdminThreads();
    const found = threads.find((t) => t.thread_id === threadId);
    expect(found).toBeDefined();
    const r = found!.redactions.find((red) => red.text === "WallTest");
    // This assertion is the regression guard for the Supabase 1000-row
    // server-side cap: the test caught it because the production DB's
    // 1100+ redactions overflowed the unbatched IN query. The fix is the
    // `fetchInBatches` helper in lib/supabase-public.ts.
    expect(r).toBeDefined();
    expect(r!.match_type).toBe("word_boundary");
    expect(r!.source).toBe("auto_lead");
  });
});
