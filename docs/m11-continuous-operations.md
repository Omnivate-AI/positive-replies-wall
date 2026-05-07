# M11 — Continuous ingestion, scheduling, and runbook

Phase 5: continuous operations. The wall + admin shipped in M10; new positive replies still required somebody to manually trigger ingest and classify. M11 puts both on a daily cron and writes the operational playbook so the system can be debugged and recovered without re-tracing the codebase.

## TL;DR

- **One scheduled task** at `trigger/scheduled-ingest-and-classify.ts`. Runs daily at **08:00 Europe/London** (BST/GMT auto-handled by the cron `timezone` field). Calls `ingestSmartleadReplies` then `classifyReplies` via `triggerAndWait`.
- **Independent failure handling.** If today's ingest fails, classify still runs — it operates on the full set of unclassified threads and can catch up older work. Both child runs surface independently in the Trigger.dev dashboard.
- **Failure surfacing** uses Trigger.dev's built-in alert configuration (set in the dashboard, not in code). The brief's "twice in a row" rule maps directly to a Trigger.dev alert.
- **Slack notifications deferred** to a follow-up. Code design is documented in `docs/m11-runbook.md` so we can drop in `notifySlack()` calls without re-architecting once the bot token is provisioned.
- **Runbook** at `docs/m11-runbook.md` covering the six topics the brief mandates plus a steady-state cost estimate.

## What ships

### Scheduled task

```ts
// trigger/scheduled-ingest-and-classify.ts
export const scheduledIngestAndClassify = schedules.task({
  id: "scheduled-ingest-and-classify",
  cron: { pattern: "0 8 * * *", timezone: "Europe/London" },
  run: async () => {
    const ingestResult = await ingestSmartleadReplies.triggerAndWait({});
    // ... log + capture summary, continue regardless ...
    const classifyResult = await classifyReplies.triggerAndWait({});
    return { ingest, classify };
  },
});
```

Two small design calls:

1. **`triggerAndWait` chained, not two crons.** Two separate cron entries (ingest at 8:00, classify at 8:05) work clock-wise but introduce a race — if ingest is still running at 8:05 we'd kick off classify mid-write. Chained `triggerAndWait` makes the dependency explicit.
2. **Continue past ingest failure.** If today's Smartlead pull dies, classify can still pick up unclassified threads from earlier days. Logging both results separately means the Trigger.dev dashboard shows two independent failures (or a partial green) rather than one task hiding the other.

### Failure alerting

Trigger.dev has built-in alert wiring per task — configured in the dashboard, not in code. M11 sets up:

- Alert when `ingest-smartlead-replies` fails twice in a row → email Omar
- Alert when `classify-replies` fails twice in a row → email Omar
- Alert when `scheduled-ingest-and-classify` fails twice in a row → email Omar

Two-in-a-row is the brief's threshold. The wrapper task's own alert is the first defence; the inner-task alerts are belt-and-braces.

Slack-channel notifications (planned: a single daily summary post + per-failure pings to `#positive-replies`) are documented in the runbook as a deferred follow-up. Reasoning: setting up the Slack bot token + channel + invite needs Omar to do the workspace config; we shipped the rest of M11 without blocking on that.

### Runbook

`docs/m11-runbook.md` covers the six brief topics:

1. Manually re-run ingest for a single client/campaign
2. Re-classify all replies after a prompt change
3. Remove a published reply
4. Debug a reply showing the wrong sender info
5. Smartlead API outage handling
6. Credential rotation (Smartlead, Supabase, OpenRouter)

Plus a steady-state monthly cost estimate grounded in real backfill numbers and the chosen daily cadence.

## Acceptance against the brief

| Brief requirement | Status | Where |
|---|---|---|
| Schedule M5 ingestion on a cadence | ✅ | `trigger/scheduled-ingest-and-classify.ts`, cron `0 8 * * *` Europe/London |
| Schedule M6 classification shortly after ingestion | ✅ | Chained `triggerAndWait` in the same scheduled task |
| Alert when either task fails twice in a row | ✅ | Trigger.dev built-in alerts, configured per-task in the dashboard |
| Runbook: manual re-run for a client/campaign | ✅ | Section 1 of the runbook |
| Runbook: re-classify after prompt change | ✅ | Section 2 of the runbook |
| Runbook: remove a published reply | ✅ | Section 3 of the runbook |
| Runbook: debug wrong sender info | ✅ | Section 4 of the runbook |
| Runbook: handle a Smartlead outage gracefully | ✅ | Section 5 of the runbook |
| Runbook: rotate credentials | ✅ | Section 6 of the runbook |
| Cost estimate grounded in real numbers | ✅ | "Steady-state cost" section of the runbook |

## Deviations from the brief

- **Cadence: daily at 08:00 London** instead of the brief's suggested "hourly or every six hours." Reasoning (Omar 2026-05-07): steady-state volume is low (single-digit positive replies per day on a typical day), and the wall is a once-a-day-glance asset rather than a real-time feed. Daily 8 AM matches how Omar opens his laptop. Easy to switch to hourly if volume grows — one-line cron change.
- **Alert delivery: Trigger.dev built-in alerts (email)** instead of a custom Slack notification. The brief allows "email, Slack, or Trigger.dev's built-in alerts" — built-in is the cheapest option and satisfies the requirement. The Slack-summary feature Omar wants on top of this is documented in the runbook as a follow-up; it's not in the brief's must-have list.

## Files added

| Path | Role |
|---|---|
| `trigger/scheduled-ingest-and-classify.ts` | The scheduled wrapper. Cron + chained `triggerAndWait` to the existing M5 and M6 tasks. |
| `docs/m11-continuous-operations.md` | This doc — milestone summary. |
| `docs/m11-runbook.md` | Operational playbook + cost estimate. |

No changes to existing tasks. The schedule is purely additive — the M5 and M6 tasks themselves are unchanged.

## Demo path

1. Open the Trigger.dev dashboard. `scheduled-ingest-and-classify` shows up under the project's tasks with the next-run time displayed in 08:00 Europe/London local.
2. Hit "Trigger" on the scheduled task to do an ad-hoc run. The Run page shows two child runs: one for `ingest-smartlead-replies`, one for `classify-replies`. Both complete green; the wrapper's output JSON shows the per-stage summary.
3. To prove failure-alerting: open `ingest-smartlead-replies`, raise inside the task body in a feature branch, deploy, wait for two scheduled runs to fire (or trigger manually twice). The alert fires on the second consecutive failure.
4. Open `docs/m11-runbook.md` and walk through each section — the demo Loom shows enough commands being executed live that an engineer cold-reading the runbook could repeat them.

## What's next (post-M11)

The five-phase build is complete. Follow-up work that surfaced during M11 but is out of scope for the milestone:

- **Slack daily summary** — a `notifySlack` call at the end of the scheduled task posting `<N> new positive replies, <M> high-quality` to `#positive-replies`. Spec'd in the runbook; awaits bot token provisioning by Omar.
- **Cost dashboard pull** — replace the runbook's manually-pasted cost numbers with a small monthly script that queries OpenRouter + Trigger.dev usage APIs.
- **Drop the dormant `prw_threads.highlight_text` column** (M10 left it as audit-trail). Safe to drop once we're confident the multi-highlight schema has been stable for a couple of weeks.
- **Wall improvements driven by visitor analytics** — currently the wall has no tracking; we don't know if the footer CTA converts. Adding a privacy-respecting page-view + CTA-click counter would close the loop on whether the wall actually drives bookings.
