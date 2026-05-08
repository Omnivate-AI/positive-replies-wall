### [Improvement] Public wall silently renders empty state on Supabase failure (no error UI, only a `console.error`)

**Severity:** Medium
**Priority:** P2
**Status:** Closed
**Area:** `app/page.tsx`

**Resolution:** Wall reader now distinguishes a real fetch failure from the legitimate empty state. The catch block sets a `loadError` flag and emits a structured log line `event=wall_fetch_failed` with the error message — Vercel runtime-log search can match on it, and any future alert rule can match without parsing free-form strings. The wall renders one of three states: `WallGrid` (results), an error panel ("We're having trouble loading the wall right now. Please refresh in a minute.") on `loadError`, or the original empty panel when neither holds. Added `app/error.tsx` global error boundary so unexpected throws outside the catch hit a clean fallback UI and emit `event=page_render_failed`. Live alert wiring (Slack / email on `wall_fetch_failed` events) deferred to the M11 follow-up — the structured logs are the prerequisite, the alert rule is an infra config step.

**Problem**
The public wall handles fetch errors by logging to the server console and rendering an empty state:

```tsx
let threads: Awaited<ReturnType<typeof getPublishedWallThreads>> = [];
try {
  threads = await getPublishedWallThreads();
} catch (e) {
  console.error("[/] getPublishedWallThreads failed:", e);
}
```

If Supabase is down, RLS misfires, or the embedded query shape changes, visitors see the "No replies are published yet. Check back soon." copy. From the visitor side, this is indistinguishable from "no replies are published yet" — which is the legitimate empty state.

`lib/supabase-public.ts:39-57` already retries transient `fetch failed` errors three times before throwing, so by the time the catch block runs, the failure is non-transient and material. We're hiding a real problem.

**Impact**
- **Outage masking.** A schema migration that breaks the embed shape, or a Supabase auth-key rotation that wasn't propagated, takes the wall out of service silently. Visitors think the team has no positive replies. The team only finds out via Vercel function logs (`console.error`), if anyone watches them.
- **No alerting.** Nothing wakes anyone up. The Trigger.dev daily run failure path has alerts (per `docs/m11-runbook.md:39-48`); the wall's read-side failure does not.
- **Brand damage.** The whole point of the wall is social proof. An empty wall shown to a prospect during a (bounded) Supabase outage is exactly the moment we don't want a soft fail.

**Evidence**
- `app/page.tsx:29-35` — current handler.
- `lib/supabase-public.ts:39-57` — `withRetry` already absorbs transient errors before the page handler ever sees them; what reaches the catch is a real failure (auth, schema, sustained outage).
- `docs/m10-admin-and-public-wall.md:30-31` — "The page is resilient against transient Supabase fetch failures: a try/catch around getPublishedWallThreads falls back to an empty grid (with a 'no replies yet, check back soon' panel) rather than 500ing." — design intent acknowledged. The hole: not distinguishing "empty" from "errored."

**Expected behavior**
- On a real fetch failure, the page either:
  1. Renders a distinct error state ("We can't load the wall right now — check back in a minute") so the empty-vs-broken distinction is visible to the visitor; or
  2. Throws to the framework's error boundary (`app/error.tsx`) and hits Vercel's error-tracking; or
  3. Both — log to a real observer (Sentry / Logtail / Vercel runtime logs with structured fields) AND render a graceful banner.
- Either way, the failure is observable both to the visitor and to the operator.

**Suggested fix**
1. Distinguish error from empty in the page state:
   ```tsx
   let threads: WallThread[] = [];
   let loadError = false;
   try {
     threads = await getPublishedWallThreads();
   } catch (e) {
     loadError = true;
     console.error("[/] getPublishedWallThreads failed:", e);
     // Optional: report to Sentry / Vercel observability if wired
   }
   …
   {threads.length === 0 ? (
     loadError ? <ErrorPanel /> : <EmptyPanel />
   ) : (
     <WallGrid threads={threads} />
   )}
   ```
   With `<ErrorPanel>` showing "We're having trouble loading the wall. Refresh in a minute." and `<EmptyPanel>` showing "No replies are published yet."

2. Add an `app/error.tsx` (or a more granular `app/(wall)/error.tsx`) for unexpected throws so the framework boundary catches anything the try/catch misses.

3. Wire up Vercel observability. The simplest option: add a structured log line (`console.error(JSON.stringify({ event: "wall_fetch_failed", error: String(e) }))`) so the existing Vercel log search picks it up reliably.

4. Add an alerting rule: any 1+ occurrence of `wall_fetch_failed` in 5 minutes → email/Slack. Same delivery path the Trigger.dev failures use.

**Acceptance criteria**
- [ ] Visitors see a distinguishable error message when the wall query fails, vs an empty-state message when there's nothing published.
- [ ] An `app/error.tsx` boundary exists for unexpected runtime errors.
- [ ] Failures are observable in Vercel runtime logs as structured events (or whatever the team's existing observer reads).
- [ ] An alerting rule fires on `wall_fetch_failed`.
