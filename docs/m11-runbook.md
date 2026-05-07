# M11 — Operations runbook

Operational playbook for the positive-replies-wall pipeline. Written for an engineer (or Omar) cold-reading this six months from now.

## Quick reference

| Action | How |
|---|---|
| Force a daily run now | Trigger.dev dashboard → `scheduled-ingest-and-classify` → **Trigger** |
| Re-run ingest for one client | Trigger.dev dashboard → `ingest-smartlead-replies` → **Trigger** with `{ "clientIds": [221217] }` |
| Re-run ingest for one campaign | `{ "campaignIds": [2851748] }` |
| Re-classify everything | Bump `PROMPT_VERSION` in `trigger/lib/classify.ts`, deploy, trigger `classify-replies` |
| Unpublish a reply | `/admin` → click the thread → Publish toggle (the green "Unpublish" pill) |
| Hard-remove a reply | SQL — see [Remove a published reply](#3-remove-a-published-reply) |
| Inspect a single thread end-to-end | Supabase → `prw_threads` + joined `prw_messages`, `prw_classifications`, `prw_redactions`, `prw_highlights`, `prw_publish_state` |
| Local ingest (debugging) | `npm run ingest:local -- --client-id <id>` |
| Local classify (debugging) | `npm run classify:local` |

## Schedule

The wrapper task `scheduled-ingest-and-classify` runs **daily at 08:00 Europe/London** (BST/GMT switchover handled automatically by Trigger.dev's `timezone` field). It fires the existing `ingest-smartlead-replies` task, then `classify-replies`. Both child runs are visible in the dashboard alongside the parent.

The cadence is tunable in `trigger/scheduled-ingest-and-classify.ts`:

```ts
cron: { pattern: "0 8 * * *", timezone: "Europe/London" }
```

Patterns we'd realistically swap to:

| Use case | Cron |
|---|---|
| Twice daily (8 AM + 4 PM London) | `"0 8,16 * * *"` |
| Hourly during work hours | `"0 9-18 * * *"` |
| Every 6 hours | `"0 */6 * * *"` |

Edit and re-deploy with `npm run trigger:deploy`.

## Failure alerts

Configured in the Trigger.dev dashboard, not in code. For each of the three task IDs:

- `scheduled-ingest-and-classify`
- `ingest-smartlead-replies`
- `classify-replies`

Set: **alert on 2 consecutive failures → email** (Omar's email). The wrapper's alert is the first defence; the inner-task alerts are the safety net for partial failures (e.g. ingest succeeds but classify dies).

A Slack-summary feature on top of these alerts is **deferred** — see [Slack notifications — deferred](#slack-notifications--deferred).

---

## 1. Manually re-run ingest for a client/campaign

**From the Trigger.dev dashboard (preferred):**

Open `ingest-smartlead-replies` → **Trigger** → paste payload:

```json
{ "clientIds": [221217] }
```

Or for a single campaign:

```json
{ "campaignIds": [2851748] }
```

Or for a campaign status filter:

```json
{ "campaignStatuses": ["ACTIVE"] }
```

Empty payload `{}` runs the full sweep across all clients/campaigns (same as the daily schedule does).

**Locally (when debugging Smartlead pagination or auth):**

```bash
npm run ingest:local -- --client-id 221217
npm run ingest:local -- --campaign-id 2851748
npm run ingest:local -- --status ACTIVE,COMPLETED
npm run ingest:local                                # full sweep
```

Local writes to the same Supabase project as the deployed task — there is no separate dev DB. Be aware that a local run during business hours competes with the scheduled run for Smartlead rate-limit budget.

## 2. Re-classify all replies after a prompt change

The classifier is keyed on `(thread_id, prompt_version)` UNIQUE. Bumping the version is what triggers re-classification — running the same version twice is a no-op.

**Procedure:**

1. Edit the prompt at `trigger/prompts/classify-reply.md`.
2. Bump the version constant at `trigger/lib/classify.ts:37`:
   ```ts
   export const PROMPT_VERSION = "v2.1";  // was "v2.0"
   ```
3. Deploy: `npm run trigger:deploy`.
4. Trigger `classify-replies` from the dashboard with `{}` (empty payload runs all unclassified-at-current-version threads).

**What's preserved across versions:**

- All earlier classification rows stay queryable (UNIQUE on `(thread_id, prompt_version)`, not just `thread_id`). You can diff `v2.0` vs `v2.1` results in SQL.
- `prw_highlights.source = 'auto_classifier'` is keyed on the *text*, not the version, so re-classifying may insert new auto-highlights (idempotent on `(thread_id, text)` — same phrase doesn't duplicate).
- Admin highlights/redactions are completely untouched.
- The wall reads the **latest** prompt version (server picks `MAX(prompt_version)` at query time).

**Rollback:** if `v2.1` is worse, set `PROMPT_VERSION` back to `v2.0` and redeploy. The wall flips back instantly. The `v2.1` rows stay in the DB for analysis; they don't get rendered until you bump the version forward again.

## 3. Remove a published reply

**Soft path (preferred — keeps the data, just hides it):**

`/admin` → click the thread → click the green "Unpublish" pill in the top-right of the preview pane. The wall reflects the change within ~1 minute (ISR=60) or immediately on the next admin-triggered revalidate.

**Hard delete (when the data should never have been ingested in the first place):**

```sql
-- Inspect first
SELECT t.id, t.lead_email, t.lead_first_name, t.lead_last_name,
       c.total_score, c.is_high_quality, ps.is_published
FROM prw_threads t
LEFT JOIN prw_classifications c ON c.thread_id = t.id
LEFT JOIN prw_publish_state ps ON ps.thread_id = t.id
WHERE t.id = <THREAD_ID>;

-- Delete (CASCADE removes all child rows: messages, classifications,
-- redactions, highlights, publish_state)
DELETE FROM prw_threads WHERE id = <THREAD_ID>;
```

⚠️ The next ingest run will re-create the thread if the reply is still in Smartlead. To prevent re-ingestion, either:

- Mark the reply in Smartlead as `lead_category_id = 0` (not interested) so our filter excludes it, or
- Add the lead's `smartlead_lead_id` to a new `prw_lead_blocklist` table (not yet built — open a follow-up if you need this often).

## 4. Debug a reply showing the wrong sender info

Sender info on the public wall comes from three potential sources, in order of authority:

1. **Outbound lead row** (matched at ingest via `linkedin_url` OR `email`). Sets `lead_first_name`, `lead_last_name`, `lead_title`, `company_name` on `prw_threads`.
2. **Smartlead lead JSON** (raw payload, denormalized at ingest). Fallback when outbound match fails.
3. **Per-message `from_name` / `from_email`** on `prw_messages`. The qualifying inbound row's `from_email` is what gets redacted on the wall.

**Diagnostic walk:**

```sql
-- 1. What did ingest persist on the thread itself?
SELECT id, lead_table, lead_id,
       lead_first_name, lead_last_name, lead_email,
       lead_title, company_name, lead_linkedin_url
FROM prw_threads
WHERE id = <THREAD_ID>;

-- 2. What does the qualifying inbound message say?
SELECT smartlead_message_id, direction, from_name, from_email,
       to_email, subject, sent_at
FROM prw_messages
WHERE thread_id = <THREAD_ID> AND is_qualifying_reply = true;

-- 3. What does the raw Smartlead JSON show?
SELECT raw_smartlead_json->>'from_name' AS sl_from_name,
       raw_smartlead_json->>'from_email' AS sl_from_email,
       raw_smartlead_json->'lead'->>'first_name' AS sl_lead_first,
       raw_smartlead_json->'lead'->>'last_name' AS sl_lead_last,
       raw_smartlead_json->'lead'->>'company_name' AS sl_lead_company
FROM prw_messages
WHERE thread_id = <THREAD_ID> AND is_qualifying_reply = true;

-- 4. Did we match to an outbound lead row?
-- (lead_table is e.g. 'pantheon_leads', null when no match)
SELECT lead_table, lead_id FROM prw_threads WHERE id = <THREAD_ID>;
-- If matched, look up the source:
-- SELECT first_name, last_name, company_name FROM <lead_table> WHERE id = <lead_id>;
```

**Decision tree:**

- If thread snapshot is wrong but the raw Smartlead JSON is correct → ingest mapper bug. Fix in `trigger/lib/mappers.ts`.
- If snapshot is wrong and so is Smartlead → the issue is upstream in Smartlead's data; nothing to fix here.
- If outbound match was wrong (`lead_table` matches but the row is for a different person) → fix the match logic in `trigger/lib/lead-lookup.ts` (current keys: linkedin_url OR email).
- If display on the wall is wrong but DB is correct → bug in `EmailReplyCard` rendering or the redaction set. Inspect what's being passed to the component via React DevTools on the live page.

After fixing data, re-trigger ingest scoped to the campaign (`campaignIds: [<id>]`) — it'll re-snapshot the thread with the corrected mapper, and the wall reflects within the next ISR window.

## 5. Smartlead API outage handling

Trigger.dev's default retry policy (set in `trigger.config.ts:14-22`) is **3 attempts with exponential backoff** (1s → 2s → 4s, randomized). Most transient Smartlead 5xxs are absorbed transparently.

**If Smartlead is down for >30 minutes:**

- Today's 08:00 run will fail and the on-failure alert will fire on the second consecutive day if Smartlead doesn't recover.
- The system **skips the day** rather than queuing — the cron simply runs again at 08:00 the next morning.
- Replies that arrived during the outage will still be ingested on the next successful run (ingest is keyed on `smartlead_message_id`, so older messages are picked up automatically).

**Manual recovery once Smartlead is back:**

1. Confirm Smartlead status (their status page or a single MCP call from Claude Code: `smartlead_list_campaigns` should respond).
2. Trigger `scheduled-ingest-and-classify` from the dashboard with `{}`.
3. Confirm the run completes green and check `prw_threads` for the row count delta vs yesterday.

**If Smartlead is partially up** (e.g. campaign endpoint works, message-history endpoint flakes):

- The ingest task will surface partial errors in `IngestStats.errors[]`. Look for a non-empty errors array in the run's output.
- Re-run scoped to the affected campaigns once the flake passes.

## 6. Credential rotation

Each rotation is: **rotate at source → update the env in every consumer → smoke-test**.

The pipeline has three credential surfaces. Trigger.dev project env vars are shared with the outbound repo — rotating them affects both repos.

### Smartlead

1. Smartlead UI → API & Integrations → regenerate `SMARTLEAD_API_KEY`.
2. Update in Trigger.dev: `npx trigger.dev@latest envvars create SMARTLEAD_API_KEY=<new>` or via the dashboard.
3. **Update outbound's local `.env`** (it consumes the same key from Supabase secrets / Vercel env, depending on context).
4. Smoke test: trigger `ingest-smartlead-replies` with `{ "campaignIds": [<small_campaign_id>] }`. Should complete green.

### Supabase (anon + service-role)

1. Supabase Studio → Settings → API → Roll keys.
2. Update **three** consumer surfaces:
   - **Vercel** (positive-replies-wall): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Re-deploy or hit the Vercel "Redeploy" button.
   - **Trigger.dev**: same three env vars (the trigger tasks use service-role for writes).
   - **outbound repo's local `.env`** if anyone runs scripts locally.
3. Smoke test: open the wall (`/`) — if it loads, anon is good. Trigger an admin Publish toggle — if the API route succeeds, service-role is good.

### OpenRouter

1. OpenRouter dashboard → API Keys → revoke + create new.
2. Update Trigger.dev: `OPENROUTER_API_KEY`.
3. Smoke test: trigger `classify-replies` with `{ "limit": 1 }`. Should classify one thread successfully.

After any rotation, watch the next scheduled 08:00 London run land green before considering it complete.

---

## Steady-state cost estimate

**Workload baseline** (post-backfill, 2026-05-07):

- 250 threads ingested across all time
- ~10 new positive replies/week observed steady-state (~520/year projected)
- 1 daily ingest+classify run = 365 wrapper executions/year

**Per-component cost:**

| Component | Volume | Pricing | Monthly cost |
|---|---|---|---|
| Trigger.dev task executions | 1 wrapper + 2 children/day = 90/month | Trigger.dev free tier covers 10k task runs/month | **$0** |
| Trigger.dev compute time | ~5 min/day = 150 min/month | First 5k mins/month free | **$0** |
| OpenRouter (`xiaomi/mimo-v2-flash`) | ~40 classifications/month, ~3k input tokens + 500 output tokens each | Mimo-v2-flash is sub-cent per call | **<$1** |
| Supabase | <100MB storage, low Postgrest read volume | Free tier (500MB, 50k MAU) | **$0** |
| Vercel | ISR + edge bandwidth, low traffic | Free tier (100GB) | **$0** |

**Total steady-state: <$1/month.**

**At 10× volume** (5,200 replies/year, daily wall traffic 10× current):

- Trigger.dev still on free tier
- OpenRouter ~$5/month
- Supabase still on free tier
- Vercel still on free tier
- **Total: ~$5/month**

The pipeline is essentially free until we cross either Trigger.dev's 10k-run threshold (would require ~30 daily runs sustained) or Supabase's 500MB storage cap (would require ~50,000 threads). Neither is a near-term risk.

> **Note:** these numbers are projections grounded in the backfill volume + Trigger.dev free-tier limits as of writing. Before declaring M11 done, paste the actual last-30-days OpenRouter spend from the dashboard into this section to replace the estimate.

---

## Slack notifications — deferred

A daily Slack summary (`<N> new positive replies, <M> high-quality`) plus per-failure pings was scoped during M11 planning but deferred. Setup needs Omar to provision a Slack bot token and create a `#positive-replies` channel.

When ready to wire it up, the implementation is small:

1. Provision a Slack bot in the Omnivate workspace (or reuse outbound's bot identity — same token, same workspace, just invite into the new channel).
2. Add `SLACK_BOT_TOKEN` to Trigger.dev env vars.
3. Add `WALL_BASE_URL=https://positive-repies-wall.vercel.app` to Trigger.dev env vars.
4. Create `trigger/lib/slack-notify.ts` — copy the shape from `outbound/trigger/lib/slack-notify.ts` (best-effort `chat.postMessage`, never throws).
5. Edit `trigger/scheduled-ingest-and-classify.ts`:
   - On success: post one summary line — `📬 Daily run: 4 new positive replies, 2 high-quality. View admin: <WALL_BASE_URL>/admin`
   - On failure: post a one-line alert with task name + error + Trigger.dev run URL.

Estimated work: ~1 hour including the smoke-test.

---

## Where to look when things go wrong

| Symptom | First place to look |
|---|---|
| Wall is blank | `/admin` — does it load? If yes, check the publish state of recent threads. If no, Vercel runtime logs |
| Admin shows fewer threads than expected | `prw_threads` row count in Supabase vs Trigger.dev's last `ingest-smartlead-replies` run output |
| New replies not showing up | Trigger.dev → `scheduled-ingest-and-classify` → did today's 08:00 run go green? Check stage-by-stage output |
| Classification scores look wrong | `prw_classifications` reasoning column — the model's audit trail per row |
| Specific reply showing wrong sender | [Section 4](#4-debug-a-reply-showing-the-wrong-sender-info) |
| Pipeline keeps timing out | `trigger.config.ts` `maxDuration` is 4h — if you're hitting it, the Smartlead pull is slower than expected. Check Smartlead status; consider scoping with `campaignIds` |
| Page super slow | Vercel `Functions` tab — ISR might be miss-revalidating. The wall route's `revalidate` is 60s |
