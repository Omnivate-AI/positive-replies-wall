/**
 * Smartlead REST helpers for the positive-replies-wall ingestion task.
 * Mirrors the pattern from `outbound/trigger/lib/smartlead.ts`, trimmed to the
 * read-only operations we need:
 *   - list clients
 *   - list a client's campaigns
 *   - list a campaign's "Interested" leads (lead_category_id=1, the positive filter)
 *   - get message history for a lead (the actual reply content)
 *
 * Auth: SMARTLEAD_API_KEY env var (already in .env, also synced to Trigger.dev
 * via the syncEnvVars extension in trigger.config.ts).
 */

const SL_BASE = "https://server.smartlead.ai/api/v1";

function getApiKey(): string {
  const key = process.env.SMARTLEAD_API_KEY;
  if (!key) throw new Error("SMARTLEAD_API_KEY is not set");
  return key;
}

/**
 * GET with retry on transient errors (5xx, network errors, 429).
 * 4xx (except 429) returns immediately — those are bug-shaped, not flaky-shaped.
 *
 * Production observation: Smartlead's `/campaigns?client_id=...` returned
 * `500 read ECONNRESET` mid-backfill once. Without retry the entire run aborts.
 */
async function slGet<T = unknown>(path: string, attempt = 1): Promise<T> {
  const apiKey = getApiKey();
  const sep = path.includes("?") ? "&" : "?";
  const url = `${SL_BASE}${path}${sep}api_key=${apiKey}`;
  const MAX_ATTEMPTS = 4;

  let res: Response;
  try {
    res = await fetch(url);
  } catch (e) {
    // Network-level failure (TCP reset, DNS, etc.). Retry.
    if (attempt < MAX_ATTEMPTS) {
      const delay = Math.min(1000 * 2 ** (attempt - 1), 8000);
      await new Promise((r) => setTimeout(r, delay));
      return slGet<T>(path, attempt + 1);
    }
    throw new Error(
      `Smartlead GET ${path}: network error after ${MAX_ATTEMPTS} attempts: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  if (!res.ok) {
    const isTransient = res.status >= 500 || res.status === 429;
    if (isTransient && attempt < MAX_ATTEMPTS) {
      const delay = Math.min(1000 * 2 ** (attempt - 1), 8000);
      await new Promise((r) => setTimeout(r, delay));
      return slGet<T>(path, attempt + 1);
    }
    const txt = await res.text().catch(() => "");
    throw new Error(`Smartlead GET ${path}: ${res.status} ${txt.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

// ============================================================================
// Domain types — only the fields we read. Raw payload is preserved separately.
// ============================================================================

export interface SLClient {
  id: number;
  name: string | null;
  email: string | null;
}

export interface SLCampaign {
  id: number;
  name: string;
  status: string;
  client_id: number | null;
}

export interface SLLeadEntry {
  campaign_lead_map_id: number;
  created_at: string;
  status: string;
  lead_category_id: number | null;
  lead: {
    id: number;
    first_name: string | null;
    last_name: string | null;
    email: string;
    company_name: string | null;
    company_url: string | null;
    linkedin_profile: string | null;
    custom_fields?: Record<string, unknown>;
  };
}

export interface SLMessage {
  type: "SENT" | "REPLY";
  email_seq_number: string | null;
  message_id: string;
  stats_id: string | null;
  from: string;
  to: string;
  subject: string | null;
  email_body: string;
  time: string;
}

// ============================================================================
// Endpoints
// ============================================================================

export async function listClients(): Promise<SLClient[]> {
  // Smartlead's clients endpoint may return either an array or { data: [] }.
  const raw: unknown = await slGet("/client");
  if (Array.isArray(raw)) return raw as SLClient[];
  const wrapped = raw as { data?: SLClient[] };
  return wrapped.data ?? [];
}

export async function listCampaignsByClient(clientId: number): Promise<SLCampaign[]> {
  const raw: unknown = await slGet(`/campaigns?client_id=${clientId}`);
  if (Array.isArray(raw)) return raw as SLCampaign[];
  const wrapped = raw as { data?: SLCampaign[] };
  return wrapped.data ?? [];
}

/**
 * `lead_category_id=1` is "Interested" — the positive-reply filter. Numeric, not
 * string (production gotcha #10 from outbound/knowledge/tools/smartlead.md).
 */
export async function listInterestedLeadsPage(
  campaignId: number,
  opts: { limit?: number; offset?: number } = {},
): Promise<SLLeadEntry[]> {
  const limit = opts.limit ?? 100;
  const offset = opts.offset ?? 0;
  const path = `/campaigns/${campaignId}/leads?lead_category_id=1&limit=${limit}&offset=${offset}`;
  const raw: unknown = await slGet(path);
  const arr: SLLeadEntry[] = Array.isArray(raw)
    ? (raw as SLLeadEntry[])
    : ((raw as { data?: SLLeadEntry[] }).data ?? []);
  // Smartlead returns numeric-looking IDs as strings in this endpoint. Coerce
  // here so downstream code (uniboxUrl, mapper, DB BIGINT columns) sees numbers.
  return arr.map((e) => ({
    ...e,
    campaign_lead_map_id: Number(e.campaign_lead_map_id),
    lead: { ...e.lead, id: Number(e.lead.id) },
  }));
}

/** Auto-paginates through every Interested lead in a campaign. */
export async function* iterInterestedLeads(
  campaignId: number,
  pageSize = 100,
): AsyncGenerator<SLLeadEntry> {
  let offset = 0;
  while (true) {
    const page = await listInterestedLeadsPage(campaignId, { limit: pageSize, offset });
    if (page.length === 0) return;
    for (const entry of page) yield entry;
    if (page.length < pageSize) return;
    offset += pageSize;
  }
}

export async function getLeadMessageHistory(
  campaignId: number,
  leadId: number,
): Promise<SLMessage[]> {
  const raw: unknown = await slGet(`/campaigns/${campaignId}/leads/${leadId}/message-history`);
  if (Array.isArray(raw)) return raw as SLMessage[];
  const wrapped = raw as { history?: SLMessage[]; data?: SLMessage[] };
  return wrapped.history ?? wrapped.data ?? [];
}

/**
 * Build the Smartlead unibox deep link.
 * Pattern confirmed from `outbound/scripts/orbitalx-calling-list.json`:
 *   https://app.smartlead.ai/app/master-inbox?leadMap=<campaign_lead_map_id>
 *
 * Note: keyed on campaign_lead_map_id, not lead_id — a single lead in multiple
 * campaigns has a different unibox URL per campaign.
 */
export function uniboxUrl(campaignLeadMapId: number): string {
  return `https://app.smartlead.ai/app/master-inbox?leadMap=${campaignLeadMapId}`;
}

/**
 * Sometimes Smartlead's message-history endpoint returns SDR-side outbound
 * messages tagged as `type=REPLY` — typically when an SDR replies inside the
 * inbox to keep the thread moving (e.g. "Thanks Justine. A strong set here..."
 * from Andrew). Those aren't prospect replies — they're our own outbound — and
 * they pollute prw_replies if we keep them.
 *
 * Filter is by from-address domain: any address whose domain matches an
 * Omnivate-side outbound domain is SDR-side and skipped at ingest. Domains are
 * derived from the production CLIENT_MAP in outbound/trigger/lib/smartlead.ts
 * plus observed contamination in the v1.0 backfill.
 */
const SDR_DOMAIN_SUBSTRINGS = [
  "roosterpunk.com",
  "orbitalxbrands.com",
  "orbitalx.com",
  "getomnivate.com",
  "gladlane.com",
  "inboxpantheon.com",
  "valdaenergy.com",
  "paycaptain.com",
  "cylindo.com",
];

export function isSdrSideMessage(fromEmail: string | null | undefined): boolean {
  if (!fromEmail) return false;
  const lower = fromEmail.toLowerCase();
  const at = lower.indexOf("@");
  if (at < 0) return false;
  const domain = lower.slice(at + 1);
  return SDR_DOMAIN_SUBSTRINGS.some((sub) => domain.includes(sub));
}
