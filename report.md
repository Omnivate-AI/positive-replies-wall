# Positive Replies Wall — Project Report

**Author:** Emmanuel
**Date:** 2026-05-07
**Status:** Brief delivered through M11 (all 11 mini-projects). Production live.

---

## 1. What we built

Working backwards from the live URLs:

- **Public wall** — https://positive-repies-wall.vercel.app — server-rendered, ISR=60. Hero + masonry of brand-purple-highlighted email cards with name/company black-bar redactions, paginated 8-at-a-time, footer CTA to the Motion booking link.
- **Admin dashboard** — `/admin` — three-pane triage tool. Filter the inbound queue, preview each reply as it'll appear publicly, mark redactions and highlights via a click-and-drag floating toolbar, toggle publish state, pin to top via priority.
- **Daily auto-pipeline** — `scheduled-ingest-and-classify` task on Trigger.dev, runs at 08:00 Europe/London. Pulls new positive replies from Smartlead → writes to Supabase as threads + messages → AI-classifies any that aren't yet scored at the latest prompt version. Both stages independent (one failing doesn't block the other).
- **Operational runbook** — `docs/m11-runbook.md` — six topic areas the brief mandates (manual re-run, re-classify, remove a reply, debug sender, Smartlead outage, credential rotation) plus a steady-state cost estimate of **<$1/month** at current volume.

By the numbers:

| Surface | Number |
|---|---|
| Total threads ingested | 253 |
| Messages stored (outbound + inbound) | 994 |
| HQ-classified at v2.0 | 48 |
| Currently published on the wall | 5 |
| Tests passing | 138 (107 unit + 12 smoke + 15 integration + 4 e2e) |
| Total OpenRouter spend on the project | ~$0.25 |
| Lines of TypeScript shipped | ~6,000 |
| Migrations applied | 4 (initial, then v2.0 thread restructure, then multi-highlight) |

Behind the scenes, the architectural moves that made it all possible:

1. **Two Supabase clients, two keys.** `lib/supabase-public.ts` (anon, read-only on Vercel) and `lib/supabase-admin.ts` (service-role, writes from `/api/admin/*`). The Trigger.dev path has its own service-role client. Three distinct purposes, three keys, never crossed.
2. **Thread + messages schema (migration 003).** The original M5 brief stored one row per inbound reply. Mid-M9 we restructured into `prw_threads` + `prw_messages` so we have both directions of every conversation — enables the "what did we say that earned the reply?" study later.
3. **Multi-highlight schema (migration 004).** Started with a single `highlight_text` column on the thread; M10 moved to a parallel `prw_highlights` table mirroring `prw_redactions`. Multiple highlights per card are now first-class.
4. **Defense-in-depth redaction.** `from_display_name`, `from_email`, `to_email`, and the SDR allowlist are added to the mask set at render time even if `prw_redactions` doesn't have them. The wall can never accidentally leak a sender identity.
5. **Highlight matching with fallbacks.** Verbatim → case-insensitive → longest sentence-fragment overlap. Handles classifier paraphrasing without breaking the wall.

Every milestone has its own doc in `docs/m1-…` through `docs/m11-…`. The M9, M10, M11 docs note where we deviated from the brief and why (auth removal, sort order changes, schema additions).

---

## 2. Key learnings — and what we should do differently

These are the lessons that cost real time on this project and would save real time on the next one.

### 2.1 **Run all four test suites, every time.**

This is the biggest one. The unit/integration/smoke suites ran on every change, but the e2e suite was rarely invoked. When we finally ran it during M11, it surfaced a stale assertion that had been broken since migration 004 (it checked `prw_threads.highlight_text`, which became dormant when we moved highlights into the parallel table). The bug had been latent for ~2 milestones.

**What to do differently:** make the full test command (`npm test` — runs all four) the gating check before declaring a milestone done. Faster suites (unit, smoke) on every save; integration + e2e at least once per PR. The M11 runbook now includes this as part of the "definition of done" for each milestone.

### 2.2 **Hydration mismatches lurk in any locale-dependent code.**

`Date.toLocaleString()` formats in the runtime's local timezone. Server renders in UTC. Client renders in the visitor's local TZ. The strings differ → React throws #418 → admin dashboard crashes. Same trap with `Date.now()` for relative times.

**What to do differently:** treat any `Date`-based output that's rendered both server- and client-side as a hydration risk. Fixes in order of preference:
1. `useSyncExternalStore` to gate client-only values cleanly (no setState in effect).
2. `suppressHydrationWarning` on the leaf element when the cosmetic mismatch is acceptable.
3. Format with an explicit `timeZone: "UTC"` so server and client agree.

### 2.3 **Postgrest 1:1 vs 1:N embed shapes are a silent footgun.**

When you embed a relation in a `select(...)`, Postgrest returns an array for 1:N (FK → non-PK) and a single object for 1:1 (FK → PK). We had `prw_publish_state.thread_id` as a PK, so it came back as an object — but our code did `r.publish_state[0]?.is_published`, which on an object returns `undefined`, falling silently to `false`. Publish toggles appeared to do nothing.

**What to do differently:** when adding any embedded relation, immediately consult the schema and use the right access shape. Add a Zod parse step on the result so the wrong shape throws loudly instead of silently.

### 2.4 **React 19 setState reducers are not guaranteed synchronous.**

Several optimistic UI handlers (`removeRedaction`, `removeHighlight`, `togglePublished`, `setPriority`) read closure variables that they expected to be set inside the `setState((prev) => …)` callback. Under React 19's concurrent mode, those callbacks are NOT guaranteed to have run by the time the next line of code executes. The handlers no-opped without ever calling the API.

**What to do differently:** never rely on side effects inside setState updaters to populate variables you read on the next line. Read state via the parent closure (`threads.find(...)`) before calling the optimistic update.

### 2.5 **Trigger.dev `triggerAndWait` result accessors can throw.**

The wrapper task crashed silently between stages on Omar's first dashboard test: ingest succeeded but classify never fired. Root cause: an unsafe `ingestResult.output.threadsInserted` access that threw if `output` was undefined for any reason, taking the wrapper down with it before reaching classify.

**What to do differently:** wrap each stage of any chained `triggerAndWait` flow in an independent `try/catch` block, with optional chaining on every `.output` access. Each stage must be able to fail without preventing the next stage from running.

### 2.6 **Check infra access before scoping auth.**

We tried to land magic-link auth on `/admin` per the M10 brief. It needed Supabase SMTP + redirect-URL configuration that Omar didn't have access to on the shared project. We pulled auth out entirely rather than block the milestone. Days of work spent before discovering the access constraint.

**What to do differently:** for any feature that depends on infra config (auth providers, DNS, env vars on someone else's project, email senders), do a 5-minute "can the people who need to flip this switch actually flip it?" check at the start of the milestone, not in the middle.

### 2.7 **Vercel runtime logs are the first stop for prod 500s.**

The redact + highlight 500 errors had a 2-line root cause (`SUPABASE_SERVICE_ROLE_KEY` missing from Vercel env). Surfaced it in 30 seconds via Vercel's MCP runtime-log query. Without that, we'd have been guessing at network/CORS/code issues.

**What to do differently:** when a prod endpoint 500s, query Vercel runtime logs first, before reading the code. The log message is almost always the answer.

### 2.8 **Cost estimates without arithmetic are guesses.**

The first cost section in the runbook was hand-waved. The second version (after Omar pushed back) computed the actual prompt size in bytes, mapped to OpenRouter pricing, and produced numbers grounded in the real workload — which turned out to be **~$0.05/month steady-state, $0.43 at 10× volume.** Everything else is on free tiers indefinitely.

**What to do differently:** when the brief asks for a cost estimate, compute it. Don't write "approximately a few dollars" when 5 minutes of arithmetic gives an order of magnitude.

---

## 3. Plan for next week

The brief is delivered. Next week is the pass that turns "shipped" into "operational." Sequenced by impact-per-effort.

### 3.1 Slack connection (M11 deferred follow-up) — **~1 hour**

The runbook already documents the design; it just needs the bot token + channel.

- **You:** create `#positive-replies` channel in the Omnivate Slack workspace, invite the existing outbound bot (same `SLACK_BOT_TOKEN` that runs in the outbound repo). 30 seconds in Slack.
- **Me:** add `SLACK_BOT_TOKEN` and `WALL_BASE_URL` to Trigger.dev project env. Copy outbound's `lib/slack-notify.ts` shape into ours. Edit `scheduled-ingest-and-classify` to post one summary message at the end of the run (`📬 Daily run: 4 new positive replies, 2 high-quality. View admin: <url>`) and one alert message per stage failure (`🚨 Pipeline failure: <stage>. Run: <trigger.dev URL>. First-check: <hint>`).
- **Smoke test:** trigger the wrapper from CLI and confirm the summary lands in the channel. Force a failure once and confirm the alert lands.

### 3.2 Configure Trigger.dev failure alerts — **15 minutes (you)**

Trigger.dev dashboard → for each of the three task IDs (`scheduled-ingest-and-classify`, `ingest-smartlead-replies`, `classify-replies`), set: alert on 2 consecutive failures → email Omar. Backstop to the in-task Slack alerts above.

### 3.3 Fix the missing inbound `subject` — **~1 hour**

Diagnostic from M11: 252 of 253 inbound qualifying messages have `subject = null`. Outbound subjects are populated. The wall has been silently omitting subjects on every card since launch (visible if you click into one — the From line shows but the subject `<h3>` doesn't render at all).

- Investigate whether Smartlead's `email_history` API actually surfaces inbound subject (most email-thread APIs do — usually `Re: <original>`).
- If yes: fix the mapper in `trigger/lib/mappers.ts` to extract it.
- If no: fall back to the first outbound subject prefixed with `Re: ` when inbound subject is null.
- Re-ingest one campaign as a smoke test, confirm subjects populate.

### 3.4 Visitor analytics — **~2 hours**

The wall is live but we have zero signal on whether visitors click the CTA. Add a privacy-respecting counter:

- Vercel Analytics (`@vercel/analytics`) — free tier, GDPR-OK, tracks page views.
- Custom event on the footer "Book a call" CTA so we can compute click-through rate.
- Daily summary in Slack: include CTA click count alongside the new-replies count.

This closes the loop on whether the wall actually drives bookings — the entire business case for the project.

### 3.5 Drop the dormant `prw_threads.highlight_text` column — **~30 minutes**

Migration 005. The column has been unused since migration 004; keeping it is a footgun (the e2e test already broke once on it). Audit-trail value is low — `prw_highlights` source attribution is a strict superset.

### 3.6 Verify OpenRouter pricing for `xiaomi/mimo-v2-flash` — **~5 minutes**

I estimated $0.10/$0.30 per 1M in/out tokens (small-flash midpoint) for the runbook. Verify against the live OpenRouter model page; if materially different, update `docs/m11-runbook.md`. The order-of-magnitude conclusion ("<$1/month worst case") will not change.

### 3.7 M11 Loom — **~10 minutes (you)**

Per the brief, every milestone ends with a Loom. M11's needs to show:
- The schedule live in the Trigger.dev dashboard
- A forced-failure alert reaching you
- A walk-through of `docs/m11-runbook.md`

After the Slack work in 3.1, the Loom can show the daily summary message landing in `#positive-replies` too, which is more compelling than email-only alerts.

### 3.8 (Stretch) "What we said that earned the reply" — admin-only thread context view

This is the unfulfilled half of the M9 schema restructure: `prw_messages` stores every outbound step + inbound reply, but no UI surfaces them. A timeline view in the admin pane would let you see the SDR sequence that earned each positive reply and start to learn what works. Not in the brief — pure value-add. ~4–6 hours.

---

## 4. Where things live (quick reference)

| What | Where |
|---|---|
| Public wall | https://positive-repies-wall.vercel.app/ |
| Admin | https://positive-repies-wall.vercel.app/admin |
| GitHub repo | https://github.com/Omnivate-AI/positive-replies-wall |
| Trigger.dev project | `proj_vdhufffmwghsuhddbqrd` (shared with outbound) |
| Supabase project | `uivgowblojtyiobhgjlv` |
| Vercel project | `prj_jpsjbjd8GKNJcEr6xAVhqEV1AZ9d` |
| Milestone docs | `docs/m1-…` through `docs/m11-…` |
| Operations runbook | `docs/m11-runbook.md` |

The brief said five phases, eleven mini-projects, one engineer, end-to-end. All eleven have shipped.
