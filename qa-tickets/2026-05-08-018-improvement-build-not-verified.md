### [Task] `npm run build` not validated as part of this audit (residual risk)

**Severity:** Low
**Priority:** P3
**Status:** Closed
**Area:** CI / build pipeline

**Resolution:** `npm run build` was run and surfaced a real production bug introduced by Batch 3's `import { PROMPT_VERSION } from "@/trigger/lib/classify"` in `lib/supabase-public.ts`. Pulling the Trigger.dev runtime path through Next.js's bundler hit module-resolution failures on the `.js`-extension imports inside `trigger/lib/` (`./openrouter.js`, `./classify-batch.js`, etc.) — Next's bundler doesn't follow the explicit-extension ESM convention that Trigger.dev uses.

Fix: extracted `PROMPT_VERSION` to a leaf module `lib/prompt-version.ts` (no Trigger.dev / OpenRouter / Supabase service-role dependencies). Both `trigger/lib/classify.ts` and `lib/supabase-public.ts` now import from there. `trigger/lib/classify.ts` re-exports `PROMPT_VERSION` so existing call sites elsewhere in `trigger/lib/*` and `tests/` keep working without import-path changes. Same single-source pattern as `lib/sdr.ts:SDR_FIRST_NAMES`.

Final verification matrix:
- `npm run typecheck` — pass.
- `npm run lint` — pass (full source tree, including the directories Batch 1 unblocked).
- `npm test -- --run` — 172/172 tests pass across 15 files (unit / integration / e2e / smoke).
- `npm run build` — pass. All 9 routes resolved. ISR + dynamic markings correct: `/` static (revalidate=1m), `/admin`, `/auth`, `/api/admin/*` dynamic.

The build verification was the load-bearing closure for this batch — it caught a real bug the test suite couldn't have caught (vitest doesn't go through Next.js's bundler).

**Problem**
This audit ran `npm run typecheck`, `npm run lint`, and `npm test` (all passed). It did **not** run `npm run build` because the audit runs in a sandboxed environment with constrained execution time.

The team should verify the production build still completes cleanly, since builds catch issues that typecheck + lint don't:

- Hydration mismatch warnings.
- Server / Client component boundary violations (e.g. accidentally importing a server-only module from a `"use client"` file).
- Module-resolution problems for `@/*` aliases when `next build` runs through Turbopack vs vitest's resolver.
- Sharp / Image-optimization runtime errors.
- Any `next/image` `remotePatterns` issues that would surface only at build (relevant once ticket 004 lands).

The frontend-engineer SKILL "Final pre-commit gate" lists "Build runs successfully" as a required tick.

**Impact**
This is a residual-risk note, not a finding. The team has been deploying via Vercel's auto-deploy on every push to main since M3, so any build failure has been visible in production. The risk is bounded.

**Evidence**
- `package.json:scripts.build` = `next build`.
- `docs/m11-runbook.md` doesn't include a periodic `npm run build` check; relies on Vercel CI.
- Audit notes: typecheck and lint were validated; build was not.

**Expected behavior**
- A clean `npm run build` runs as part of the local pre-commit check, and as part of CI. Vercel does the latter implicitly; the local hook is what's missing.

**Suggested fix**
1. Run `npm run build` once locally to confirm the current main is buildable. Capture a successful run in the next PR description as evidence.
2. Add a documentation line in `docs/m11-runbook.md` § Quick reference: "Verify build cleanly: `npm run build`". One line.
3. Optional: add a `prepublish` or `prepush` Husky hook running `typecheck && lint && build` if local-side checks are valued.

**Acceptance criteria**
- [ ] `npm run build` completes locally with exit code 0.
- [ ] No build warnings about hydration, dynamic imports, or RSC boundaries.
- [ ] (Optional) A pre-push hook enforces this.
