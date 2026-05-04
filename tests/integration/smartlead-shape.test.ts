/**
 * Integration test: live Smartlead API returns the shapes our code expects.
 * Catches breaking schema changes upstream before they break the production ingest.
 */

import { describe, it, expect } from "vitest";
import {
  listClients,
  listCampaignsByClient,
  listInterestedLeadsPage,
} from "../../trigger/lib/smartlead.js";

describe("Smartlead live API shape", () => {
  it("listClients returns objects with at least { id: number }", async () => {
    const clients = await listClients();
    expect(clients.length).toBeGreaterThan(0);
    for (const c of clients) {
      expect(typeof c.id).toBe("number");
      // name + email may be null; we don't enforce
    }
  }, 30_000);

  it("listCampaignsByClient returns campaigns with id, name, status", async () => {
    const clients = await listClients();
    const orbitalx = clients.find((c) => c.id === 221217); // OrbitalX, our reference client
    expect(orbitalx, "OrbitalX (221217) not found in workspace").toBeTruthy();

    const campaigns = await listCampaignsByClient(orbitalx!.id);
    expect(campaigns.length).toBeGreaterThan(0);
    for (const c of campaigns) {
      expect(typeof c.id).toBe("number");
      expect(typeof c.name).toBe("string");
      expect(typeof c.status).toBe("string");
    }
  }, 30_000);

  it("listInterestedLeadsPage returns lead entries with the nested .lead shape", async () => {
    // OrbitalX_Josh_Leads_Verified — known to have category=1 leads
    const page = await listInterestedLeadsPage(2851748, { limit: 5 });
    if (page.length === 0) return; // campaign may have been cleaned up; soft-skip
    const entry = page[0];
    expect(typeof entry.campaign_lead_map_id).toBe("number");
    expect(entry.lead).toBeDefined();
    expect(typeof entry.lead.id).toBe("number");
    expect(typeof entry.lead.email).toBe("string");
    // Production gotcha #10: lead_category_id MUST be the numeric 1 for Interested.
    if (entry.lead_category_id !== null) {
      expect(entry.lead_category_id).toBe(1);
    }
  }, 30_000);
});
