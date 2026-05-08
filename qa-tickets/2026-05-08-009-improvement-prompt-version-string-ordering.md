### [Improvement] "Latest prompt version" is computed via `prompt_version.localeCompare()` — string-sort breaks at v2.10

**Severity:** Medium
**Priority:** P2
**Status:** Open
**Area:** `lib/supabase-public.ts` (3 occurrences), classifier batch logic

**Problem**
Several queries pick the "latest" classifier prompt version by string-sorting the `prompt_version` text column descending:

```ts
const { data: latest } = await sb
  .from("prw_classifications")
  .select("prompt_version")
  .order("prompt_version", { ascending: false })
  .limit(1)
  .maybeSingle();
const promptVersion = latest?.prompt_version ?? "v2.0";
```

String-ordering "v2.0", "v2.1", "v2.2", … "v2.9", "v2.10" produces:
```
v2.9, v2.8, v2.7, ..., v2.10, v2.1, v2.0
```

Because in lexicographic order `"v2.10" < "v2.2"`. So once the team bumps `PROMPT_VERSION` to `v2.10`, the wall reads from v2.9's classifications and silently ignores the newer ones — exactly the opposite of intent. The same trap fires on every minor digit rollover (`v3.10` vs `v3.9`, etc.).

The same string-sort is used in `getAdminThreads()` (`lib/supabase-public.ts:482-483`):
```ts
const latest = classifs.length > 0
  ? [...classifs].sort((a, b) => b.prompt_version.localeCompare(a.prompt_version))[0]
  : null;
```
which means the admin view of "latest classification" is also wrong post-v2.10.

The classifier itself (`trigger/lib/classify-batch.ts`) reads `PROMPT_VERSION` directly from the constant, so writes are fine; only reads are affected.

**Impact**
- **Silent data divergence at the next major prompt iteration.** The wall reads stale classifications without any error or warning. Highlights, scores, and `is_high_quality` flags trail by one version.
- **No way to detect the bug from the UI.** Score chips and highlights look normal; only careful diff against `prw_classifications` reveals it.
- **The codebase has been on `v2.0` since M9** (`trigger/lib/classify.ts:37`). Today it works because a one-decimal-place format with a single digit on each side compares correctly. The first time someone bumps to `v2.10` (or `v3.0` followed by `v3.10` later), the bug fires.

**Evidence**
- `lib/supabase-public.ts:96-99` — first occurrence (`getWallThreads`).
- `lib/supabase-public.ts:215-222` — second occurrence (`getPublishedWallThreads`, wrapped in retry).
- `lib/supabase-public.ts:482-483` — third occurrence (`getAdminThreads` picks latest per thread via `localeCompare`).
- `lib/supabase-public.ts:531-538` — fourth occurrence (`getReplyStats` for the latest prompt version).
- `trigger/lib/classify.ts:37` — `export const PROMPT_VERSION = "v2.0";` — the single source of truth on writes. Comment block explicitly anticipates "v2.0", "v2.1-tightened-praise", and "v3.0" naming.
- `tests/unit/classify-schema.test.ts:100-104` asserts `PROMPT_VERSION === "v2.0"`. No test covers the read-side semver-aware ordering.

**Expected behavior**
"Latest prompt version" is computed by either:
1. Reading `PROMPT_VERSION` directly from `trigger/lib/classify.ts` (single source of truth — the writer's version is by definition the latest the system intends to use), OR
2. Comparing parsed semver components (`vMAJOR.MINOR[-suffix]`).

Option 1 is simpler and exactly what the system already assumes when it writes — the public layer reading from the same constant is the most consistent design.

**Suggested fix**
Export `PROMPT_VERSION` from a path that's safely importable from both `lib/` and `trigger/`. Two clean options:

A. **Import directly.** `lib/` already imports nothing from `trigger/` today, but `PROMPT_VERSION` is a pure string constant — no Trigger.dev SDK side-effects. Add at the top of `lib/supabase-public.ts`:
   ```ts
   import { PROMPT_VERSION } from "@/trigger/lib/classify";
   ```
   Then replace the four `latest?.prompt_version ?? "v2.0"` patterns with `PROMPT_VERSION` directly. Drop the per-call query that reads it from the DB.

B. **Move the constant.** Create `lib/prompt-version.ts` with `export const PROMPT_VERSION = "v2.0";` and re-export from `trigger/lib/classify.ts`. Both layers import from the canonical location.

If for some reason the read layer truly needs to discover the latest version from the DB (e.g. coexistence with hand-written entries), the proper sort is:

```ts
function semverDesc(a: string, b: string): number {
  const norm = (v: string) =>
    v.replace(/^v/i, "").split(".").map((p) => Number(p) || 0);
  const [aMaj = 0, aMin = 0] = norm(a);
  const [bMaj = 0, bMin = 0] = norm(b);
  return bMaj - aMaj || bMin - aMin;
}
```

Add a unit test under `tests/unit/` that asserts `semverDesc("v2.10", "v2.9") < 0`.

**Acceptance criteria**
- [ ] All four `prompt_version` ordering sites in `lib/supabase-public.ts` use a strategy that gives `v2.10 > v2.9`.
- [ ] A unit test verifies the ordering semantics for the at-risk version pairs.
- [ ] The fallback `?? "v2.0"` literal is removed (it's a foot-gun: if the DB query ever fails, the wall renders v2.0 data instead of failing loudly — and post-v2.0 that's the wrong default).
- [ ] The admin and public wall both read from the same `PROMPT_VERSION` source.
