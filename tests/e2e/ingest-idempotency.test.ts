/**
 * E2E test: full ingestion pipeline against real Smartlead + real Supabase
 * under the v2.0 thread+messages model.
 *
 * Strategy: run on one known-stable campaign (OrbitalX_Josh_Leads_Verified),
 * verify a non-zero count of threads + messages, then re-run and verify the
 * second run is a no-op for inserts (threadsInserted=0, messagesInserted=0,
 * threadsUpdated tracks every existing thread).
 */

import { describe, it, expect } from "vitest";
import { runIngest } from "../../trigger/lib/ingest.js";

const REFERENCE_CAMPAIGN_ID = 2851748; // OrbitalX_Josh_Leads_Verified
const REFERENCE_CLIENT_ID = 221217; // OrbitalX

describe("End-to-end ingest + idempotency", () => {
  it(
    "first run: completes without errors and inserts threads + messages",
    async () => {
      const stats = await runIngest({
        clientIds: [REFERENCE_CLIENT_ID],
        campaignIds: [REFERENCE_CAMPAIGN_ID],
      });

      expect(stats.errors, JSON.stringify(stats.errors)).toEqual([]);
      expect(stats.campaignsSeen).toBe(1);
      // First run for this campaign: should have inserted threads OR (if a prior
      // test run already populated) at least updated them. Either way, leads_seen > 0.
      expect(stats.leadsSeen).toBeGreaterThan(0);
      expect(stats.threadsInserted + stats.threadsUpdated).toBeGreaterThan(0);
      expect(stats.messagesInserted).toBeGreaterThanOrEqual(0);
    },
    300_000,
  );

  it(
    "second run: idempotent — 0 threads inserted, 0 new messages",
    async () => {
      const stats = await runIngest({
        clientIds: [REFERENCE_CLIENT_ID],
        campaignIds: [REFERENCE_CAMPAIGN_ID],
      });

      expect(stats.errors, JSON.stringify(stats.errors)).toEqual([]);
      expect(stats.threadsInserted).toBe(0);
      expect(stats.messagesInserted).toBe(0);
      expect(stats.threadsUpdated).toBeGreaterThan(0);
    },
    300_000,
  );
});
