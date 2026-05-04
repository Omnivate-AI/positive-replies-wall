/**
 * Shared test fixtures: realistic Smartlead-shaped payloads for unit tests.
 * Modeled on the real OrbitalX → Mark Richards → Jordan Heru forward we saw in M2.
 */

import type { SLCampaign, SLClient, SLLeadEntry, SLMessage } from "../../trigger/lib/smartlead.js";

export const fixtureClient: SLClient = {
  id: 221217,
  name: "Josh Arnold",
  email: "josh@orbitalx.com",
};

export const fixtureCampaign: SLCampaign = {
  id: 2851748,
  name: "OrbitalX_Josh_Leads_Verified",
  status: "COMPLETED",
  client_id: 221217,
};

export const fixtureLeadEntry: SLLeadEntry = {
  campaign_lead_map_id: 2603762462,
  created_at: "2026-01-19T08:58:10.000Z",
  status: "COMPLETED",
  lead_category_id: 1,
  lead: {
    id: 3202498872,
    first_name: "Mark",
    last_name: "Richards",
    email: "mrichards@heru.net",
    company_name: "Heru",
    company_url: "https://www.seeheru.com",
    linkedin_profile: "https://www.linkedin.com/in/markrrichards",
    custom_fields: {},
  },
};

export const fixtureReplyMessage: SLMessage = {
  type: "REPLY",
  email_seq_number: "1",
  message_id: "<CAJzMRYfowv_DA3f6f26+P+wCdkD4yeYHenGsb3ejhbQaULrFqQ@mail.gmail.com>",
  stats_id: "aedd56c4-d9d9-42b6-9d62-8849f93898e9",
  from: "jordan@grayhouse.consulting",
  to: "james.ford@orbitalxbrands.com",
  subject: "Re: vr in eye care",
  email_body:
    "<div>Hi James, I'm reaching out on behalf of Heru as their marketing director...</div>",
  time: "2026-01-19T20:10:46.000Z",
};

export const fixtureSentMessage: SLMessage = {
  type: "SENT",
  email_seq_number: "1",
  message_id: "<aedd56c4-d9d9-sl83-42b6-9d62-8849f93898e9@orbitalxbrands.com>",
  stats_id: "aedd56c4-d9d9-42b6-9d62-8849f93898e9",
  from: "james.ford@orbitalxbrands.com",
  to: "mrichards@heru.net",
  subject: "vr in eye care",
  email_body: "<div>Hi Mark, original outreach...</div>",
  time: "2026-01-19T16:21:50.523Z",
};

/** Build a Response-like object for stubbing global fetch in unit tests. */
export function mockResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  } as unknown as Response;
}
