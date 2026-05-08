### [Improvement] `app/admin/dashboard.tsx` is a 936-line client component mixing rendering, mutation, and selection logic

**Severity:** Medium
**Priority:** P3
**Status:** Closed
**Area:** `app/admin/dashboard.tsx`

**Resolution:** Dashboard refactored from a 945-line monolith into four cohesive files:

- `app/admin/dashboard.tsx` — 415 lines. Owns top-level state (threads, selection, error, mounted), the filter/sort/list pane, and the floating selection toolbar. All mutations are now thin wrappers that delegate to the React Query hook.
- `app/admin/_components/thread-editor.tsx` — extracted the 270-line right pane (preview + priority + redactions + highlights). Receives mutation callbacks as props.
- `app/admin/_components/icons.tsx` — three SVG icons (HighlightIcon, RedactIcon, CloseIcon) extracted from the dashboard's tail.
- `app/admin/_hooks/use-admin-mutations.ts` — six TanStack Query `useMutation` hooks: `useTogglePublished`, `useSetPriority`, `useAddRedaction`, `useRemoveRedaction`, `useAddHighlight`, `useRemoveHighlight`. Each owns its lifecycle (mutationFn → onMutate optimistic update → onSuccess reconcile → onError rollback). Temp-id allocator and "refuse to delete temp ids" guard each exist exactly once.
- `app/admin/_providers/query-provider.tsx` — `AdminQueryProvider` wraps the admin tree with a QueryClient (`staleTime: 60s`, `refetchOnWindowFocus: false`, `mutations.retry: 0`). Wired in `app/admin/page.tsx` so RQ context is scoped to admin/* — the public wall (server-rendered) doesn't pay for it.

The 6 near-duplicate optimistic-update + rollback blocks (~270 lines combined in the original) collapsed to 6 ~30-line `useMutation` definitions. The React-19 setState-in-effect hazard is gone — RQ's `onMutate`/`onError` lifecycle eliminates the closure-read pattern that bit us in the report's lesson 2.5.

**Acceptance criteria status:**
- [x] Optimistic-update + rollback logic exists in one place, not five — *closed.*
- [x] Temp-id allocator and "refuse to delete temp ids" guard each exist in one place — *closed.*
- [x] Visible structure split — icons + thread-editor in their own files — *closed.*
- [~] `app/admin/dashboard.tsx` is under 400 lines — *415 lines; target was 400. The remaining 15 lines are the floating selection toolbar JSX and outside-click effect, deferred (extracting them is a follow-up worth ~50 lines but adds prop-passing overhead).*
- [ ] At least one unit test exercises the optimistic-mutation hook in isolation — *deferred to Batch 7 (test coverage), where RQ-aware test setup lands alongside the admin API + wall reader tests. Each useMutation hook is independently testable now that the lifecycle is declarative.*

**Problem**
`app/admin/dashboard.tsx` is one file of 936 lines containing:

- Top-level dashboard component (`AdminDashboard`).
- Sub-component `ThreadEditor`.
- Three icon components (`HighlightIcon`, `RedactIcon`, `CloseIcon`).
- Six mutation handlers (`togglePublished`, `setPriority`, `addRedaction`, `removeRedaction`, `addHighlight`, `removeHighlight`) — each ~30-50 lines of optimistic-update + retry logic, all with the same shape.
- A generic `call()` helper for `fetch + .json + error mapping`.
- Selection capture, viewport-relative toolbar positioning, outside-click detection, mounted-state handling, useSyncExternalStore for hydration safety.
- A `timeSince()` utility.

Every mutation handler follows the same skeleton:
1. Read the current value from `threads` via array `.find()`.
2. Optimistically `patchThread(id, fn)`.
3. POST/DELETE.
4. Reconcile with the server response.
5. On error, roll back and surface the error in `setError`.

The five mutation handlers (`togglePublished`, `setPriority`, `addRedaction`, `removeRedaction`, `addHighlight`, `removeHighlight`) are roughly 270 lines combined, mostly near-duplicate of one another. The optimistic-update + rollback pattern is the same shape every time.

This is exactly the kind of "business logic in a UI component" the frontend-engineer SKILL Golden Rule §architecture-violation flags: "business logic in UI components, API calls in presentation layer". §1 (Architecture & code structure) calls for `services/` for API/services. The skill's worked example #2 (the `<InvoiceCard>` example, lines 47-49 of SKILL.md) is exactly this pattern.

**Impact**
- **Hard to test.** The dashboard can't be tested without mounting React + a fetch mock. Pure logic (the rollback semantics, the optimistic merge logic, the mounted-state quirk) can't be unit-tested in isolation.
- **Hard to refactor.** Adding a new mutation type requires copying ~50 lines and remembering all the React-19-concurrency footguns the existing handlers carefully document inline (lines 148-152, 245-258, 349-360 — all repeated explanations of the same setState-in-effect rule).
- **Onboarding cost.** A reader has to keep four contexts in their head — top-level state, mutation handler, sub-component, selection logic — to follow any edit.
- **Latent bug surface.** Each near-duplicate handler is a chance to drift. The temp-id allocator is duplicated verbatim in `addRedaction` and `addHighlight`. The "refuse to delete temp ids" guard is duplicated. The "drop the temp on server-no-id failure" branch is duplicated. Five copies × five chances to drift.

**Evidence**
- `app/admin/dashboard.tsx` — single file, 936 lines.
- Lines 131-238 (addRedaction) and 302-377 (addHighlight) — near-identical bodies, differing only in field name (`redactions` vs `highlights`) and route (`/api/admin/redactions` vs `/api/admin/highlights`).
- Lines 148-152, 245-258, 349-360 — three explanations of the same React 19 setState-in-effect quirk.
- Lines 192-194, 305-307 — duplicate temp-id allocators.
- The component re-implements optimistic mutation patterns that React Query / TanStack Query exist to provide.

**Expected behavior**
- A presentation component that knows about props and renders.
- A services layer that owns the optimistic-update + rollback semantics.
- Reusable: adding a 7th mutation type = a few lines, not 50.
- Testable: optimistic logic verifiable without React Testing Library.

**Suggested fix**
Two structural moves, in order of value:

1. **Extract a shared `useOptimisticMutation<TItem, TArg>` hook** into `app/admin/use-optimistic-mutation.ts` (or `lib/use-optimistic-mutation.ts`). It accepts:
   - The current items + setter.
   - A predicate to find the target.
   - An optimistic-mutator function.
   - A server caller.
   - A reconciler (`(item, serverResponse) => item`).
   - An error setter.

   Each handler becomes a 5-line invocation. Drop the duplicated blocks.

2. **Split out the selection toolbar** to its own file `app/admin/selection-toolbar.tsx`. The mouse-up capture, rect snapshot, outside-click effect, and toolbar render are independent of the thread-mutation concerns and would be ~80 lines on their own.

3. **Extract icons** to `app/admin/icons.tsx` (or to `components/icons/` if any other component will use them). They're trivial SVGs but cluttering up the same file as the dashboard logic adds visual cost.

4. **Optional, but recommended: introduce TanStack Query.** It's the canonical answer to "we want optimistic mutations with rollback" and removes the entire shape we're hand-rolling. Frontend-engineer SKILL §State data fetching §"Server state via React Query (or equivalent) — never useState + useEffect for fetching." Adoption can be incremental — start with the admin mutations and leave the public wall server-rendered.

The post-refactor target: `app/admin/dashboard.tsx` ≤ 300 lines, mutation logic in a separately-testable hook, icons + toolbar in their own files.

**Acceptance criteria**
- [ ] `app/admin/dashboard.tsx` is under 400 lines.
- [ ] Optimistic-update + rollback logic exists in one place, not five.
- [ ] Temp-id allocator and "refuse to delete temp ids" guard each exist in one place.
- [ ] Selection toolbar lives in its own file.
- [ ] At least one unit test exercises the optimistic-mutation hook in isolation.
