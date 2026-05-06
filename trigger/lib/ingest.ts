/**
 * Core ingestion logic — pure of Trigger.dev imports, so the same code can run
 * inside the Trigger.dev task or as a local CLI script.
 *
 * Per-(lead × campaign) flow under the thread+messages model:
 *   1. Fetch the lead's full Smartlead message history (SENT + REPLY).
 *   2. Skip if no inbound (genuine prospect) message exists yet.
 *   3. Resolve campaign_registry_id (cached map).
 *   4. Resolve lead_table for the campaign's client (cached map).
 *   5. Soft-match the lead in <lead_table> by (linkedin_url, email).
 *   6. Upsert prw_threads (snapshot fields denormalized; highlight_text left
 *      alone on re-runs so admin edits survive).
 *   7. Upsert all prw_messages for the thread (UNIQUE on smartlead_message_id).
 *   8. Reconcile is_qualifying_reply — exactly one (the earliest inbound).
 *   9. Auto-populate prw_redactions from the matched lead's first/last/company
 *      name with source='auto_lead'.
 *  10. Seed prw_publish_state if missing.
 *
 * Idempotency:
 *   - Threads keyed on (smartlead_lead_id, smartlead_campaign_id).
 *   - Messages keyed on smartlead_message_id (UNIQUE).
 *   - Re-runs only update snapshot/bookkeeping; admin-set highlight_text is
 *     preserved.
 *   - auto_lead redactions keyed on (thread_id, text, match_type) — re-runs
 *     are no-ops; admin-removed redactions don't get re-added because the
 *     UNIQUE constraint matches both sources, but if Omar removes one we'd
 *     re-create it. Acceptable tradeoff: the deterministic auto rules ARE
 *     the policy; admin can always re-remove.
 */

import {
  type SLMessage,
  listClients,
  listCampaignsByClient,
  iterInterestedLeads,
  getLeadMessageHistory,
  messageDirection,
} from "./smartlead.js";
import {
  toThreadInsert,
  toMessageInsert,
  redactionsFromLead,
  type MatchedLead,
} from "./mappers.js";
import {
  loadCampaignRegistry,
  loadClientLeadTables,
  lookupLead,
} from "./lead-lookup.js";
import { supabase } from "./supabase.js";
import { retry, isTransientFetchError } from "./retry.js";

export interface IngestStats {
  clientsSeen: number;
  campaignsSeen: number;
  leadsSeen: number;
  threadsInserted: number;
  threadsUpdated: number;
  threadsSkippedNoInbound: number;
  messagesInserted: number;
  leadsMatched: number;
  redactionsSeeded: number;
  errors: string[];
}

export interface IngestOptions {
  /** Restrict to these client IDs (default: all clients). */
  clientIds?: number[];
  /** Restrict to these campaign IDs. */
  campaignIds?: number[];
  /** Restrict to these campaign statuses (e.g. ["ACTIVE", "COMPLETED"]). */
  campaignStatuses?: string[];
  /** Coarse progress callback. */
  onProgress?: (msg: string) => void;
  /** Trigger.dev run id passthrough (kept for parity with v1; no longer logged to DB). */
  triggerRunId?: string;
}

export async function runIngest(opts: IngestOptions = {}): Promise<IngestStats> {
  const sb = supabase();
  const log = opts.onProgress ?? ((m: string) => console.log(m));

  const stats: IngestStats = {
    clientsSeen: 0,
    campaignsSeen: 0,
    leadsSeen: 0,
    threadsInserted: 0,
    threadsUpdated: 0,
    threadsSkippedNoInbound: 0,
    messagesInserted: 0,
    leadsMatched: 0,
    redactionsSeeded: 0,
    errors: [],
  };

  // Eager-load cross-repo lookups once per run. Both maps are tiny.
  const [campaignRegistryMap, leadTableMap] = await Promise.all([
    loadCampaignRegistry(sb),
    loadClientLeadTables(sb),
  ]);
  log(
    `Loaded campaign_registry (${campaignRegistryMap.size}) and client lead-table map (${leadTableMap.size})`,
  );

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

      const campaignRegistryId = campaignRegistryMap.get(campaign.id) ?? null;
      const leadTableForClient =
        leadTableMap.get(client.id) ??
        (campaign.client_id ? leadTableMap.get(campaign.client_id) : undefined) ??
        null;

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

        // Skip threads with no inbound: nothing to flag as the qualifying reply.
        const hasInbound = messages.some((m) => messageDirection(m) === "inbound");
        if (!hasInbound) {
          stats.threadsSkippedNoInbound++;
          continue;
        }

        // Lead match (best-effort).
        let matchedLead: MatchedLead | null = null;
        if (leadTableForClient) {
          try {
            matchedLead = await lookupLead(
              sb,
              leadTableForClient,
              leadEntry.lead.email,
              leadEntry.lead.linkedin_profile,
            );
          } catch (e) {
            stats.errors.push(
              `lead-lookup c${campaign.id}/l${leadEntry.lead.id} in ${leadTableForClient}: ${e instanceof Error ? e.message : String(e)}`,
            );
          }
        }
        if (matchedLead) stats.leadsMatched++;

        // Build + upsert the thread.
        const threadInsert = toThreadInsert({
          client,
          campaign,
          leadEntry,
          campaignRegistryId,
          leadTable: leadTableForClient,
          matchedLead,
        });

        let threadId: number | null = null;
        try {
          const existing = await sb
            .from("prw_threads")
            .select("id")
            .eq("smartlead_lead_id", threadInsert.smartlead_lead_id)
            .eq("smartlead_campaign_id", threadInsert.smartlead_campaign_id)
            .maybeSingle();
          if (existing.error) throw new Error(existing.error.message);

          if (existing.data) {
            threadId = (existing.data as { id: number }).id;
            // Update snapshot + bookkeeping only — leave highlight_text alone
            // so admin edits survive re-runs.
            const { highlight_text: _omit, ...snapshotOnly } = {
              ...threadInsert,
              highlight_text: undefined as string | undefined,
            };
            void _omit;
            const upd = await retry(
              async () => {
                const r = await sb
                  .from("prw_threads")
                  .update(snapshotOnly)
                  .eq("id", threadId!);
                if (r.error) throw new Error(r.error.message);
                return r;
              },
              { isRetryable: isTransientFetchError },
            );
            void upd;
            stats.threadsUpdated++;
          } else {
            const ins = await retry(
              async () => {
                const r = await sb
                  .from("prw_threads")
                  .insert(threadInsert)
                  .select("id")
                  .single();
                if (r.error) throw new Error(r.error.message);
                return r;
              },
              { isRetryable: isTransientFetchError },
            );
            threadId = (ins.data as { id: number }).id;
            stats.threadsInserted++;
          }
        } catch (e) {
          stats.errors.push(
            `thread c${campaign.id}/l${leadEntry.lead.id}: ${e instanceof Error ? e.message : String(e)}`,
          );
          continue;
        }

        // Insert all messages for the thread.
        const messageRows = messages.map((m) => toMessageInsert(threadId!, m));
        try {
          const ins = await retry(
            async () => {
              const r = await sb
                .from("prw_messages")
                .upsert(messageRows, {
                  onConflict: "smartlead_message_id",
                  ignoreDuplicates: true,
                })
                .select("id");
              if (r.error) throw new Error(r.error.message);
              return r;
            },
            { isRetryable: isTransientFetchError },
          );
          stats.messagesInserted += ins.data?.length ?? 0;
        } catch (e) {
          stats.errors.push(
            `messages-upsert thread${threadId}: ${e instanceof Error ? e.message : String(e)}`,
          );
          continue;
        }

        // Reconcile the qualifying-reply flag — earliest inbound message wins.
        await reconcileQualifyingReply(sb, threadId!, stats);

        // Seed auto_lead redactions.
        const redactionTexts = redactionsFromLead({ leadEntry, matchedLead });
        if (redactionTexts.length > 0) {
          const redactionRows = redactionTexts.map((text) => ({
            thread_id: threadId!,
            text,
            match_type: "literal",
            source: "auto_lead",
          }));
          try {
            const r = await sb.from("prw_redactions").upsert(redactionRows, {
              onConflict: "thread_id,text,match_type",
              ignoreDuplicates: true,
            });
            if (r.error) throw new Error(r.error.message);
            stats.redactionsSeeded += redactionRows.length;
          } catch (e) {
            stats.errors.push(
              `redactions thread${threadId}: ${e instanceof Error ? e.message : String(e)}`,
            );
          }
        }

        // Seed publish_state default row if not present.
        try {
          const r = await sb.from("prw_publish_state").upsert(
            { thread_id: threadId! },
            { onConflict: "thread_id", ignoreDuplicates: true },
          );
          if (r.error) throw new Error(r.error.message);
        } catch (e) {
          stats.errors.push(
            `publish_state thread${threadId}: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    }
  }

  log(
    `Done: clients=${stats.clientsSeen} campaigns=${stats.campaignsSeen} leads=${stats.leadsSeen} threadsIns=${stats.threadsInserted} threadsUpd=${stats.threadsUpdated} skippedNoInbound=${stats.threadsSkippedNoInbound} msgsIns=${stats.messagesInserted} leadsMatched=${stats.leadsMatched} redactions=${stats.redactionsSeeded} errors=${stats.errors.length}`,
  );
  return stats;
}

/**
 * Set is_qualifying_reply = true on the earliest inbound message in the thread,
 * false on every other. Idempotent — safe to call after every message upsert.
 *
 * Order matters: the partial unique index `(thread_id) WHERE is_qualifying_reply`
 * means we MUST clear the old qualifying flag before setting the new one,
 * otherwise the UPDATE conflicts with itself.
 */
async function reconcileQualifyingReply(
  sb: ReturnType<typeof supabase>,
  threadId: number,
  stats: IngestStats,
): Promise<void> {
  try {
    const { data: inbound, error } = await sb
      .from("prw_messages")
      .select("id, sent_at, is_qualifying_reply")
      .eq("thread_id", threadId)
      .eq("direction", "inbound")
      .order("sent_at", { ascending: true });
    if (error) throw new Error(error.message);
    const rows = (inbound ?? []) as {
      id: number;
      sent_at: string;
      is_qualifying_reply: boolean;
    }[];
    if (rows.length === 0) return;

    const earliestId = rows[0].id;
    // Clear any stale qualifying flags first (defensive, even if currently
    // there's only one — earlier runs may have flagged a different message).
    const stale = rows.filter((r) => r.is_qualifying_reply && r.id !== earliestId);
    if (stale.length > 0) {
      const { error: clearErr } = await sb
        .from("prw_messages")
        .update({ is_qualifying_reply: false })
        .in(
          "id",
          stale.map((r) => r.id),
        );
      if (clearErr) throw new Error(`clear stale qualifying: ${clearErr.message}`);
    }
    const earliest = rows[0];
    if (!earliest.is_qualifying_reply) {
      const { error: setErr } = await sb
        .from("prw_messages")
        .update({ is_qualifying_reply: true })
        .eq("id", earliestId);
      if (setErr) throw new Error(`set qualifying: ${setErr.message}`);
    }
  } catch (e) {
    stats.errors.push(
      `qualifying-reply thread${threadId}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}
