import { describe, it, expect } from "vitest";
import { toReplyRow } from "../../trigger/lib/mappers.js";
import {
  fixtureCampaign,
  fixtureClient,
  fixtureLeadEntry,
  fixtureReplyMessage,
} from "../_helpers/fixtures.js";

describe("toReplyRow", () => {
  it("maps a full Smartlead reply into a ReplyRow with every field populated", () => {
    const row = toReplyRow(fixtureClient, fixtureCampaign, fixtureLeadEntry, fixtureReplyMessage);

    expect(row.smartlead_message_id).toBe(fixtureReplyMessage.message_id);
    expect(row.smartlead_lead_id).toBe(fixtureLeadEntry.lead.id);
    expect(row.smartlead_campaign_id).toBe(fixtureCampaign.id);
    expect(row.smartlead_client_id).toBe(fixtureClient.id);
    expect(row.smartlead_stats_id).toBe(fixtureReplyMessage.stats_id);

    expect(row.reply_from_email).toBe(fixtureReplyMessage.from);
    expect(row.reply_to_email).toBe(fixtureReplyMessage.to);
    expect(row.reply_subject).toBe(fixtureReplyMessage.subject);
    expect(row.reply_body_html).toBe(fixtureReplyMessage.email_body);
    expect(row.reply_received_at).toBe(fixtureReplyMessage.time);

    expect(row.lead_email).toBe(fixtureLeadEntry.lead.email);
    expect(row.lead_first_name).toBe("Mark");
    expect(row.lead_last_name).toBe("Richards");
    expect(row.lead_company_name).toBe("Heru");
    expect(row.lead_company_url).toBe("https://www.seeheru.com");
    expect(row.lead_linkedin_profile).toBe("https://www.linkedin.com/in/markrrichards");
    expect(row.lead_category_id).toBe(1);

    expect(row.unibox_url).toBe(
      `https://app.smartlead.ai/app/master-inbox?leadMap=${fixtureLeadEntry.campaign_lead_map_id}`,
    );

    // Raw payload preserved verbatim — protects against schema drift in Smartlead.
    expect(row.raw_lead_json).toEqual(fixtureLeadEntry);
    expect(row.raw_message_json).toEqual(fixtureReplyMessage);
  });

  it("captures the FORWARDED-reply case: reply_from_email != lead_email", () => {
    // From M2 finding: Mark Richards forwarded to Jordan, who replied. The wall must
    // attribute the reply to its actual sender, not the lead we originally targeted.
    const row = toReplyRow(fixtureClient, fixtureCampaign, fixtureLeadEntry, fixtureReplyMessage);
    expect(row.reply_from_email).toBe("jordan@grayhouse.consulting");
    expect(row.lead_email).toBe("mrichards@heru.net");
    expect(row.reply_from_email).not.toBe(row.lead_email);
  });

  it("falls back from null client to campaign.client_id", () => {
    const row = toReplyRow(null, fixtureCampaign, fixtureLeadEntry, fixtureReplyMessage);
    expect(row.smartlead_client_id).toBe(fixtureCampaign.client_id);
  });

  it("returns null client_id when both client and campaign.client_id are null", () => {
    const row = toReplyRow(
      null,
      { ...fixtureCampaign, client_id: null },
      fixtureLeadEntry,
      fixtureReplyMessage,
    );
    expect(row.smartlead_client_id).toBeNull();
  });

  it("converts undefined optional fields to null (DB-friendly)", () => {
    const sparseLead = {
      ...fixtureLeadEntry,
      lead: {
        ...fixtureLeadEntry.lead,
        first_name: null,
        last_name: null,
        company_name: null,
        company_url: null,
        linkedin_profile: null,
      },
    };
    const sparseMsg = { ...fixtureReplyMessage, to: undefined as unknown as string, subject: null };
    const row = toReplyRow(fixtureClient, fixtureCampaign, sparseLead, sparseMsg);
    expect(row.lead_first_name).toBeNull();
    expect(row.lead_company_name).toBeNull();
    expect(row.reply_to_email).toBeNull();
    expect(row.reply_subject).toBeNull();
  });
});
