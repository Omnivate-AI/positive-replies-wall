/**
 * Core ingestion logic — pure (no Trigger.dev imports), so the same code
 * can run inside a Trigger.dev task or as a local CLI script.
 *
 * Flow:
 *   1. Open a prw_ingest_runs row (status = 'running')
 *   2. For each in-scope client:
 *      a. List campaigns
 *      b. For each in-scope campaign:
 *         - Iterate Interested leads (lead_category_id = 1)
 *         - For each lead: fetch message history, take every REPLY-typed message
 *         - Bulk-upsert all REPLY rows for the campaign with ON CONFLICT(smartlead_message_id) DO NOTHING
 *         - Seed default prw_publish_state (is_published=false) for newly inserted rows
 *   3. Close the prw_ingest_runs row with stats
 *
 * Idempotency: smartlead_message_id is UNIQUE on prw_replies. Re-runs only insert new replies.
 */

import {
  type SLMessage,
  listClients,
  listCampaignsByClient,
  iterInterestedLeads,
  getLeadMessageHistory,
} from "./smartlead.js";
import { toReplyRow, type ReplyRow } from "./mappers.js";
import { supabase } from "./supabase.js";
import { retry, isTransientFetchError } from "./retry.js";

export interface IngestStats {
  runId: number | null;
  clientsSeen: number;
  campaignsSeen: number;
  leadsSeen: number;
  repliesSeen: number;
  repliesInserted: number;
  repliesSkippedExisting: number;
  errors: string[];
}

export interface IngestOptions {
  /** Restrict to these client IDs (default: all 9 clients). */
  clientIds?: number[];
  /** Restrict to these campaign IDs (default: all campaigns of in-scope clients). */
  campaignIds?: number[];
  /** Restrict to these campaign statuses (e.g., ["ACTIVE", "COMPLETED"]). Default: all. */
  campaignStatuses?: string[];
  /** Coarse progress callback (run id, milestones). */
  onProgress?: (msg: string) => void;
  /** Trigger.dev run id passthrough so we can cross-reference in prw_ingest_runs. */
  triggerRunId?: string;
}


export async function runIngest(opts: IngestOptions = {}): Promise<IngestStats> {
  const sb = supabase();
  const log = opts.onProgress ?? ((m: string) => console.log(m));

  // Open a run row
  const { data: runRow, error: runErr } = await sb
    .from("prw_ingest_runs")
    .insert({ status: "running", trigger_run_id: opts.triggerRunId ?? null })
    .select("id")
    .single();
  if (runErr) throw new Error(`Failed to open ingest run: ${runErr.message}`);
  const runId = (runRow as { id: number }).id;
  log(`Opened ingest run ${runId}`);

  const stats: IngestStats = {
    runId,
    clientsSeen: 0,
    campaignsSeen: 0,
    leadsSeen: 0,
    repliesSeen: 0,
    repliesInserted: 0,
    repliesSkippedExisting: 0,
    errors: [],
  };

  try {
    const allClients = await listClients();
    const clientsInScope = opts.clientIds
      ? allClients.filter((c) => opts.clientIds!.includes(c.id))
      : allClients;
    log(`Clients in scope: ${clientsInScope.length}/${allClients.length}`);

    for (const client of clientsInScope) {
      stats.clientsSeen++;

      const campaigns = await listCampaignsByClient(client.id);
      const campaignsInScope = campaigns.filter((c) => {
        if (opts.campaignIds && !opts.campaignIds.includes(c.id)) return false;
        if (opts.campaignStatuses && !opts.campaignStatuses.includes(c.status)) return false;
        return true;
      });

      for (const campaign of campaignsInScope) {
        stats.campaignsSeen++;
        log(`  c${campaign.id} ${campaign.name} [${campaign.status}]`);

        const replyRows: ReplyRow[] = [];

        for await (const leadEntry of iterInterestedLeads(campaign.id)) {
          stats.leadsSeen++;

          let messages: SLMessage[];
          try {
            messages = await getLeadMessageHistory(campaign.id, leadEntry.lead.id);
          } catch (e) {
            stats.errors.push(
              `messages c${campaign.id}/l${leadEntry.lead.id}: ${e instanceof Error ? e.message : String(e)}`,
            );
            continue;
          }

          for (const m of messages.filter((x) => x.type === "REPLY")) {
            stats.repliesSeen++;
            replyRows.push(toReplyRow(client, campaign, leadEntry, m));
          }
        }

        if (replyRows.length === 0) continue;

        // Bulk upsert with ignoreDuplicates: rows whose smartlead_message_id already
        // exists are silently skipped. Returned rows are only the newly inserted ones,
        // so length difference = skipped count.
        // Wrapped in retry() so a transient fetch failure doesn't lose the campaign's batch
        // (saw 3 such losses in the first full backfill run).
        let inserted: { id: number; smartlead_message_id: string }[] | null = null;
        let upsertErrMsg: string | null = null;
        try {
          inserted = await retry(
            async () => {
              const res = await sb
                .from("prw_replies")
                .upsert(replyRows, {
                  onConflict: "smartlead_message_id",
                  ignoreDuplicates: true,
                })
                .select("id, smartlead_message_id");
              if (res.error) throw new Error(res.error.message);
              return (res.data ?? []) as { id: number; smartlead_message_id: string }[];
            },
            { isRetryable: isTransientFetchError },
          );
        } catch (e) {
          upsertErrMsg = e instanceof Error ? e.message : String(e);
        }

        if (upsertErrMsg) {
          stats.errors.push(`upsert c${campaign.id}: ${upsertErrMsg}`);
          continue;
        }

        const insertedCount = inserted?.length ?? 0;
        stats.repliesInserted += insertedCount;
        stats.repliesSkippedExisting += replyRows.length - insertedCount;

        // Seed default publish_state for newly inserted replies (also retry-wrapped)
        if (insertedCount > 0 && inserted) {
          const stateRows = inserted.map((r) => ({ reply_id: r.id }));
          try {
            await retry(
              async () => {
                const res = await sb
                  .from("prw_publish_state")
                  .upsert(stateRows, { onConflict: "reply_id", ignoreDuplicates: true });
                if (res.error) throw new Error(res.error.message);
                return res;
              },
              { isRetryable: isTransientFetchError },
            );
          } catch (e) {
            stats.errors.push(
              `publish_state c${campaign.id}: ${e instanceof Error ? e.message : String(e)}`,
            );
          }
        }

        log(
          `    ${replyRows.length} replies (${insertedCount} new, ${replyRows.length - insertedCount} already-ingested)`,
        );
      }
    }

    await sb
      .from("prw_ingest_runs")
      .update({
        status: stats.errors.length === 0 ? "completed" : "failed",
        finished_at: new Date().toISOString(),
        clients_seen: stats.clientsSeen,
        campaigns_seen: stats.campaignsSeen,
        leads_seen: stats.leadsSeen,
        replies_seen: stats.repliesSeen,
        replies_inserted: stats.repliesInserted,
        replies_skipped_existing: stats.repliesSkippedExisting,
        error_message: stats.errors.length ? stats.errors.slice(0, 20).join("\n") : null,
      })
      .eq("id", runId);

    log(
      `Done: clients=${stats.clientsSeen} campaigns=${stats.campaignsSeen} leads=${stats.leadsSeen} replies=${stats.repliesSeen} inserted=${stats.repliesInserted} skipped=${stats.repliesSkippedExisting} errors=${stats.errors.length}`,
    );
    return stats;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    stats.errors.push(`fatal: ${msg}`);
    await sb
      .from("prw_ingest_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        clients_seen: stats.clientsSeen,
        campaigns_seen: stats.campaignsSeen,
        leads_seen: stats.leadsSeen,
        replies_seen: stats.repliesSeen,
        replies_inserted: stats.repliesInserted,
        replies_skipped_existing: stats.repliesSkippedExisting,
        error_message: msg,
      })
      .eq("id", runId);
    throw e;
  }
}
