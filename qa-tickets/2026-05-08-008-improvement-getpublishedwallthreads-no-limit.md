### [Improvement] `getPublishedWallThreads()` fetches every published thread with no LIMIT (scale-time foot-gun)

**Severity:** Medium
**Priority:** P2
**Status:** Closed
**Area:** `lib/supabase-public.ts`, `components/wall-grid.tsx`, `app/page.tsx`

**Resolution:** Added a defensive `.limit(PUBLISHED_WALL_HARD_CAP)` (constant set to 500 in `lib/supabase-public.ts`) to `getPublishedWallThreads`'s primary thread query. When the result count hits the cap, the function emits a structured `event=wall_hard_cap_hit` warning so a future Vercel-log alert can fire before the wall silently truncates. Full server-side cursor pagination is the proper long-term fix and tracked as a follow-up in `components/wall-grid.tsx`'s comment — but at the project's current scale (dozens of published threads) it's not yet worth the refactor cost. The hard cap is the deferred-decision tripwire so the deferral can't expire silently.

**Problem**
`getPublishedWallThreads()` (`lib/supabase-public.ts:211-358`) issues an unbounded SELECT against `prw_threads` joined to `prw_classifications`, `prw_publish_state`, `prw_highlights`, plus a follow-up `prw_messages` and `prw_redactions` `IN (…threadIds)`. There is no `.limit()` and no pagination.

The page handler (`app/page.tsx:29-35`) awaits this then passes ALL threads as props to `<WallGrid>`. `WallGrid` is `"use client"` (`components/wall-grid.tsx:1`) and applies pagination purely client-side via `useState(visibleCount)` defaulting to 8 (`components/wall-grid.tsx:21, 43-46`).

This means:
- Every visit to `/` ships the full set of published threads as serialized props in the HTML payload.
- Each thread carries the cleaned reply body, all highlights, all redactions, the score, the to/from emails, the subject, etc.
- ISR caches a single rendered HTML payload, but the size of that payload is `O(published thread count)`.

The README and `components/wall-grid.tsx:6-13` comment acknowledge this is intentional today ("the count is small in practice — dozens, not thousands"), with a future-scale note: switch to server-side cursor pagination when we cross a couple hundred published replies.

**Impact**
- **Today: not broken.** The team has ~340 ingested replies, of which a fraction are published; the payload is small.
- **At ~200 published threads:** the HTML payload starts pushing past hundreds of KB, hurting LCP/TTFB/transfer cost on mobile.
- **At ~500+:** noticeable. ISR caches still work, but the first render after every revalidation is heavier.
- **Concrete threat model:** every mutation through `/api/admin/publish` triggers `revalidatePath('/')` which rebuilds the entire payload. With many published threads + active admin curation, the wall hits the rebuild path frequently. At scale, this is wasteful.

This isn't a bug — it's an explicit deferred decision. But it deserves a tracked ticket so the deferral doesn't expire silently.

**Evidence**
- `lib/supabase-public.ts:211-358` — `getPublishedWallThreads` body, no `.limit()` anywhere.
- `app/page.tsx:32` — `threads = await getPublishedWallThreads();` then `<WallGrid threads={threads} />`.
- `components/wall-grid.tsx:6-13` — comment explicitly stating: "Future scale: switch to server-side cursor pagination when we cross a couple hundred published replies."
- `components/wall-grid.tsx:43-44` — `useState(PAGE_SIZE)` with `PAGE_SIZE = 8`. Implies all threads are already in memory.

**Expected behavior**
Either (a) fetch only the first N threads server-side and lazy-load subsequent batches via a route handler / server action, or (b) keep current behavior but add a hard ceiling (`limit(500)` defensively) so an explosion in published rows can't crash the page.

**Suggested fix**
For a near-term fix without a real refactor, add a defensive `.limit(500)` to `getPublishedWallThreads()` and surface a count + a note in the response so an admin warning can fire when we approach the cap.

For the proper fix when it's worth the time:
1. Change `getPublishedWallThreads(opts: { offset?: number; limit?: number })` to accept pagination params and default to `limit: 24`.
2. Add a server action or route handler `app/api/wall/page/route.ts` that returns the next page of threads.
3. Switch `<WallGrid>` to lazy-load via that endpoint when "Show more" is clicked, instead of slicing from a pre-fetched array.

The frontend-engineer SKILL §6 (Performance — virtualization for long lists / Lists > 100 items → virtualize) and §13 (Caching strategy) both point at this kind of fix.

**Acceptance criteria**
- [ ] `getPublishedWallThreads()` either accepts pagination params or has a hard `LIMIT` cap with a logged warning when approached.
- [ ] First-render HTML payload size is bounded regardless of how many threads are published.
- [ ] The "Show more" button continues to work for visitors.
- [ ] If lazy-loading is added, the loading + error states are handled.
