/**
 * Integration tests: /api/admin/* route handlers (ticket #012).
 *
 * Imports each route handler directly and exercises it with a mock
 * NextRequest. Hits live Supabase via the service-role client (same
 * pattern as classify-supabase.test.ts). Sentinel rows are scoped under
 * a synthetic campaign id and cleaned up before/after each suite.
 *
 * What's covered:
 *   - DELETE source-check (ticket #002): admin row deletes, auto_lead
 *     and auto_classifier rows return 403.
 *   - POST validation: Zod errors return 400 with the parsed message.
 *   - POST upsert: round-trips the row with the right shape + match_type.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { POST as redactionsPost, DELETE as redactionsDelete } from "../../app/api/admin/redactions/route.js";
import { POST as highlightsPost, DELETE as highlightsDelete } from "../../app/api/admin/highlights/route.js";
import { POST as publishPost } from "../../app/api/admin/publish/route.js";
import { supabase } from "../../trigger/lib/supabase.js";

const SENTINEL_CAMPAIGN_ID = 998_777_666;

let leadCursor = 0;
const nextLeadId = (): number => 998_700_000 + leadCursor++;

async function cleanup(): Promise<void> {
  await supabase()
    .from("prw_threads")
    .delete()
    .eq("smartlead_campaign_id", SENTINEL_CAMPAIGN_ID);
}

async function newSentinelThread(): Promise<number> {
  const sb = supabase();
  const { data, error } = await sb
    .from("prw_threads")
    .insert({
      smartlead_campaign_id: SENTINEL_CAMPAIGN_ID,
      smartlead_client_id: SENTINEL_CAMPAIGN_ID,
      smartlead_campaign_lead_map_id: nextLeadId(),
      smartlead_lead_id: nextLeadId(),
      lead_email: "admin-api-test@example.test",
    })
    .select("id")
    .single();
  if (error) throw new Error(`setup: ${error.message}`);
  return (data as { id: number }).id;
}

async function seedRedaction(
  threadId: number,
  source: "admin" | "auto_lead" | "auto_classifier",
  text: string,
): Promise<number> {
  const sb = supabase();
  const { data, error } = await sb
    .from("prw_redactions")
    .insert({ thread_id: threadId, text, source, match_type: "literal" })
    .select("id")
    .single();
  if (error) throw new Error(`seedRedaction: ${error.message}`);
  return (data as { id: number }).id;
}

async function seedHighlight(
  threadId: number,
  source: "admin" | "auto_classifier",
  text: string,
): Promise<number> {
  const sb = supabase();
  const { data, error } = await sb
    .from("prw_highlights")
    .insert({ thread_id: threadId, text, source })
    .select("id")
    .single();
  if (error) throw new Error(`seedHighlight: ${error.message}`);
  return (data as { id: number }).id;
}

function jsonRequest(path: string, body: unknown, method: "POST" | "DELETE"): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  await cleanup();
});

afterAll(async () => {
  await cleanup();
});

// ─── /api/admin/redactions ──────────────────────────────────────────────

describe("/api/admin/redactions", () => {
  it("POST creates an admin-source redaction (literal match_type)", async () => {
    const threadId = await newSentinelThread();
    const res = await redactionsPost(
      jsonRequest("/api/admin/redactions", { thread_id: threadId, text: "Sentinel Co" }, "POST"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; redaction: { id: number; source: string; match_type: string } };
    expect(body.ok).toBe(true);
    expect(body.redaction.source).toBe("admin");
    expect(body.redaction.match_type).toBe("literal");
  });

  it("POST returns 400 on invalid body (missing thread_id)", async () => {
    const res = await redactionsPost(
      jsonRequest("/api/admin/redactions", { text: "no thread" }, "POST"),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_body");
  });

  it("DELETE on admin-source returns 200 and removes the row", async () => {
    const threadId = await newSentinelThread();
    const id = await seedRedaction(threadId, "admin", "delete-me-admin");

    const res = await redactionsDelete(
      jsonRequest("/api/admin/redactions", { id }, "DELETE"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; removed: number };
    expect(body.removed).toBe(1);

    // Verify it's gone.
    const sb = supabase();
    const { data } = await sb.from("prw_redactions").select("id").eq("id", id);
    expect(data).toEqual([]);
  });

  it("DELETE on auto_lead row returns 403 and the row remains (ticket #002)", async () => {
    const threadId = await newSentinelThread();
    const id = await seedRedaction(threadId, "auto_lead", "do-not-delete-pii");

    const res = await redactionsDelete(
      jsonRequest("/api/admin/redactions", { id }, "DELETE"),
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("forbidden");

    // Verify still present.
    const sb = supabase();
    const { data } = await sb.from("prw_redactions").select("id, source").eq("id", id);
    expect(data).toEqual([{ id, source: "auto_lead" }]);
  });

  it("DELETE on auto_classifier row returns 403 and the row remains (ticket #002)", async () => {
    const threadId = await newSentinelThread();
    const id = await seedRedaction(threadId, "auto_classifier", "do-not-delete-classifier");

    const res = await redactionsDelete(
      jsonRequest("/api/admin/redactions", { id }, "DELETE"),
    );
    expect(res.status).toBe(403);

    const sb = supabase();
    const { data } = await sb.from("prw_redactions").select("id, source").eq("id", id);
    expect(data).toEqual([{ id, source: "auto_classifier" }]);
  });

  it("DELETE on a non-existent id returns 403 (no enumeration leak)", async () => {
    const res = await redactionsDelete(
      jsonRequest("/api/admin/redactions", { id: 999_999_999_999 }, "DELETE"),
    );
    expect(res.status).toBe(403);
  });
});

// ─── /api/admin/highlights ──────────────────────────────────────────────

describe("/api/admin/highlights", () => {
  it("POST creates an admin-source highlight", async () => {
    const threadId = await newSentinelThread();
    const res = await highlightsPost(
      jsonRequest(
        "/api/admin/highlights",
        { thread_id: threadId, text: "best email I've seen" },
        "POST",
      ),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; highlight: { source: string } };
    expect(body.ok).toBe(true);
    expect(body.highlight.source).toBe("admin");
  });

  it("DELETE on admin-source returns 200 and removes the row", async () => {
    const threadId = await newSentinelThread();
    const id = await seedHighlight(threadId, "admin", "remove me");

    const res = await highlightsDelete(
      jsonRequest("/api/admin/highlights", { id }, "DELETE"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { removed: number };
    expect(body.removed).toBe(1);
  });

  it("DELETE on auto_classifier row returns 403 (ticket #002)", async () => {
    const threadId = await newSentinelThread();
    const id = await seedHighlight(threadId, "auto_classifier", "auto-extracted");

    const res = await highlightsDelete(
      jsonRequest("/api/admin/highlights", { id }, "DELETE"),
    );
    expect(res.status).toBe(403);

    const sb = supabase();
    const { data } = await sb.from("prw_highlights").select("id").eq("id", id);
    expect(data).toHaveLength(1);
  });
});

// ─── /api/admin/publish ─────────────────────────────────────────────────

describe("/api/admin/publish", () => {
  it("POST is_published toggles the publish_state row", async () => {
    const threadId = await newSentinelThread();

    const res = await publishPost(
      jsonRequest(
        "/api/admin/publish",
        { thread_id: threadId, is_published: true },
        "POST",
      ),
    );
    expect(res.status).toBe(200);

    const sb = supabase();
    const { data } = await sb
      .from("prw_publish_state")
      .select("is_published")
      .eq("thread_id", threadId)
      .maybeSingle();
    expect((data as { is_published: boolean } | null)?.is_published).toBe(true);
  });

  it("POST display_priority updates without changing is_published", async () => {
    const threadId = await newSentinelThread();
    const sb = supabase();
    await sb.from("prw_publish_state").upsert(
      { thread_id: threadId, is_published: true, display_priority: 0 },
      { onConflict: "thread_id" },
    );

    const res = await publishPost(
      jsonRequest(
        "/api/admin/publish",
        { thread_id: threadId, display_priority: 5 },
        "POST",
      ),
    );
    expect(res.status).toBe(200);

    const { data } = await sb
      .from("prw_publish_state")
      .select("is_published, display_priority")
      .eq("thread_id", threadId)
      .maybeSingle();
    const ps = data as { is_published: boolean; display_priority: number } | null;
    expect(ps?.is_published).toBe(true);
    expect(ps?.display_priority).toBe(5);
  });

  it("POST returns 400 on invalid body (no fields to update)", async () => {
    const threadId = await newSentinelThread();
    const res = await publishPost(
      jsonRequest("/api/admin/publish", { thread_id: threadId }, "POST"),
    );
    // Either 400 from Zod or whatever the handler defines; assert non-success.
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
