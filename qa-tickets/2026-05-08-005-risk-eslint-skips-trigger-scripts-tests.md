### [Risk] ESLint config silently ignores `trigger/`, `scripts/`, and `tests/` directories

**Severity:** High
**Priority:** P1
**Status:** Open
**Area:** `eslint.config.mjs`

**Problem**
`eslint.config.mjs:18-35` ignores most of the source tree from lint:

```js
ignores: [
  "node_modules/**",
  ".next/**",
  ".trigger/**",
  "dist/**",
  "next-env.d.ts",
  "app/m7/data/quiz.ts",   // ← references a path that no longer exists
  "trigger/**",            // ← all Trigger.dev tasks + lib + prompts
  "scripts/**",            // ← all CLI runners
  "tests/**",              // ← all 138 vitest tests
  "vitest.config.ts",
  "trigger.config.ts",
],
```

The justification in the comment ("Adding them here just adds noise. Trigger task code, tests, and scripts have their own static checks via `tsc --noEmit` and vitest.") is incorrect on two counts:

1. **`tsc --noEmit` is not a substitute for ESLint.** TypeScript catches type errors. ESLint catches code-quality, security, and React-specific issues that the type checker doesn't see — `eqeqeq`, `no-unused-vars` (TS catches some, not all), `no-empty`, `no-explicit-any`, `prefer-const`, `react-hooks/*`, `@next/next/*`, `@typescript-eslint/no-floating-promises`, `@typescript-eslint/await-thenable`. The Trigger.dev tasks are doing significant async I/O (Smartlead pagination, OpenRouter retries, Supabase upserts) — exactly the surface where `no-floating-promises` and `await-thenable` matter.

2. **`vitest` is a test runner, not a linter.** It tells you tests pass; it does not tell you the test code or the production code under test has lint violations.

The ignored directories contain ~20 source files including the entire Trigger.dev pipeline, all CLI runners, and all 13 test files. If a regression reaches production, lint would not have caught it.

The ignore list also references `app/m7/data/quiz.ts`, which does not exist in the repo (the M7 routes were replaced by the M10 wall — see `app/` tree). Stale ignore entries are noise.

**Impact**
- **Quality blind spot in the highest-risk code.** The Trigger.dev pipeline is where Smartlead → Supabase → OpenRouter → Supabase happens. Any unhandled-promise bug here can leave the daily run silently half-completed (e.g. classify done but redactions not seeded). Frontend-engineer SKILL §17 (Testing & reliability) and §15 (TypeScript quality) — both gates are not enforced on this path.
- **Hidden problems.** A quick scan of `trigger/` and `scripts/` shows several `// eslint-disable-next-line @typescript-eslint/no-explicit-any` and `as unknown as any` patterns that wouldn't be flagged today (e.g. `trigger/lib/supabase.ts:30`, `scripts/run-calibration.ts:36, 80`).
- **Stale config.** The dangling `app/m7/data/quiz.ts` ignore signals the config drifts faster than it's reviewed.
- **Onboarding cost.** A new contributor reads the file and reasonably assumes lint coverage is global. They commit a `trigger/` change with a violation; CI passes lint; the bug ships.

**Evidence**
- `eslint.config.mjs:19-34` — full ignores block (cited above).
- File tree:
  - `trigger/lib/{classify-batch,classify,ingest,lead-lookup,mappers,openrouter,retry,smartlead,supabase}.ts` — 9 files, ignored.
  - `trigger/{classify-replies,ingest-smartlead-replies,scheduled-ingest-and-classify}.ts` — 3 files, ignored.
  - `scripts/{apply-migration,classify-local,ingest-local,run-calibration,test-deployment,trigger-wrapper}.ts` — 6 files, ignored.
  - `tests/**/*.test.{ts,tsx}` — 13 files, ignored.
- `app/m7/data/quiz.ts` is in the ignore list but does not exist (verified by tree walk).
- `scripts/run-calibration.ts:36, 80` — `input: any` literal, would be flagged by `@typescript-eslint/no-explicit-any` if this directory were linted.
- `trigger/lib/supabase.ts:29-30` — `eslint-disable-next-line @typescript-eslint/no-explicit-any` already in code, suggesting the original author expected lint to apply here.

**Expected behavior**
ESLint runs against the entire source tree by default. Specific rules can be relaxed per-directory via flat-config overrides — that's the supported pattern in ESLint v9 — but the directory itself is not exempted.

**Suggested fix**
1. Remove `trigger/**`, `scripts/**`, `tests/**` from the `ignores` array.
2. Remove the dangling `app/m7/data/quiz.ts` entry.
3. Run `npm run lint` and triage what surfaces. For `trigger/` and `scripts/`, allow `no-console` and the existing `@typescript-eslint/no-explicit-any` disables (they're CLI/server code where console is the legitimate output channel) via a flat-config override:
   ```js
   {
     files: ["trigger/**/*.ts", "scripts/**/*.ts"],
     rules: {
       "no-console": "off",
     },
   },
   {
     files: ["tests/**/*.{ts,tsx}"],
     rules: {
       "no-console": "off",
       "@typescript-eslint/no-explicit-any": "off",
     },
   },
   ```
4. Fix the violations in production code (`trigger/`) before merging — that's the high-leverage win. Existing tests can adopt `// @ts-expect-error <reason>` where mock types are intentionally loose.
5. Wire `npm run lint` into CI (Vercel Preview deployment hook or a GitHub Action) so violations block merge to `main`.

**Acceptance criteria**
- [ ] `eslint.config.mjs` ignores list contains only build artifacts and the Next.js generated types — no source directories.
- [ ] `npm run lint` runs to completion against the full repo with zero errors.
- [ ] Targeted overrides for `trigger/`, `scripts/`, `tests/` are documented in the file.
- [ ] CI fails the build when `npm run lint` exits non-zero.
- [ ] The dangling `app/m7/data/quiz.ts` reference is removed.
