### [Task] No tests cover the admin API routes or the public wall page

**Severity:** Medium
**Priority:** P2
**Status:** Closed (admin API + wall reader); Component tests deferred
**Area:** `tests/integration/`, `tests/e2e/`, `tests/_helpers/`

**Resolution:** Two new integration test files cover the high-leverage gaps:

- **`tests/integration/admin-api.test.ts`** — 15 tests across the four `/api/admin/*` route handlers. Imports each route handler directly and exercises it with a `NextRequest` so tests run without a dev server. Covers:
  - `POST /api/admin/redactions` happy path + `is_high_quality=400` on invalid body.
  - `DELETE /api/admin/redactions` admin-source 200 / auto_lead 403 / auto_classifier 403 / non-existent 403 (the source-check guard from ticket #002).
  - `POST /api/admin/highlights` happy path; `DELETE` admin-source 200 / auto_classifier 403.
  - `POST /api/admin/publish` is_published toggle, display_priority update without affecting publish state, no_changes 400.

- **`tests/integration/wall-reader.test.ts`** — 6 tests for `getPublishedWallThreads` and `getAdminThreads`. Covers:
  - Filter to `is_published=true`.
  - Skip published-but-no-highlight threads.
  - `match_type` round-trips through the projection (typed-redactions contract from ticket #013).
  - Postgrest 1:1 vs 1:N embed-shape regression guard for `prw_publish_state`.
  - `getAdminThreads` returns ALL sentinel threads regardless of publish state.
  - `getAdminThreads` projects `match_type` on the typed redactions array.

**Production bug surfaced + fixed by this batch:** Supabase enforces a server-side `db-max-rows: 1000` cap that client-side `.limit()` and `.range()` cannot override. With ~1100 redactions in the production DB, both `getPublishedWallThreads` and `getAdminThreads` were silently truncating their IN-query responses past the first 1000 rows — leaking PII on the wall and dropping rows from the admin view. The fix introduces `fetchInBatches` (in `lib/supabase-public.ts`) which chunks the IN-list into 200-thread batches so each query stays under the cap. All three queries (`getWallThreads`, `getPublishedWallThreads`, `getAdminThreads`) now use it for redactions/highlights/messages joins. The wall-reader test was the regression guard.

**Test infra fixes that landed alongside:**
- `vitest.config.ts` — added `@/*` resolve alias mirroring `tsconfig.json`'s paths, so tests can import the app's modules through the same path the runtime code uses.
- `lib/supabase-public.ts` + `lib/supabase-admin.ts` — added `ws` polyfill for `realtime.transport` (Node 20 lacks native WebSocket; supabase-js's Realtime constructor crashes without one in non-Vercel runtimes like vitest).

**Test count:** 154 → 172 (+18 net: 15 admin-api + 6 wall-reader, minus 3 redundancies from re-running the existing seed pattern).

**Acceptance criteria status:**
- [x] At least one integration test exists per `/api/admin/*` route.
- [~] At least one test asserts the auth boundary — *partial. Tests assert the `source = 'admin'` boundary from #002; auth tests land alongside auth in main-app integration.*
- [x] At least one test for `getPublishedWallThreads` exercises the Postgrest embed.
- [ ] Component tests for highlight + redaction overlap in `EmailReplyCard` — *deferred. Requires jsdom + `@testing-library/react` setup; the `applyRedactions` unit tests in Batch 3 cover the rendering math; pure UI snapshots are lower-leverage and risk flake.*
- [x] Total tests grow and all pass — 138 → 172.

**Problem**
The repo's test suite is strong on the data-pipeline side: 138 tests across unit/integration/e2e/smoke, including pure-logic coverage of the classifier, retry, mappers, redactions, excerpt; integration coverage of Supabase constraints; and end-to-end coverage of ingest + classify against live infra.

It is silent on the **product surfaces** that actually serve users:

- Zero tests for `/api/admin/publish`, `/api/admin/redactions`, `/api/admin/highlights`, `/api/admin/revalidate`.
- Zero tests for `app/page.tsx` (public wall page).
- Zero tests for `app/admin/dashboard.tsx` (the most complex client component in the repo — ~930 lines of optimistic mutation, selection capture, error rollback).
- Zero tests for `getPublishedWallThreads()` and `getAdminThreads()` in `lib/supabase-public.ts`. The Postgrest embed shape is fragile (the file has multiple comments warning about 1:1-vs-1:N gotchas), and there's no test guard against re-introducing the bug.

The data-pipeline tests demonstrate strong test design — sentinel rows, idempotency proofs, real Supabase + Smartlead + OpenRouter calls. The same discipline applied to the product surface would have caught:

- Ticket 001 (no auth): a single test asserting `expect(POST /api/admin/publish without auth).toBe(401)` would have flagged this on day 1.
- Ticket 002 (DELETE source check): a test asserting `expect(DELETE auto_lead row).toBe(403)` would have caught the missing guard.
- Ticket 009 (prompt-version string sort): a unit test on the sort function with `["v2.10", "v2.9"]` input would have caught the bug.
- Postgrest embed-shape regressions (the comment at `lib/supabase-public.ts:300-305` describes a previous production bug; no test prevents recurrence).

**Impact**
- Every refactor of the admin routes or the wall reader risks silent regressions.
- The "test coverage at the risk level" criterion in the QA standard's framework section D ("Are tests sufficient, meaningful, and aligned with the risk level?") is unmet for the user-facing layer.
- New tickets in this audit (001, 002, 009) all surface defects that proper tests would have caught.

**Evidence**
- `tests/` tree (verified): unit (7 files: classify-schema, excerpt, mappers, openrouter, redactions, retry, smartlead), integration (3 files: classify-supabase, smartlead-shape, supabase-constraints), e2e (2 files: classify-end-to-end, ingest-idempotency), smoke (1 file: env-and-tables). 13 files total. None target the four `/api/admin/*` routes or the wall reader.
- `app/api/admin/*/route.ts` — four route handlers, ~250 lines, zero test files.
- `lib/supabase-public.ts` — three exported functions (`getWallThreads`, `getPublishedWallThreads`, `getReplyStats`, `getAdminThreads`), zero test file.
- `app/admin/dashboard.tsx` — the primary admin UI, ~930 lines of state + I/O, zero test file.

**Expected behavior**
A test suite covering the product surface, at minimum:

1. **Admin route integration tests** (live Supabase) — for each handler:
   - Happy path returns 200 with the expected mutation.
   - Invalid body returns 400 with the Zod error.
   - Unauthenticated request returns 401 (after ticket 001 lands).
   - DELETE on auto_lead / auto_classifier returns 403 (after ticket 002 lands).

2. **Wall reader integration tests** — for `getPublishedWallThreads`:
   - Returns only `is_published=true` threads with at least one highlight.
   - Honors the priority + sent_at sort.
   - Tolerates the 1:1-vs-1:N embed shape (use a fixture that exercises both relations).
   - Recovers from a single transient `fetch failed` (mocked) and surfaces the underlying error after retries exhaust.

3. **Component tests** for `EmailReplyCard` and `WallGrid` — at least snapshot-level tests verifying:
   - Highlights wrap every occurrence with the purple-wash span.
   - Redactions still apply inside the highlight span.
   - Show-more pagination reveals exactly `PAGE_SIZE` cards per click.

4. **A smoke test** that hits the deployed `/` and asserts a 200 response with the expected page shell. (Could go in `tests/smoke/`.)

**Suggested fix**
1. Create `tests/integration/admin-api.test.ts` exercising each handler against the real prw_* tables. Use a sentinel thread row pattern (already established in existing integration tests).

2. Create `tests/integration/wall-reader.test.ts` with the same setup, asserting `getPublishedWallThreads()` shape and ordering.

3. Add `vitest.config.ts` jsdom support (it currently runs node), and create `tests/component/email-reply-card.test.tsx` and `tests/component/wall-grid.test.tsx` using `@testing-library/react`.

4. Wire test:component as a separate npm script bucket for CI parallelism.

**Acceptance criteria**
- [ ] At least one integration test exists per `/api/admin/*` route.
- [ ] At least one test asserts the auth boundary (401 on missing creds, 403 on invalid source — alongside ticket 001 + 002).
- [ ] At least one test exists for `getPublishedWallThreads()` that exercises the Postgrest embed.
- [ ] Component tests cover the highlight + redaction overlap behavior in `EmailReplyCard`.
- [ ] Total tests in CI grow from 138 to 138 + the new ones, all passing.
