/**
 * Pure mapping functions: Smartlead API shapes → prw_threads / prw_messages
 * insert shapes. Kept separate from `ingest.ts` (which orchestrates I/O) so
 * unit tests can exercise the mapping logic with no network or DB.
 *
 * Note: replaces v1's `toReplyRow` / `ReplyRow`. The new model has one thread
 * row per (lead × campaign) plus N message rows.
 */

import type { SLCampaign, SLClient, SLLeadEntry, SLMessage } from "./smartlead.js";
import { messageDirection, uniboxUrl } from "./smartlead.js";

/**
 * Whatever subset of columns we managed to read from the per-client lead table
 * (e.g. pantheon_leads, valda_leads). Schemas drift between tables — every
 * field is optional. valda_leads uses `company_linkedin` instead of
 * `company_linkedin_url`; we read both.
 */
export interface MatchedLead {
  id: number;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  title?: string | null;
  linkedin_url?: string | null;
  company_name?: string | null;
  company_website?: string | null;
  company_linkedin_url?: string | null;
  company_linkedin?: string | null;
}

export interface ThreadInsert {
  smartlead_lead_id: number;
  smartlead_campaign_id: number;
  smartlead_client_id: number | null;
  smartlead_campaign_lead_map_id: number;
  campaign_registry_id: number | null;
  lead_table: string | null;
  lead_id: number | null;
  lead_first_name: string | null;
  lead_last_name: string | null;
  lead_email: string;
  lead_title: string | null;
  lead_linkedin_url: string | null;
  company_name: string | null;
  company_website: string | null;
  company_linkedin_url: string | null;
  unibox_url: string;
}

export interface MessageInsert {
  thread_id: number;
  smartlead_message_id: string;
  smartlead_stats_id: string | null;
  smartlead_email_seq_number: number | null;
  direction: "outbound" | "inbound";
  is_qualifying_reply: boolean;
  from_name: string | null;
  from_email: string;
  to_email: string | null;
  subject: string | null;
  body_html: string;
  body_text: string | null;
  sent_at: string;
  raw_smartlead_json: unknown;
}

/**
 * Build the prw_threads insert row from a Smartlead lead entry plus an
 * (optional) matched outbound-repo lead row. Snapshot fields prefer the
 * matched-lead values when present, else fall back to Smartlead's lead payload.
 */
export function toThreadInsert(args: {
  client: SLClient | null;
  campaign: SLCampaign;
  leadEntry: SLLeadEntry;
  campaignRegistryId: number | null;
  leadTable: string | null;
  matchedLead: MatchedLead | null;
}): ThreadInsert {
  const { client, campaign, leadEntry, campaignRegistryId, leadTable, matchedLead } = args;
  const fallbackEmail = leadEntry.lead.email;

  return {
    smartlead_lead_id: leadEntry.lead.id,
    smartlead_campaign_id: campaign.id,
    smartlead_client_id: client?.id ?? campaign.client_id ?? null,
    smartlead_campaign_lead_map_id: leadEntry.campaign_lead_map_id,
    campaign_registry_id: campaignRegistryId,
    lead_table: leadTable && matchedLead ? leadTable : null,
    lead_id: matchedLead?.id ?? null,
    lead_first_name: matchedLead?.first_name ?? leadEntry.lead.first_name ?? null,
    lead_last_name: matchedLead?.last_name ?? leadEntry.lead.last_name ?? null,
    lead_email: matchedLead?.email ?? fallbackEmail,
    lead_title: matchedLead?.title ?? null,
    lead_linkedin_url:
      matchedLead?.linkedin_url ?? leadEntry.lead.linkedin_profile ?? null,
    company_name: matchedLead?.company_name ?? leadEntry.lead.company_name ?? null,
    company_website: matchedLead?.company_website ?? leadEntry.lead.company_url ?? null,
    company_linkedin_url:
      matchedLead?.company_linkedin_url ?? matchedLead?.company_linkedin ?? null,
    unibox_url: uniboxUrl(leadEntry.campaign_lead_map_id),
  };
}

/**
 * Build a prw_messages insert row. is_qualifying_reply is set later (in a
 * post-step) based on which inbound message is earliest by sent_at. Initial
 * insert always passes false.
 */
export function toMessageInsert(threadId: number, msg: SLMessage): MessageInsert {
  const seq =
    msg.email_seq_number !== null && msg.email_seq_number !== undefined
      ? Number(msg.email_seq_number) || null
      : null;
  return {
    thread_id: threadId,
    smartlead_message_id: msg.message_id,
    smartlead_stats_id: msg.stats_id ?? null,
    smartlead_email_seq_number: seq,
    direction: messageDirection(msg),
    is_qualifying_reply: false,
    from_name: null, // Smartlead's message-history endpoint exposes only the address
    from_email: msg.from,
    to_email: msg.to ?? null,
    subject: msg.subject ?? null,
    body_html: msg.email_body,
    body_text: null, // populated by classifier's stripHtml on the qualifying reply
    sent_at: msg.time,
    raw_smartlead_json: msg,
  };
}

/**
 * Auto-redactions derived from the matched lead row at ingest time:
 * the lead's first name, last name, and company name. These are deterministic —
 * we know exactly what to mask before any classifier sees the body.
 *
 * Falls back to Smartlead's lead payload when no outbound-repo row matched.
 *
 * Skips strings that match an SDR first name (Christie/Andrew/James/Josh/Omar)
 * because those are kept unredacted by M4 redaction policy.
 */
import { SDR_FIRST_NAMES } from "../../lib/sdr.js";

/** Lower-cased mirror of the canonical allowlist for case-insensitive
 * lookups. Derived at module load — there's no second source to drift. */
const SDR_FIRST_NAMES_LOWER = new Set(
  SDR_FIRST_NAMES.map((n) => n.toLowerCase()),
);

/** Decide match_type for an auto-seeded redaction. Single-token strings
 * (no whitespace, no `@`, no `.`) become `word_boundary` so a short name
 * like "Lee" doesn't substring-leak into "feeling". Anything with whitespace
 * or punctuation stays `literal`. Mirrors `inferMatchType` in
 * `lib/redactions.tsx`; duplicated here to avoid pulling renderer code into
 * the Trigger.dev runtime. */
function inferMatchType(text: string): "literal" | "word_boundary" {
  if (/\s/.test(text)) return "literal";
  if (/[@.]/.test(text)) return "literal";
  return "word_boundary";
}

export interface AutoLeadRedaction {
  text: string;
  match_type: "literal" | "word_boundary";
}

export function redactionsFromLead(args: {
  leadEntry: SLLeadEntry;
  matchedLead: MatchedLead | null;
}): AutoLeadRedaction[] {
  const { leadEntry, matchedLead } = args;
  const out: AutoLeadRedaction[] = [];

  const candidates = [
    matchedLead?.first_name ?? leadEntry.lead.first_name,
    matchedLead?.last_name ?? leadEntry.lead.last_name,
    matchedLead?.company_name ?? leadEntry.lead.company_name,
    // Full email — masking only the first name leaves the domain visible
    // (emmanuel@omnivate.ai → ████████@omnivate.ai). Including the full
    // address ensures one black bar replaces the whole string.
    matchedLead?.email ?? leadEntry.lead.email,
  ];

  const seen = new Set<string>();
  for (const raw of candidates) {
    if (!raw) continue;
    const trimmed = raw.trim();
    if (trimmed.length < 2) continue; // single-letter "redactions" mask too aggressively
    if (SDR_FIRST_NAMES_LOWER.has(trimmed.toLowerCase())) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push({ text: trimmed, match_type: inferMatchType(trimmed) });
  }
  return out;
}
