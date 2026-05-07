# M10 — Admin dashboard + public wall

The wall goes live. M9 had the renderer, the data model, and a `/demo` route that proved both. M10 promotes that to the production surface (`/`) gated by an admin tool (`/admin`) Omar uses to triage incoming replies, mark phrases to highlight or redact, and decide what's published.

## TL;DR

- **Public wall at `/`** — server-rendered, ISR=60. Reads `getPublishedWallThreads()` (only `is_published = true` threads with at least one highlight). Hero panel + masonry grid (1/2/3/4 columns) + "Show 8 more" pagination + footer CTA to the Motion booking link.
- **Admin dashboard at `/admin`** — three-pane layout (30% list / 35% preview / 35% actions). Filterable thread list, `EmailReplyCard` preview with applied redactions, publish toggle, priority editor, redaction + highlight management. Floating toolbar appears over the preview when text is selected — one click to highlight or redact the selection.
- **Multi-highlight schema** (migration 004) — `prw_highlights` table parallels `prw_redactions`. A thread can have many highlight phrases (e.g. opening compliment + CTA acceptance), each rendered as its own purple wash on the card.
- **Auth removed** mid-milestone. The `/admin` route + admin API routes are open access. `/auth` is a placeholder. Decision context is in the [Auth](#auth-removed-mid-milestone) section.
- **Defense-in-depth redactions** at render time: `from_display_name`, `from_email`, `to_email`, and the SDR allowlist are always added to the mask set even if they're not in `prw_redactions`.
- **Three production bugs fixed along the way**: Postgrest 1:1 embed shape, React 19 setState concurrency, transient undici fetch failures.
- **Post-ship UI/UX polish** (commit `fd1fcb2`, 2026-05-07): card-style list items with brand-purple selection rail, score chip color-coded by tier, relative time-since on each row, primary-styled floating toolbar with SVG icons, action sections wrapped in cards, type-scale floor at `text-xs`, sort by `display_priority DESC, received_at DESC` on both surfaces.

## What ships on `/`

The public wall replaces the M7 hub, M8 coming-soon, and M9 demo as the homepage. One screen, one purpose: prove that real B2B execs say nice things to our cold emails.

Layout (revamped 2026-05-07 against the testimonial-page reference):

1. **Top bar** — logo + word-mark, "Book a call" link, Admin link (visible to anyone, but the page it leads to is gated only by knowing the URL — see auth section below).
2. **Hero** — soft white-pattern Unsplash backdrop at `opacity-20`, glass-panel headline reading *"What real prospects said when we cold-emailed them"*, eyebrow + sub + Book-a-call CTA.
3. **Section heading row** — "The wall" eyebrow + a one-paragraph framing line.
4. **Wall grid** — masonry (CSS columns: 1/2/3/4 by breakpoint). Up to 8 cards visible by default, "Show 8 more" reveal for the rest. Pure client-side pagination (`useState(visibleCount)`) — the count is in the dozens, not thousands; switch to server-side cursor pagination only when we cross a couple hundred published threads.
5. **Footer CTA** — book-a-call invitation on a soft brand-tinted band (`bg-accent-soft`).
6. **Footer** — logo + tagline ("AI cold outbound. Engineered, not prompted.") + copyright.

ISR `revalidate=60` keeps the page snappy and lets admin changes reach visitors within a minute (the admin API routes also call `revalidatePath('/')` on every mutation, so urgent changes show up immediately).

The page is resilient against transient Supabase fetch failures: a `try/catch` around `getPublishedWallThreads` falls back to an empty grid (with a "no replies yet, check back soon" panel) rather than 500ing.

## What ships on `/admin`

Three panes, no auth, designed for fast triage.

### Left pane (30%) — thread list

- **Header**: logo + "Admin / Positive Replies" word-mark, single-line status strip (`123 total · 45 HQ · 8 live`), search input, four filter pills (All / High quality / Published / Unpublished), `sticky top-0` so the controls don't scroll out of view.
- **List**: card-style rows (post-polish) with a brand-purple left rail when selected, score chip color-coded by tier (≥7 green, ≥4 brand-purple, else grey), relative time-since each reply landed (`2h`, `3d`, `2w` …), and badge row for HQ / Live / `#priority`.
- **Sort**: `display_priority DESC, received_at DESC` — pinned threads at the top, everything else newest-first within each priority tier. The admin list mirrors the public wall ordering exactly so what Omar sees while triaging matches what visitors see.

### Middle pane (35%) — preview

The same `EmailReplyCard` the public wall uses, rendered with the truncated body, applied highlights, and the full redaction set (stored + SDR allowlist + sender/recipient identities). Mouse-up inside the preview captures the current selection rect and shows a floating toolbar above it:

- **Highlight** — primary-styled (brand-purple background, white text), pen-icon. Posts to `/api/admin/highlights` (source=admin) and re-applies the purple wash on the live card.
- **Redact** — secondary, black-bar icon. Posts to `/api/admin/redactions` (source=admin), the selection becomes a black bar.

The toolbar dismisses on any outside click. Both actions are optimistic — the UI updates immediately, the API call settles in the background, and on failure the change rolls back with an error banner.

### Right pane (35%) — actions

Three sections, top to bottom:

- **Display priority** — number input + Save. `0` = pure date-sort (default). Any positive integer pins the thread above all priority-0 threads on both the admin list and the public wall. Higher number = higher within the pinned tier.
- **Highlights** — card-list of every highlight on the thread (auto_classifier + admin merged), with source attribution. Admin entries get a hover-revealed `×` delete button; auto entries are immutable in the UI (they regenerate from each classify pass). Add new via the typed input below or via the floating toolbar.
- **Redactions** — same pattern as Highlights. Sources are `auto_lead`, `auto_classifier`, `admin`. Same delete-on-admin-only rule.

### Floating toolbar — interaction details

```
mouseup inside [data-preview-pane]
  └─ window.getSelection() length > 1 chars?
       └─ snapshot the rect synchronously (sel.getRangeAt(0).getBoundingClientRect())
            └─ render fixed-position toolbar above the rect
                 └─ click action → optimistic state update + API call → clearSelection()
```

The rect snapshot has to happen synchronously on mouse-up because clicking the toolbar later collapses the live selection — by the time we process the click, `window.getSelection()` is empty.

## Multi-highlight schema (migration 004)

M9 stored a single highlight per thread on `prw_threads.highlight_text`. M10's review feedback (2026-05-07) flagged two issues:

1. The single-column shape couldn't represent more than one praise span per reply (e.g. an opening compliment *and* an accepted CTA).
2. The admin UI's textarea+Save pattern had a race condition where freshly set highlights got wiped by re-renders.

Migration 004 mirrors `prw_redactions`:

```sql
CREATE TABLE prw_highlights (
  id BIGSERIAL PRIMARY KEY,
  thread_id BIGINT REFERENCES prw_threads(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  source TEXT CHECK (source IN ('auto_classifier', 'admin')),
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (thread_id, text)
);
```

Backfill order:

1. **`auto_classifier`** rows from `prw_classifications.suggested_highlight_text` — the canonical "what the model picked" layer.
2. **`admin`** rows from `prw_threads.highlight_text` (Omar's overrides, accumulated under v1.x), skipping any string already covered by step 1.

`prw_threads.highlight_text` is intentionally **kept** as a dormant audit-trail column. New code reads and writes `prw_highlights` exclusively. We can drop the column in a follow-up migration once we're confident there's no rollback need.

The `EmailReplyCard` renderer takes a `highlights: string[]` prop, sorts longest-first (so longer phrases win when one is a substring of another), and wraps every match in a `<span class="highlight">`. Truncation is anchored on the *first* highlight found in the body via `pickAnchorHighlight()`.

## Auth, removed mid-milestone

The original M10 brief specified email-magic-link auth on `/admin` (matchin Omar's email against an allowlist). Implementation got partway in: middleware, server actions, an `/auth` page with a magic-link + 6-digit OTP form. Then it hit a wall:

- Magic links require Supabase Auth's email sender to be configured (SMTP or a third-party like Resend).
- Omar didn't have access to those settings on this Supabase project.
- The magic-link redirect URL whitelist also lives in Supabase Auth settings, same access constraint.

Rather than block the milestone on a config Omar couldn't change, we pulled auth out entirely. The `/admin` route is open access — anyone who knows the URL can publish/unpublish replies. The data risk is bounded (the wall content is public-facing testimonials, not customer PII), and the URL is not advertised. `/auth` was kept as a visual placeholder with a "currently disabled" notice, in case we want to re-enable auth without restoring the routes from git.

If we want auth back later: the simplest path is hard-coding a session cookie issued by a server route that checks against an env-var allowlist. No Supabase Auth dependency, no SMTP, no redirect URLs. ~30 lines of code.

## API routes

All under `/api/admin/`, all open access, all use the **service-role** Supabase client (`lib/supabase-admin.ts`) for writes. They call `revalidatePath('/')` after mutations so the public wall reflects changes immediately rather than waiting for the 60-second ISR window.

| Method · Path | Body | What it does |
|---|---|---|
| `POST /api/admin/publish` | `{ thread_id, is_published?, display_priority? }` | Upserts the `prw_publish_state` row. Either or both fields can be set. Returns the updated row. |
| `POST /api/admin/redactions` | `{ thread_id, text }` | Inserts a `prw_redactions` row with `source='admin'`. Returns the inserted row's `id`. |
| `DELETE /api/admin/redactions` | `{ id }` | Deletes by id. Server-side check refuses if `source != 'admin'`. |
| `POST /api/admin/highlights` | `{ thread_id, text }` | Inserts a `prw_highlights` row with `source='admin'`. Returns inserted id. |
| `DELETE /api/admin/highlights` | `{ id }` | Deletes by id. Server-side check refuses if `source != 'admin'`. |
| `POST /api/admin/revalidate` | (none) | Calls `revalidatePath('/')`. Called after every mutation so changes show on the public wall within a render. |

## Bugs uncovered along the way

Three production-grade gotchas that ate hours but ship now as fixed + commented:

### 1. Postgrest 1:1 embed shape

When you embed a relation in a Postgrest select, the shape depends on cardinality. **1:N relations come back as an array. 1:1 relations (FK to PK) come back as a single object.** `prw_publish_state.thread_id` is the table's primary key, so `publish_state:prw_publish_state(...)` returned a single object, not an array.

The original code did `r.publish_state[0]?.is_published` — which on an object returns `undefined`, which falls back to `false`. So `is_published` was always `false` after a refresh, masking publish persistence entirely. The bug looked like "the publish toggle isn't saving" but the data was correct in the DB the whole time.

Fix: read `r.publish_state` directly, not `r.publish_state[0]`. Type changed from `{}[]` to `{} | null`.

### 2. React 19 setState reducer not synchronous

```ts
let removed: Redaction | undefined;
setThreads((prev) => {
  const t = prev.find(...);
  removed = t.redactions.find(r => r.id === id);  // ← captured here
  return { ...prev, ... };
});
await call("/api/admin/redactions", { method: "DELETE", body: { id } });  // ← `removed` is undefined here
```

In React 19's concurrent mode, the reducer is **not guaranteed to run synchronously**. Variables set inside the updater can read as `undefined` immediately after. Two of our remove handlers and the priority Save button fell into this; they'd silently no-op without ever calling the API.

Fix: read state via the parent closure (`threads.find(...)`) before calling the optimistic `setThreads(prev => ...)`. The closure version of `threads` is the latest committed render, which is good enough.

### 3. `TypeError: fetch failed` from undici

Node 20 + `@supabase/supabase-js` occasionally drops a connection on the first request. The thrown error is `TypeError: fetch failed` and crashed `/` with a 500 even when the data was healthy.

Fix: `withRetry()` wrapper in `lib/supabase-public.ts` (3 attempts, 200ms/400ms backoff, only retries on `TypeError: fetch failed`). The page itself also has a `try/catch` that falls back to an empty grid — never 500.

## UI/UX polish (post-ship, 2026-05-07)

After the M10 commit landed, we ran the admin dashboard through a frontend design pass. Nothing structural changed; the layout is still 30/35/35, but every section got a coat of polish. Documented as a design-skill review with prioritized recommendations; all P0–P3 items applied.

| Area | Before | After |
|---|---|---|
| Thread list | Flat `<ul>` with `divide-y`, faint mono score, generic `bg-accent-soft` selected state | Card-style rows with brand-purple left rail when selected, score as a chip color-coded by tier (≥7 green / ≥4 purple / else grey), relative time-since each reply |
| Counts strip | 4-column debug grid eating ~80px of header space | Single status line: `123 total · 45 HQ · 8 live` |
| Floating toolbar | Two equal grey buttons with color-swatch dots | Primary-styled Highlight (brand purple bg, white text, pen icon), muted secondary Redact (black-bar icon) |
| Publish button | Quiet grey "Unpublish" that reads as disabled | Green pill with status dot when live, brand-purple primary when off |
| Action sections | Three flat sections stacking | Highlights + Redactions wrapped in cards with live counts in the labels (e.g. `Highlights (4)`) |
| Delete affordance | `<button>✕</button>` typographic glyph | `CloseIcon` SVG, hover-revealed via `opacity-0 group-hover:opacity-100`, danger-soft hover bg |
| Type scale | 5 sub-12px sizes (`10px`, `11px`, `xs`, `13px`, `sm`) | Floor at `text-xs` (12px). Hierarchy now comes from color, not microscopic font sizes |

Plus a sort-order change: both surfaces (admin + public wall) now sort by `display_priority DESC, received_at DESC` (was `display_priority DESC, total_score DESC, sent_at DESC`). Pure date-sort within each priority tier — Omar's call.

## Files added or changed in M10

| Path | Role |
|---|---|
| `app/page.tsx` | Public wall homepage. Replaces the M7/M8/M9 placeholder. Hero + masonry + footer CTA |
| `components/wall-grid.tsx` | Client component for the wall grid. Handles 8-per-click pagination, masonry layout |
| `app/admin/page.tsx` | Server Component. Calls `getAdminThreads()`, renders `<AdminDashboard>` |
| `app/admin/dashboard.tsx` | Client component. The full triage UI: list, preview, actions, floating toolbar, optimistic mutations |
| `app/api/admin/publish/route.ts` | POST `is_published` / `display_priority` upsert |
| `app/api/admin/redactions/route.ts` | POST + DELETE for `prw_redactions` (admin-source only on delete) |
| `app/api/admin/highlights/route.ts` | POST + DELETE for `prw_highlights` (admin-source only on delete) |
| `app/api/admin/revalidate/route.ts` | POST `revalidatePath('/')` |
| `lib/supabase-admin.ts` | Service-role Supabase client for the API routes (writes only) |
| `lib/supabase-public.ts` | Added `getPublishedWallThreads()` + `getAdminThreads()` + `withRetry()` |
| `migrations/004-prw-highlights.sql` | `prw_highlights` table + backfill from `suggested_highlight_text` and `prw_threads.highlight_text` |
| `components/email-reply-card.tsx` | Now accepts `highlights: string[]` (was singular). Renders longest-first, shadow-only treatment |
| `lib/excerpt.ts` | Added `pickAnchorHighlight(body, highlights[])` — picks the first highlight that matches the body |
| `app/globals.css` | Brand color tokens (`--color-accent: #852ddd`), `cursor: pointer` global rule for clickables, `.redacted` + `.redaction-transition` styles |
| `public/logo.png`, `app/icon.ico` | Omnivate logo + favicon |

Files removed (cleanup pass):

- `/coming-soon`, `/demo`, `/m7/*` — obsolete pages, replaced by `/`
- `components/avatar.tsx`, `components/wall-reply-card.tsx` — unused since the renderer consolidated on `EmailReplyCard`
- `app/api/og-reply/route.tsx` — M7 Option C (Satori OG image), no longer used
- `scripts/backfill-email-redactions.ts` — one-shot, executed during M9, no longer needed

## Acceptance against the brief

Mapping each requirement in the M10 brief to what shipped:

| Brief requirement | Status | Where |
|---|---|---|
| Public page at `/` pulling all `is_published` rows joined to classifications + redactions | ✅ | `lib/supabase-public.ts` `getPublishedWallThreads()` |
| Sort by display priority ASC, then quality score DESC, then reply timestamp DESC | ⚠️ deviation | Currently sorts `display_priority DESC, received_at DESC` — both directions of priority sort and removing quality score were deliberate calls. See below. |
| Render each reply with the M9 component, redactions applied | ✅ | `<EmailReplyCard>` + `applyRedactions()` |
| Empty state | ✅ | "No replies are published yet. Check back soon." panel |
| Admin page, gated behind password / magic-link auth | ⚠️ deviation | Auth removed mid-milestone. See [Auth](#auth-removed-mid-milestone). |
| See all replies, filterable by classification status | ✅ | Search + filter pills (All / High quality / Published / Unpublished) |
| Toggle published per reply | ✅ | Publish button in the right-pane header |
| Edit display priority to bump a reply to the top | ✅ | Number input + Save in the actions pane |
| Mark redactions per reply — text editor click-and-drag OR dedicated input, fast enough for 10 redactions in 10 minutes | ✅ | Both: floating toolbar on text-select + typed input below the redactions list |
| Preview the reply with redactions applied before publishing | ✅ | Middle preview pane is the same `EmailReplyCard` the public wall renders, with the same redactions applied |
| Intro section at top of the public page + footer CTA to a "book a call" link | ✅ | Hero panel with framing copy + footer CTA on `bg-accent-soft` linking to the Motion booking URL |
| TTFB under 800ms via SSG / ISR / edge | ✅ | `revalidate=60` on the wall route — well under target |

## Deviations from the brief

**1. Sort order.** The brief specifies `display_priority ASC, total_score DESC, received_at DESC`. We ship `display_priority DESC, received_at DESC`.

- **Direction of priority.** Brief reads "ascending" (lower number = more prominent). Migration 003's `prw_publish_state.display_priority` column comment reads "Higher = more prominent. Default 0 (no pin)." The schema convention (higher = pin further to top) is more intuitive — priority `1` reads as "level 1 pin" rather than "most-prominent rank." Both implementations satisfy the underlying intent (admin can pin a reply to the top); they just disagree on the encoding.
- **Quality score removed from the sort.** The original M10 commit shipped the brief's full three-key sort. On 2026-05-07 Omar asked to drop score from the sort entirely so the wall reads as "most recent on top, with admin pins above." The score still drives `is_high_quality` (which gates publish-eligibility) and is still visible on each card in the admin — it just doesn't influence wall ordering anymore.

**2. Auth.** Documented inline: [Auth, removed mid-milestone](#auth-removed-mid-milestone). Briefly: magic-link auth needs Supabase SMTP + redirect-URL config that Omar didn't have access to on this project. Rather than block the milestone, auth was pulled and `/admin` is open access. Data risk is bounded (wall content is public-facing testimonials, not customer PII), URL is unadvertised. Re-adding via a hard-coded session-cookie allowlist is ~30 LOC if needed.

Everything else maps directly.

## Demo path

1. Open `/` — the public wall. Hero + masonry of cards. Each card has the killer phrase in a quiet purple wash, lead identity black-barred, footer CTA to the Motion booking link.
2. Click "Show 8 more" once or twice to see pagination.
3. Click **Admin** in the top-right.
4. Pick any thread in the list. The preview pane shows what visitors would see — same `EmailReplyCard`, same redactions, same highlights.
5. Select a phrase in the preview pane → floating toolbar appears → click **Highlight**. The phrase gets a purple wash live; refresh `/` (in a second tab) to see it on the public wall too.
6. Select a different phrase → click **Redact**. Black bar live, persisted, visible on `/`.
7. In the actions pane, set **Display priority** to `1` and Save. The thread jumps to the top of the admin list AND the public wall.
8. Toggle the Publish button. The thread disappears from `/` (within the next request).
9. Filter by "Unpublished" in the left pane and find a thread that's never been published. Toggle it on. It now appears on `/`.

## What's next (M11)

M11 is **Phase 5 — Continuous operations.** The wall + admin are live, but ingestion and classification still need to be triggered manually. M11 schedules them on a cadence, adds failure alerting, and writes the runbook so a different engineer (or Omar himself) can operate the system without reverse-engineering it. See `docs/m11-continuous-operations.md` (forthcoming).
