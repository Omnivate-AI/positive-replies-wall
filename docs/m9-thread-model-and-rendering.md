# M9 — Thread model + email rendering

The wall's first end-to-end render. Three things had to land together for it to make sense:

1. **A schema restructure** so we can study what we *said* that earned the reply, not just what they replied with (migration 003 — `prw_replies` → `prw_threads` + `prw_messages`).
2. **A classifier upgrade** (v1.2 → v2.0) that emits the highlight phrase and a list of third-party names to redact, so the public render needs zero manual decoration.
3. **A rendering layer** on top of M7's `EmailReplyCard` that does excerpt truncation, multi-source redaction, and a quiet purple wash on the killer phrase — driven from real data via a new `/demo` route.

## TL;DR

- New schema: **threads + messages**, both directions of the conversation stored. The wall only needs the inbound qualifying reply, but the internal "what made them reply" view needs every outbound step too. Migration 003 drops the old `prw_replies` shape outright (339 rows discarded — re-ingest from Smartlead is simpler than backfill).
- Classifier **v2.0** outputs `suggested_highlight_text` + `suggested_redactions` (third-party names) on top of the existing rubric. Lead's own name/email/company come from the linked outbound lead row at ingest, not from the classifier.
- New `/demo` route renders the top 10 high-quality threads as `EmailReplyCard`s with the killer phrase wrapped in a quiet purple span and the body excerpted (start → highlight + 80-char tail + ellipsis).
- Render-time redaction is **defense-in-depth**: stored `prw_redactions` rows + SDR first names + recipient SDR mailbox are *all* always added, so the wall can never accidentally leak an SDR or recipient identity even if a row is missing.
- Highlight matching has three fallbacks (verbatim → case-insensitive → longest sentence-fragment) so classifier paraphrasing doesn't break the wall.
- Tests: 107/107 unit, 15/15 integration, 12/12 smoke, 2/2 e2e ingest.

## Why the schema restructure

Up to M8 the data shape was one row per inbound reply (`prw_replies`). That's enough for the public wall — visitors only ever see the highlighted phrase from the inbound message — but it forecloses the question we actually want to answer internally:

> *"What did we say that made them reply this way?"*

Omar called this out on 2026-05-06: the wall is a marketing surface, but the same dataset is also the most direct feedback loop we have on outbound copy. Studying the SDR sequence that earned each positive reply (subject lines, opening, CTA placement, follow-up cadence) only works if the entire conversation is in the database, not just the inbound row.

So migration 003 collapses to:

```
prw_threads (1)        — one row per qualifying conversation
  ├── prw_messages (N) — every email in the thread, both directions
  ├── prw_classifications (1 per prompt_version)
  ├── prw_redactions (N) — black-bar spans (auto + admin)
  └── prw_publish_state (1) — admin curation
```

Two design decisions worth flagging:

**Soft polymorphic lead link.** Outbound's lead tables are sharded per client (`pantheon_leads`, `valda_leads`, …) — there's no single `leads` table to FK into. We store `(lead_table TEXT, lead_id BIGINT)` plus a denormalized name/email/title/company snapshot. The snapshot means a downstream lead delete or rename doesn't take the thread's display data with it. Match key on ingest is `linkedin_url OR email` against the campaign's client `lead_table`.

**Cross-repo FK to `campaign_registry`.** That table lives in the sibling outbound repo but the same Supabase project. `ON DELETE SET NULL` so a campaign cleanup doesn't cascade-delete threads.

**Partial unique index on qualifying replies.** `prw_messages_one_qualifying_per_thread` enforces *at most one* `is_qualifying_reply = true` per thread. This is the row the public wall keys off; treating it as a uniqueness invariant in the DB rather than the application layer means later admin-side flips can't accidentally promote two messages.

## Classifier v2.0

`PROMPT_VERSION` bumped from `v1.2` to `v2.0`. The output schema gained two fields:

- `suggested_highlight_text` — the phrase the AI thinks is the killer line. The wall renders this with a quiet purple wash; the admin can override it in M10.
- `suggested_redactions[]` — third-party names mentioned in the reply ("we already use Pantheon for that"). Lead's own name and company are *not* asked for — they come from the linked outbound lead row at ingest, which is more reliable than asking the model to extract its own author's name.

Redactions get seeded in two phases:

| Phase | Source | What's added |
|---|---|---|
| Ingest | `auto_lead` | Lead first_name, last_name, company_name, email — pulled from the matched outbound lead row |
| Classify | `auto_classifier` | Third-party names from `suggested_redactions` |
| Admin | `admin` | Anything Omar adds in the M10 dashboard |

Each row has a `source` enum so the M10 UI can offer delete-only-on-admin and the auto rows regenerate cleanly on each ingest/classify pass.

## The /demo route

`/demo` is the rehearsal stage for the public wall. Server-rendered, queries `getWallThreads(limit=10)`, renders a CSS-columns masonry grid of `EmailReplyCard`s.

```
Browser
  └─> /demo (Server Component)
        └─> getWallThreads()
              ├─> prw_classifications WHERE is_high_quality, ORDER BY total_score DESC LIMIT 10
              ├─> prw_threads (linked via classifications.thread_id)
              ├─> prw_messages WHERE is_qualifying_reply (subject, sent_at, to_email)
              ├─> prw_redactions (per thread)
              └─> prw_highlights (per thread — added in M10, but the join is
                                  reused: in M9 the highlight comes from the
                                  thread's highlight_text column)
```

The card itself is the M7 `EmailReplyCard`, extended in three ways for M9.

### 1. Excerpt truncation (`lib/excerpt.ts`)

The wall doesn't show the whole reply — only enough context for the highlight to land. `buildExcerpt(body, highlight)` does:

1. Find the highlight in the body (verbatim → case-insensitive → longest sentence fragment that overlaps).
2. Return `{ before, highlight, after, truncated }` where `before` is everything from the start of the body up to the highlight, `after` is the next ~80 characters, and `truncated = true` if there's more after that.
3. The renderer joins them with the highlight wrapped in a `.highlight` span and tacks on `…` if truncated.

### 2. Render-time redaction (`lib/redactions.tsx`)

`applyRedactions(text, phrases[])` walks each phrase longest-first and wraps every match in a `.redacted` span. Important detail: redactions live on top of the *unredacted* body in the DB. The mask is computed at render time only, so removing or editing a redaction in M10 takes effect on the next page render with no data migration.

### 3. SDR-name allowlist + recipient mailbox

`SDR_FIRST_NAMES` (in `lib/sdr.ts`) is the small list of human names used as Smartlead sender identities (Sarah, Jessica, Daniel, …). Recipient SDR mailbox is the `to_email` of the qualifying inbound reply. Both are added to the redaction set at render time even if `prw_redactions` doesn't have them. This is defense in depth — if a row is missing, we still don't leak the SDR's identity to the public wall.

### Highlight fallbacks

The classifier sometimes paraphrases. If `suggested_highlight_text` is "we'd love to learn more about your platform" but the body actually says "we would love to learn more about your platform", verbatim matching fails. So:

```ts
function pickAnchorHighlight(body, highlights): string | null {
  // 1. Exact substring match → return as-is
  // 2. Case-insensitive substring match → return the body's casing
  // 3. Longest sentence fragment that overlaps the suggested phrase → return that
  // 4. Nothing matches → return null (renderer falls back to no highlight)
}
```

This is enough to handle every classifier output we've seen. When it fails (rare), the card still renders — just without the purple wash. Better than crashing.

## Files added or changed in M9

| Path | Role |
|---|---|
| `migrations/003-restructure-threads.sql` | The destructive restructure. Drops + recreates four tables, adds `prw_messages`, sets up the soft polymorphic lead link |
| `app/demo/page.tsx` | Server Component, force-dynamic. Reads `getWallThreads(10)` and renders a CSS-columns masonry grid of `EmailReplyCard`s |
| `components/email-reply-card.tsx` | Extended from M7. Now accepts `highlight: string` (M9) and `redactions: string[]` (always-on at render time). Wraps the highlight in a `.highlight` span and applies the redaction mask |
| `lib/excerpt.ts` | `buildExcerpt(body, highlight)` + `pickAnchorHighlight(body, highlights)`. Verbatim → case-insensitive → sentence-fragment fallbacks |
| `lib/redactions.tsx` | `applyRedactions(text, phrases[])` — longest-first regex wrapper |
| `lib/sdr.ts` | `SDR_FIRST_NAMES` allowlist for the always-redact-the-sender defense layer |
| `lib/supabase-public.ts` | `getWallThreads(limit)` — joins thread × classification × qualifying message × redactions |
| `trigger/lib/ingest.ts` | Restructured to write `prw_threads` + `prw_messages` (replaces the old `prw_replies` writer). Soft lead link via linkedin_url/email match. Outbound steps + every inbound now persist |
| `trigger/lib/classify-batch.ts` | Reads `prw_messages` for the qualifying reply text. Persists `suggested_highlight_text` + `suggested_redactions[]` from the v2.0 prompt output |
| `trigger/lib/lead-lookup.ts` | New helper. Resolves a campaign's lead table via `client_analytics_config.lead_table`, then matches on `linkedin_url OR email` |
| `trigger/lib/mappers.ts` | Map Smartlead's email-history payload to `prw_messages` rows (direction, sent_at, sender, body) |
| `trigger/prompts/classify-reply.md` | Rewritten for v2.0. Adds the highlight + redactions sections. Output schema validated by Zod in `classify.ts` |
| `tests/unit/excerpt.test.ts`, `tests/unit/redactions.test.tsx` | Cover the three matching fallbacks + redaction edge cases (multi-occurrence, longest-first) |
| `tests/integration/supabase-constraints.test.ts` | Updated for the new schema (FK chains, partial unique index) |

## Acceptance against the brief

M9's brief is the email-rendering component + a `/demo` page that renders M4's flagged exemplars with redactions applied. Mapping each requirement to what shipped:

| Brief requirement | Status | Where |
|---|---|---|
| Implement the M7 recommendation as a reusable component | ✅ | `components/email-reply-card.tsx` (M7 component, extended in M9) |
| Sender name + email, company/role, subject, timestamp, body with line breaks | ✅ | `EmailReplyCard` props |
| Redaction rendering — clean black bars, original text intact in DB, surrounding text reflows naturally | ✅ | `lib/redactions.tsx` + `.redacted` style in `globals.css` |
| Long body handling (truncation) | ✅ | `lib/excerpt.ts` — start → highlight + 80-char tail + ellipsis |
| Missing fields handled gracefully | ✅ | `EmailReplyCard` falls back per field; `from_display_name ?? from_email`, `subject ?? "(no subject)"`, etc. |
| `/demo` page with ten exemplars + hand-authored redactions | ⚠️ deviation | We rendered top-10 HQ classified threads from live data instead. See below. |
| Decide dark / light mode | ✅ | Light only, Omar approved |
| Mobile/tablet/desktop clean | ✅ | CSS columns masonry adapts 1/2/3/4 cols |
| Sender avatar (Gravatar / Logo.dev / DiceBear) | ⚠️ deviation | `components/avatar.tsx` was built in M7 but removed during M10's cleanup pass. Wall cards render without an avatar. See below. |

## Deviations from the brief

Three intentional deviations, each with reasoning:

**1. `/demo` rendered live HQ data, not M4 exemplars + hand-authored redactions.** The brief's intent was to review visual design independently of the live data path. We rendered the top 10 high-quality threads from the live classifier output instead. This is actually a stronger acceptance test — it exercises both the renderer *and* the data path against real classifier output — but it isn't what the brief asked for. Justification: the M7 POC viewer (`/m7/pocs`) already covered the "visual design with hand-authored data" angle; M9's `/demo` was about proving the live wiring.

**2. Sender avatar removed.** M7 shipped `components/avatar.tsx` (Gravatar fallback to DiceBear initials). The M9 demo used it. During M10's cleanup pass it was deleted as unused — the wall card design Omar approved doesn't include an avatar slot, treating the From-line + black-bar redaction as the identity affordance instead. **This is a deviation from the brief's M9 acceptance criterion.** Re-add is cheap if Omar wants the avatar back: restore `components/avatar.tsx` from git, add an `<Avatar>` slot to `EmailReplyCard`'s header.

**3. The schema restructure (migration 003) wasn't in the M9 brief.** Added mid-milestone (2026-05-06) when Omar called out that the wall is a marketing surface but the same dataset is also our most direct feedback loop on outbound copy. Studying the SDR sequence that earned each positive reply — internal-only — needs both directions of every conversation in the DB. Treated as M9 scope because the data layer it changes is the same one M9's renderer reads.

## Demo path

1. Open `/demo`. Top 10 HQ replies render as cards in a masonry grid.
2. The killer phrase in each card is wrapped in a quiet purple span. The body around it shows `…before {highlight} 80-char tail…`.
3. SDR names and the recipient mailbox are masked even though the only redaction rows in the DB are `auto_lead` (lead identity) and `auto_classifier` (third-party names) — proving the render-time defense layer works.
4. Inspect the DOM on any card: `<span class="redacted">` wraps each masked span, `<span class="highlight">` wraps the killer phrase. Both are styled in `app/globals.css`.
5. Pick any thread and look at it in Supabase: `prw_messages WHERE thread_id = X` shows every outbound step + every inbound reply. The `is_qualifying_reply` row is the one the wall renders; the rest are the outbound sequence we want to study internally in M11.

## What's next (M10)

`/demo` is the rendering rehearsal. M10 ships the production wall + the admin tool that decides which threads land on it:

- **Public wall at `/`** — replaces the M7 hub, M8 coming-soon, and M9 demo. Reads `getPublishedWallThreads()` (only `is_published = true` rows). Sort by `display_priority` then date.
- **Admin dashboard at `/admin`** — three-pane layout: list, preview, actions. Publish toggle, priority editor, redaction + highlight management with a floating toolbar over the preview pane.
- **Multi-highlight schema** — `prw_highlights` table parallels `prw_redactions` so a thread can have several highlight phrases (e.g. an opening compliment + a CTA acceptance). Migration 004.

The M9 schema is what makes M10 possible. Without `prw_threads` (and the `prw_publish_state` 1:1 FK to it), the publish toggle has nothing to bind to.
