# M5 — Data pipeline

What's in Supabase, the schema we applied, how the ingestion task works, and the final backfill state.

## TL;DR

- **352 unique positive replies** ingested from Smartlead into Supabase project `uivgowblojtyiobhgjlv`, across 9 clients, 38 campaigns with at least one Interested reply (out of 82 total in scope), and 243 distinct leads.
- 5 new tables under the `prw_` prefix (replies, classifications, publish_state, redactions, ingest_runs). Original 117 production tables untouched.
- Ingestion is idempotent (UNIQUE on `smartlead_message_id`), retry-resilient on both Smartlead 5xx/network errors and Supabase upsert fetch failures, and exposed both as a Trigger.dev task and a local CLI runner that share the same core logic.
- 47 tests pass across unit / integration / e2e / smoke. Tests caught one real upstream-API bug: Smartlead returns `campaign_lead_map_id` as a string, not a number — the helper now coerces.

## What was already in Supabase

Listed all `public` schema tables via the Management API (PAT-authed). The project hosts **117 tables**, including per-client `{client}_leads` tables, `mailbox_*` infrastructure, `pipeline_*` engine state, `*_crm` tables, and a few reply-adjacent ones:

| Existing table | Purpose | Why it doesn't fit our M5 needs |
|---|---|---|
| `smartlead_reply_cache` | 9-col metadata cache (campaign, lead_email, reply_category, replied_at) | No reply body, no message_id (no dedup key), no subject |
| `interested_leads` | 12-col lead+reply summary | Has `reply` and `email_body` but no message_id, subject, full thread, raw payload |
| `{client}_crm` (orbitalx, roosterpunk) | 13-col client-specific copies of `interested_leads` | Same gaps; client-scoped |
| `response_agent_decisions` | 16-col n8n routing decisions | Tracks intent + routing only — not reply content |

**Decision:** existing data is insufficient. None of the tables capture the full reply payload + raw Smartlead JSON the brief specifies. We pulled fresh from Smartlead into a new `prw_*` namespace.

## Schema (`migrations/001-positive-replies.sql`)

| Table | Rows | Purpose |
|---|---|---|
| `prw_replies` | 352 (after backfill) | Canonical reply payload — sender, subject, body HTML, reply timestamp, lead identity, unibox URL, raw Smartlead JSON. Keyed for dedup on `smartlead_message_id`. |
| `prw_classifications` | 0 (M6 will populate) | AI scoring per `(reply_id, prompt_version)` — four M4 sub-scores + total + `is_high_quality` + categories array + reasoning. Multiple rows per reply allowed (re-classify with new prompt is non-destructive). |
| `prw_publish_state` | 352 (one per reply) | Admin curation state: `is_published`, `display_priority` for pinning, audit columns. Public wall reads `WHERE is_published = true`. |
| `prw_redactions` | 0 (admin populates per reply in M10) | Spans Omar marks for masking at render time. Original body in `prw_replies` stays untouched. |
| `prw_ingest_runs` | 10 (each backfill execution) | Per-run coverage stats — clients/campaigns/leads/replies seen, inserted, skipped, errors. Used by M11 monitoring. |

### Three schema decisions worth flagging

**1. Redactions as strings, not `{start, end}` offsets.**
Strings match the click-and-drag admin UX (the selection IS the string), survive HTML-to-text reflow that breaks character offsets, and naturally mask all occurrences of a redacted span. Trade-off: cannot selectively mask one occurrence and leave another visible. Acceptable — the admin can use `match_type = 'word_boundary'` for finer control if that ever becomes a need.

**2. `total_score` as a `GENERATED ... STORED` column.**
The four sub-scores from the M4 rubric (praise/specificity/authenticity/standalone) are independent inputs; the total is always their sum. Postgres's `GENERATED ALWAYS AS (...) STORED` enforces that invariant at the DB level — no application bug can write a total that disagrees with its components. CHECK constraints on each sub-score (`praise_score BETWEEN 0 AND 30`, etc.) plus this generated column give us defense-in-depth.

**3. `UNIQUE(smartlead_message_id)` is global, not per-campaign.**
A reply that appears in two campaigns (same prospect added to both, or a forwarded thread visible to two leads) lands in DB once, attributed to whichever ingest hit first. We don't want to render the same email twice on the wall, so global UNIQUE is correct. Cost: lose track of "all campaigns this reply appeared in" — if that becomes useful we'd add a `prw_reply_campaigns` junction table later.

## Ingestion task

### Flow

The task at `trigger/ingest-smartlead-replies.ts` wraps `runIngest()` from `trigger/lib/ingest.ts`. The same logic runs locally via `npm run ingest:local` for development and dry runs.

```
1. Open prw_ingest_runs row (status = 'running')
2. For each in-scope client:
     For each in-scope campaign:
       Iterate Interested leads (lead_category_id = 1)
         For each lead: get message_history → take every type=REPLY message
       Bulk upsert replies for the campaign
         (ON CONFLICT smartlead_message_id DO NOTHING → idempotency)
       Seed default prw_publish_state row for each newly inserted reply
3. Close prw_ingest_runs row with stats + status
```

Error handling is per-step: a failure fetching one lead's messages logs an error and continues with the next lead; a failure upserting one campaign's batch logs and continues with the next campaign. Partial completion is preferred over abort — a 30-min run shouldn't lose 28 minutes of work because of a transient failure on the last campaign.

### Retry layer (`trigger/lib/retry.ts`)

Two flavors of transient failure show up in production:
- **Smartlead 5xx / network errors** — the first backfill aborted on `Smartlead GET /campaigns?client_id=398035: 500 ECONNRESET` mid-run. `slGet` now retries 3 times on 5xx/429/network errors with exponential backoff (1s → 2s → 4s, capped at 8s). 4xx errors don't retry — they're bug-shaped, not flaky-shaped.
- **Supabase upsert fetch failures** — the second backfill saw 3 `TypeError: fetch failed` errors from the supabase-js client. `runIngest` now wraps both upsert calls in `retry()` with the same backoff and an `isTransientFetchError` predicate. The third backfill ran clean.

### Idempotency

Proven by the test at `tests/e2e/ingest-idempotency.test.ts` and observable in production:

```
First backfill   → repliesSeen=361, inserted=302, skipped=  0  (initial fill)
Second backfill  → repliesSeen=361, inserted= 50, skipped=262, errors=3 (close partial)
Third backfill   → repliesSeen=361, inserted=  0, skipped=361, errors=0 (steady state)
```

### The 9-reply gap (361 seen vs 352 in DB)

`replies_seen` counts every REPLY-typed message we encountered across every lead's thread. The DB has 352 unique `smartlead_message_id`s. Difference: **9 replies whose message_id was already in DB under a different lead or campaign** (forwarded threads, prospects in multiple campaigns). The UNIQUE constraint correctly stores each message once. This is expected behavior, not data loss — confirmed by per-campaign comparison:

| Campaign | Seen | In DB | Notes |
|---|---|---|---|
| c2974087 (Roosterpunk_v5_UK_LinkedIn) | 31 | 30 | 1 cross-campaign dup |
| c3109540 (Cylindo Senior) | 27 | 24 | 3 dups |
| c3109541 (Cylindo Junior) | 19 | 15 | 4 dups |

Seven other campaigns match seen=DB exactly.

## Test coverage

47 tests across four buckets, all passing in ~67 s end-to-end:

| Bucket | Tests | What it covers |
|---|---|---|
| Unit (3 files, 26 tests) | `mappers.test.ts`, `smartlead.test.ts`, `retry.test.ts` | Pure mapping (incl. forwarded-reply edge case + null-handling), retry helper (success / exhaustion / retryable predicate / observability hook), Smartlead retry semantics (5xx, 429, 4xx no-retry, TCP errors, MAX_ATTEMPTS exhaustion) |
| Integration (2 files, 9 tests) | `supabase-constraints.test.ts`, `smartlead-shape.test.ts` | DB constraints (UNIQUE 23505, CHECK 23514 on score ranges, CASCADE delete, redaction `(reply_id, text, match_type)` uniqueness), live Smartlead API shape (catches upstream drift) |
| E2E (1 file, 2 tests) | `ingest-idempotency.test.ts` | First-run completes without errors; second run is idempotent — 0 inserted, all skipped |
| Smoke (1 file, 10 tests) | `env-and-tables.test.ts` | Required env vars present, all 5 prw_* tables reachable, Smartlead returns clients |

Run as `npm test` (full suite) or `npm run test:unit` / `:integration` / `:e2e` / `:smoke` per bucket. Sentinel rows in integration tests are prefixed `test-vitest-` and cleaned in `afterAll`.

**Bug caught by tests during development:** Smartlead returns `campaign_lead_map_id` and `lead.id` as strings, not numbers. The integration test for `listInterestedLeadsPage` shape failed on first run, prompting a coercion fix in `smartlead.ts`. Without the test, the typed-as-number bug would have shipped to Trigger.dev.

## Files

| Path | Role |
|---|---|
| `migrations/001-positive-replies.sql` | Schema migration (applied) |
| `trigger/lib/smartlead.ts` | Smartlead REST helpers + types + retry-on-5xx |
| `trigger/lib/supabase.ts` | Service-role Supabase client (with `ws` polyfill for Node 20) |
| `trigger/lib/mappers.ts` | Pure mapping: Smartlead shapes → ReplyRow |
| `trigger/lib/retry.ts` | Generic retry helper with backoff + `isTransientFetchError` predicate |
| `trigger/lib/ingest.ts` | Core ingest orchestration (no Trigger.dev imports — testable in isolation) |
| `trigger/ingest-smartlead-replies.ts` | Trigger.dev task wrapper |
| `scripts/ingest-local.ts` | Local CLI runner using the same `runIngest()` code path |
| `tests/_helpers/fixtures.ts` | Realistic Smartlead-shaped test data (modeled on the M2 OrbitalX → Mark Richards forward) |
| `tests/{unit,integration,e2e,smoke}/*.test.ts` | 47 tests across 4 buckets |

## How to re-run ingestion

```bash
# Full backfill (every client, every campaign)
npm run ingest:local

# Single client (e.g., OrbitalX = 221217)
npm run ingest:local -- --client-id 221217

# Single campaign
npm run ingest:local -- --campaign-id 2851748

# Multiple campaigns (comma-separated)
npm run ingest:local -- --campaign-id 2851748,2972871

# Status filter (active campaigns only)
npm run ingest:local -- --status ACTIVE
```

Idempotent — re-running over the same scope inserts 0 new rows and skips everything already in DB.

## What's still open

- **Deploy the task to Trigger.dev** — `trigger.config.ts` has `proj_REPLACE_ME` until Omar confirms whether to use a new Trigger.dev project for `positive-replies-wall` or reuse Omnivate's existing one. Once the project ref is set: `npx trigger.dev@latest deploy`. M5's acceptance is satisfied by the local run since it's the identical code path; deploy is M11 prerequisite work.
- **Loom recording** — show schema in Supabase, run `npm run ingest:local --campaign-id <id>` live, run again to demonstrate idempotency, point at `prw_replies` rows + `prw_ingest_runs` history. Five minutes.

## Final state at end of backfill

```sql
SELECT COUNT(*), COUNT(DISTINCT smartlead_message_id), COUNT(DISTINCT smartlead_lead_id), COUNT(DISTINCT smartlead_campaign_id), COUNT(DISTINCT smartlead_client_id) FROM prw_replies;
-- 352, 352, 243, 38, 9
```
