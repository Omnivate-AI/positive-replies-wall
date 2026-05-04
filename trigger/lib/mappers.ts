/**
 * Pure mapping functions: Smartlead API shapes → Supabase row shapes.
 * Kept separate from `ingest.ts` (which orchestrates I/O) so unit tests can
 * exercise the mapping logic with no network or DB.
 */

import type { SLCampaign, SLClient, SLLeadEntry, SLMessage } from "./smartlead.js";
import { uniboxUrl } from "./smartlead.js";

export interface ReplyRow {
  smartlead_message_id: string;
  smartlead_lead_id: number;
  smartlead_campaign_id: number;
  smartlead_client_id: number | null;
  smartlead_stats_id: string | null;
  reply_from_email: string;
  reply_to_email: string | null;
  reply_subject: string | null;
  reply_body_html: string;
  reply_received_at: string;
  lead_email: string | null;
  lead_first_name: string | null;
  lead_last_name: string | null;
  lead_company_name: string | null;
  lead_company_url: string | null;
  lead_linkedin_profile: string | null;
  lead_category_id: number | null;
  unibox_url: string;
  raw_lead_json: unknown;
  raw_message_json: unknown;
}

export function toReplyRow(
  client: SLClient | null,
  campaign: SLCampaign,
  leadEntry: SLLeadEntry,
  msg: SLMessage,
): ReplyRow {
  return {
    smartlead_message_id: msg.message_id,
    smartlead_lead_id: leadEntry.lead.id,
    smartlead_campaign_id: campaign.id,
    smartlead_client_id: client?.id ?? campaign.client_id ?? null,
    smartlead_stats_id: msg.stats_id ?? null,
    reply_from_email: msg.from,
    reply_to_email: msg.to ?? null,
    reply_subject: msg.subject ?? null,
    reply_body_html: msg.email_body,
    reply_received_at: msg.time,
    lead_email: leadEntry.lead.email ?? null,
    lead_first_name: leadEntry.lead.first_name ?? null,
    lead_last_name: leadEntry.lead.last_name ?? null,
    lead_company_name: leadEntry.lead.company_name ?? null,
    lead_company_url: leadEntry.lead.company_url ?? null,
    lead_linkedin_profile: leadEntry.lead.linkedin_profile ?? null,
    lead_category_id: leadEntry.lead_category_id ?? null,
    unibox_url: uniboxUrl(leadEntry.campaign_lead_map_id),
    raw_lead_json: leadEntry,
    raw_message_json: msg,
  };
}
