/**
 * Cross-repo resolution helpers — connect Smartlead identifiers to the
 * sibling outbound repo's tables in the same Supabase project:
 *   * campaign_registry — unified Smartlead-campaign table; FK target.
 *   * client_analytics_config.lead_table — resolves which per-client lead
 *     table to query (leads are sharded per client in the outbound repo).
 *   * <client>_leads — per-client lead table; matched on (linkedin_url, email).
 *
 * Soft polymorphic linkage (no FK across the per-client shards). When a match
 * fails, ingest still writes the thread with null (lead_table, lead_id) and
 * uses Smartlead's denormalized snapshot.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MatchedLead } from "./mappers.js";

/**
 * Resolves smartlead_campaign_id → campaign_registry.id.
 *
 * Loaded eagerly at the start of an ingest run (campaign_registry is small —
 * one row per Smartlead campaign across the org, and Smartlead campaigns are
 * auto-discovered into this table by the outbound repo's snapshotter).
 */
export async function loadCampaignRegistry(
  sb: SupabaseClient,
): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  const { data, error } = await sb
    .from("campaign_registry")
    .select("id, smartlead_campaign_id");
  if (error) {
    // Table may not exist in some envs (e.g. fresh local DB). Soft-fail —
    // ingest still works, just every campaign_registry_id will be null.
    return map;
  }
  for (const row of (data ?? []) as { id: number; smartlead_campaign_id: number }[]) {
    map.set(Number(row.smartlead_campaign_id), row.id);
  }
  return map;
}

/**
 * Resolves smartlead_client_id → lead_table.
 * client_analytics_config.smartlead_client_ids is a bigint[]; one config row
 * can map to multiple Smartlead client IDs. We invert it into a flat map.
 */
export async function loadClientLeadTables(
  sb: SupabaseClient,
): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  const { data, error } = await sb
    .from("client_analytics_config")
    .select("lead_table, smartlead_client_ids");
  if (error) return map;
  for (const row of (data ?? []) as {
    lead_table: string | null;
    smartlead_client_ids: number[] | null;
  }[]) {
    if (!row.lead_table) continue;
    for (const id of row.smartlead_client_ids ?? []) {
      map.set(Number(id), row.lead_table);
    }
  }
  return map;
}

/**
 * Try to find the lead row in the per-client lead table.
 *
 * Match key per Omar: linkedin_url OR email. We try linkedin first
 * (more selective when present), then email.
 *
 * Soft-fail: if the table doesn't exist, the column is missing, or any other
 * Postgrest error fires, returns null and lets the caller continue with the
 * Smartlead-side snapshot. Lead-link is best-effort by design.
 */
export async function lookupLead(
  sb: SupabaseClient,
  leadTable: string,
  email: string | null | undefined,
  linkedinUrl: string | null | undefined,
): Promise<MatchedLead | null> {
  if (linkedinUrl) {
    const { data } = await sb
      .from(leadTable)
      .select("*")
      .eq("linkedin_url", linkedinUrl)
      .limit(1)
      .maybeSingle();
    if (data) return data as MatchedLead;
  }
  if (email) {
    const { data } = await sb
      .from(leadTable)
      .select("*")
      .eq("email", email)
      .limit(1)
      .maybeSingle();
    if (data) return data as MatchedLead;
  }
  return null;
}
