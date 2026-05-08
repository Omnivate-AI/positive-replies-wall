import { describe, it, expect } from "vitest";
import {
  toThreadInsert,
  toMessageInsert,
  redactionsFromLead,
  type MatchedLead,
} from "../../trigger/lib/mappers.js";
import { SDR_FIRST_NAMES } from "../../lib/sdr.js";
import {
  fixtureCampaign,
  fixtureClient,
  fixtureLeadEntry,
  fixtureReplyMessage,
  fixtureSentMessage,
} from "../_helpers/fixtures.js";

describe("toThreadInsert", () => {
  it("denormalizes the matched-lead snapshot when a lead row is matched", () => {
    const matched: MatchedLead = {
      id: 99,
      first_name: "Mark",
      last_name: "Richards",
      email: "mrichards@heru.net",
      title: "Director of Product",
      linkedin_url: "https://www.linkedin.com/in/markrrichards",
      company_name: "Heru",
      company_website: "https://www.seeheru.com",
      company_linkedin_url: "https://www.linkedin.com/company/heru",
    };

    const row = toThreadInsert({
      client: fixtureClient,
      campaign: fixtureCampaign,
      leadEntry: fixtureLeadEntry,
      campaignRegistryId: 42,
      leadTable: "orbitalx_leads",
      matchedLead: matched,
    });

    expect(row.smartlead_lead_id).toBe(fixtureLeadEntry.lead.id);
    expect(row.smartlead_campaign_id).toBe(fixtureCampaign.id);
    expect(row.smartlead_client_id).toBe(fixtureClient.id);
    expect(row.campaign_registry_id).toBe(42);
    expect(row.lead_table).toBe("orbitalx_leads");
    expect(row.lead_id).toBe(99);

    expect(row.lead_first_name).toBe("Mark");
    expect(row.lead_title).toBe("Director of Product");
    expect(row.lead_linkedin_url).toBe(matched.linkedin_url);
    expect(row.company_website).toBe(matched.company_website);
    expect(row.company_linkedin_url).toBe(matched.company_linkedin_url);
    expect(row.unibox_url).toBe(
      `https://app.smartlead.ai/app/master-inbox?leadMap=${fixtureLeadEntry.campaign_lead_map_id}`,
    );
  });

  it("falls back to Smartlead snapshot fields when no outbound-repo match", () => {
    const row = toThreadInsert({
      client: fixtureClient,
      campaign: fixtureCampaign,
      leadEntry: fixtureLeadEntry,
      campaignRegistryId: null,
      leadTable: "orbitalx_leads",
      matchedLead: null,
    });

    expect(row.lead_id).toBeNull();
    expect(row.lead_table).toBeNull(); // table only set when match exists
    expect(row.lead_first_name).toBe("Mark");
    expect(row.lead_email).toBe("mrichards@heru.net");
    expect(row.lead_linkedin_url).toBe(fixtureLeadEntry.lead.linkedin_profile);
    expect(row.company_name).toBe("Heru");
    expect(row.company_website).toBe("https://www.seeheru.com");
    expect(row.company_linkedin_url).toBeNull(); // not in Smartlead payload
    expect(row.lead_title).toBeNull(); // not in Smartlead payload
  });

  it("uses valda's company_linkedin column when company_linkedin_url is missing", () => {
    const matched: MatchedLead = {
      id: 5,
      company_linkedin: "https://linkedin.com/company/valda",
    };
    const row = toThreadInsert({
      client: fixtureClient,
      campaign: fixtureCampaign,
      leadEntry: fixtureLeadEntry,
      campaignRegistryId: null,
      leadTable: "valda_leads",
      matchedLead: matched,
    });
    expect(row.company_linkedin_url).toBe("https://linkedin.com/company/valda");
  });

  it("falls back null client → campaign.client_id", () => {
    const row = toThreadInsert({
      client: null,
      campaign: fixtureCampaign,
      leadEntry: fixtureLeadEntry,
      campaignRegistryId: null,
      leadTable: null,
      matchedLead: null,
    });
    expect(row.smartlead_client_id).toBe(fixtureCampaign.client_id);
  });
});

describe("toMessageInsert", () => {
  it("classifies SENT messages as outbound", () => {
    const msg = toMessageInsert(7, fixtureSentMessage);
    expect(msg.thread_id).toBe(7);
    expect(msg.direction).toBe("outbound");
    expect(msg.smartlead_email_seq_number).toBe(1);
    expect(msg.from_email).toBe(fixtureSentMessage.from);
    expect(msg.subject).toBe(fixtureSentMessage.subject);
    expect(msg.body_html).toBe(fixtureSentMessage.email_body);
    expect(msg.is_qualifying_reply).toBe(false);
    expect(msg.raw_smartlead_json).toEqual(fixtureSentMessage);
  });

  it("classifies a non-SDR-domain REPLY as inbound", () => {
    const msg = toMessageInsert(7, fixtureReplyMessage);
    expect(msg.direction).toBe("inbound");
    expect(msg.from_email).toBe("jordan@grayhouse.consulting");
  });

  it("classifies an SDR-domain REPLY as outbound (SDR replying inside the inbox)", () => {
    const sdrReply = {
      ...fixtureReplyMessage,
      type: "REPLY" as const,
      from: "andrew@getomnivate.com",
    };
    const msg = toMessageInsert(7, sdrReply);
    expect(msg.direction).toBe("outbound");
  });
});

describe("redactionsFromLead", () => {
  it("yields first/last/company/email from the matched lead, deduped, with match_type per row", () => {
    const out = redactionsFromLead({
      leadEntry: fixtureLeadEntry,
      matchedLead: {
        id: 1,
        first_name: "Mark",
        last_name: "Richards",
        email: "mark@heru.net",
        company_name: "Heru",
      },
    });
    expect(out).toEqual([
      // Single-token names → word_boundary so "Mark" doesn't substring-leak.
      { text: "Mark", match_type: "word_boundary" },
      { text: "Richards", match_type: "word_boundary" },
      { text: "Heru", match_type: "word_boundary" },
      // Email contains @ + . → literal.
      { text: "mark@heru.net", match_type: "literal" },
    ]);
  });

  it("falls back to Smartlead lead fields when no match", () => {
    const out = redactionsFromLead({ leadEntry: fixtureLeadEntry, matchedLead: null });
    expect(out).toEqual([
      { text: "Mark", match_type: "word_boundary" },
      { text: "Richards", match_type: "word_boundary" },
      { text: "Heru", match_type: "word_boundary" },
      { text: "mrichards@heru.net", match_type: "literal" },
    ]);
  });

  it("skips SDR first names and length-1 names", () => {
    const out = redactionsFromLead({
      leadEntry: {
        ...fixtureLeadEntry,
        lead: {
          ...fixtureLeadEntry.lead,
          first_name: "Andrew", // SDR — must be kept visible
          last_name: "X", // length 1 — too aggressive to mask
          company_name: "Heru",
        },
      },
      matchedLead: null,
    });
    // SDR first name + length-1 last name skipped; email + company kept.
    expect(out).toEqual([
      { text: "Heru", match_type: "word_boundary" },
      { text: "mrichards@heru.net", match_type: "literal" },
    ]);
  });

  it("returns email-only when names + company are absent", () => {
    const out = redactionsFromLead({
      leadEntry: {
        ...fixtureLeadEntry,
        lead: {
          ...fixtureLeadEntry.lead,
          first_name: null,
          last_name: null,
          company_name: null,
        },
      },
      matchedLead: null,
    });
    expect(out).toEqual([{ text: "mrichards@heru.net", match_type: "literal" }]);
  });

  it("the SDR allowlist comes from the canonical lib/sdr source — every SDR name is skipped", () => {
    // Any drift between mappers.ts's SDR detection and the canonical list
    // would surface here. With single-source-of-truth in lib/sdr.ts, adding
    // a new SDR there is automatically picked up by mappers.ts.
    for (const sdrName of SDR_FIRST_NAMES) {
      const out = redactionsFromLead({
        leadEntry: {
          ...fixtureLeadEntry,
          lead: {
            ...fixtureLeadEntry.lead,
            first_name: sdrName,
            last_name: "Lastname",
            company_name: "ACME",
          },
        },
        matchedLead: null,
      });
      // SDR first name skipped; last name + company + email pass through.
      expect(out.find((r) => r.text === sdrName)).toBeUndefined();
      expect(out.find((r) => r.text === "Lastname")).toBeDefined();
    }
  });

  it("multi-token company names get literal match_type", () => {
    const out = redactionsFromLead({
      leadEntry: fixtureLeadEntry,
      matchedLead: {
        id: 1,
        first_name: "Mauritz",
        last_name: "Gilfillan",
        email: "mauritz@example.com",
        company_name: "Acme Corp",
      },
    });
    // First/last single tokens → word_boundary; multi-token company → literal;
    // email → literal.
    expect(out).toContainEqual({ text: "Mauritz", match_type: "word_boundary" });
    expect(out).toContainEqual({ text: "Gilfillan", match_type: "word_boundary" });
    expect(out).toContainEqual({ text: "Acme Corp", match_type: "literal" });
    expect(out).toContainEqual({ text: "mauritz@example.com", match_type: "literal" });
  });
});
