### [Task] `npm run build` not validated as part of this audit (residual risk)

**Severity:** Low
**Priority:** P3
**Status:** Open
**Area:** CI / build pipeline

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
