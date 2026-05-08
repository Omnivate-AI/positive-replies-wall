# Positive Replies Wall — Project Report

**Author:** Emmanuel
**Date:** 2026-05-07
**Status:** All 11 milestones delivered. Production live.

---

## 1. What we built

A system that collects positive replies from Smartlead, classifies them with AI, and displays the high-quality ones on a public wall — with admin tools to redact sensitive information and curate what visitors see.

---

## 2. Key learnings — and what we should do differently

These are the lessons that cost real time on this project and would save real time on the next one.

### 2.1 Run the full test suite before declaring a milestone done

The unit, integration, and smoke tests ran on every change, but the e2e suite was rarely invoked. When we finally ran it during M11, it surfaced a stale assertion that had been broken since migration 004. The bug had been latent for ~2 milestones.

**What to do differently:** make `npm test` (all four suites) the gating check before signing off a milestone, not just before deploying.

### 2.2 Hydration mismatches lurk in any locale-dependent code

`Date.toLocaleString()` formats in the runtime's local timezone. Server renders in UTC, client renders in the visitor's local TZ, the strings differ, React throws #418, the admin dashboard crashes. Same trap with `Date.now()` for relative times.

**What to do differently:** treat any `Date`-based output rendered both server- and client-side as a hydration risk. Format with an explicit `timeZone: "UTC"` so both sides agree, or gate the value to client-only rendering with `useSyncExternalStore`.

### 2.3 Check infra access before scoping a feature

We tried to land magic-link auth on `/admin` per the M10 brief. It needed Supabase SMTP + redirect-URL configuration that Omar didn't have access to on the shared project. We pulled auth out entirely rather than block the milestone — but only after days of work.

**What to do differently:** for any feature that depends on infra config (auth providers, DNS, env vars on someone else's project, email senders), do a 5-minute "can the people who need to flip this switch actually flip it?" check at the start of the milestone, not in the middle.

### 2.4 Vercel runtime logs are the first stop for prod 500s

The redact + highlight 500 errors had a 2-line root cause (`SUPABASE_SERVICE_ROLE_KEY` missing from Vercel env). Vercel's MCP runtime-log query surfaced it in 30 seconds. Without that, we'd have been guessing at network/CORS/code issues.

**What to do differently:** when a prod endpoint 500s, query Vercel runtime logs first, before reading the code. The log message is almost always the answer.

### 2.5 Don't rely on setState callbacks for sequential reads

Several optimistic UI handlers (`removeRedaction`, `removeHighlight`, `togglePublished`) read closure variables they expected to be set inside `setState((prev) => …)`. Under React 19's concurrent mode, those callbacks aren't guaranteed to have run by the next line of code. The handlers no-opped without ever calling the API.

**What to do differently:** read state via the parent closure (`threads.find(...)`) before calling the optimistic update — never rely on side effects inside setState updaters to populate variables you read on the next line.

### 2.6 Wrap each stage of a chained Trigger.dev flow in its own try/catch

The wrapper task crashed silently between stages on Omar's first dashboard test: ingest succeeded but classify never fired. An unsafe `.output.threadsInserted` access threw when `output` was undefined, taking the wrapper down before reaching classify.

**What to do differently:** in any chained `triggerAndWait` flow, wrap each stage in an independent `try/catch` with optional chaining on every `.output` access. Each stage must be able to fail without preventing the next from running.

---

## 3. Plan for next week

The brief is delivered. Next week turns "shipped" into "operational." Sequenced by impact-per-effort.

### 3.1 Slack notifications — ~1 hour

Daily summary message to `#positive-replies` ("📬 4 new positive replies, 2 high-quality") and per-stage failure alerts. The runbook already documents the design; it just needs the bot token + channel.

- **Omar:** create the channel, invite the existing outbound bot.
- **Me:** add the env vars to Trigger.dev, copy the outbound repo's `slack-notify.ts` shape, wire summary + alerts into the wrapper task.

### 3.2 Configure Trigger.dev failure alerts — 15 minutes (Omar)

Trigger.dev dashboard → for each of the three task IDs, alert on 2 consecutive failures → email Omar. Backstop to the Slack alerts above.

### 3.3 Fix the missing inbound `subject` — ~1 hour

Diagnostic from M11: 252 of 253 inbound qualifying messages have `subject = null`. The wall has been silently omitting subjects on every card since launch. Investigate whether Smartlead's `email_history` API surfaces inbound subject; if yes, fix the mapper. If no, fall back to the first outbound subject prefixed with `Re: `.

### 3.4 Visitor analytics — ~2 hours

The wall is live but we have zero signal on whether visitors click the CTA. Add Vercel Analytics + a custom event on the "Book a call" CTA, and include click count in the daily Slack summary. Closes the loop on whether the wall actually drives bookings.

### 3.5 Drop the dormant `prw_threads.highlight_text` column — ~30 minutes

Migration 005. Unused since migration 004; the e2e test already broke once on it. Audit-trail value is low — `prw_highlights` source attribution is a strict superset.

### 3.6 (Stretch) "What we said that earned the reply" — admin-only thread context view

`prw_messages` already stores every outbound step + inbound reply; no UI surfaces them. A timeline view in the admin pane would let Omar see the SDR sequence that earned each positive reply and start to learn what works. Not in the brief — pure value-add. ~4–6 hours.

---

## 4. Where things live

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
