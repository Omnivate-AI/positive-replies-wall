### [Improvement] `SDR_FIRST_NAMES` is duplicated across three modules with a "keep in sync" comment

**Severity:** Medium
**Priority:** P2
**Status:** Closed
**Area:** `lib/sdr.ts`, `trigger/lib/classify.ts`, `trigger/lib/mappers.ts`

**Resolution:** `lib/sdr.ts` is now the single source of truth. `trigger/lib/classify.ts` imports + re-exports `SDR_FIRST_NAMES` (the re-export keeps existing import paths working — the classifier prompt assembly + tests + scripts that imported from there don't need to change). `trigger/lib/mappers.ts` imports the canonical list and derives `SDR_FIRST_NAMES_LOWER` at module load via `.map((n) => n.toLowerCase())` — no second list to drift. Updated docstring on `lib/sdr.ts` flags it as "SINGLE SOURCE OF TRUTH" and tells future editors to add/remove SDRs in one file. New unit test in `tests/unit/mappers.test.ts` iterates over `SDR_FIRST_NAMES` and asserts each name is skipped by `redactionsFromLead` — guards against future drift.

**Problem**
The SDR allowlist (`["Christie", "Andrew", "James", "Josh", "Omar"]`) is defined three times in three places, each with a comment telling future readers to keep them in sync manually:

- `lib/sdr.ts:21` — exported as `SDR_FIRST_NAMES`, used by the renderer's mask set.
- `trigger/lib/classify.ts:50` — exported again as `SDR_FIRST_NAMES`, fed into the prompt's user message so the classifier knows not to suggest these as `auto_classifier` redactions.
- `trigger/lib/mappers.ts:144-150` — declared a third time as `SDR_FIRST_NAMES_LOWER` (Set<string>), used to skip lead-derived redactions when the lead's name matches an SDR.

The `lib/sdr.ts` comment says: "Kept in sync with `trigger/lib/classify.ts:SDR_FIRST_NAMES` (the classifier needs the same list to know NOT to suggest these as `auto_classifier` redactions). Keep both in sync when adding/removing SDRs." The comment doesn't mention the third copy in `mappers.ts`.

**Impact**
- **Drift risk.** Adding a new SDR (the team has reportedly grown several times — see m1 docs) requires editing three files. Forgetting one causes silent inconsistencies:
  - Forget `lib/sdr.ts`: the new SDR's name leaks onto the public wall as visible text.
  - Forget `trigger/lib/classify.ts`: the classifier may flag the new SDR's name as a redaction-worthy third party (auto_classifier rows) — wrong source attribution but functionally fine.
  - Forget `trigger/lib/mappers.ts`: a lead happening to share a first name with the new SDR gets their name redacted (not a bug per se, but confusing).
- **No test catches the drift.** No assertion verifies the three lists are equal.
- **The comment is outdated** — it acknowledges only two of the three copies.

**Evidence**
- `lib/sdr.ts:21` — `export const SDR_FIRST_NAMES = ["Christie", "Andrew", "James", "Josh", "Omar"];`
- `trigger/lib/classify.ts:50` — same list, exported under the same name from a different module.
- `trigger/lib/mappers.ts:144-150` — `SDR_FIRST_NAMES_LOWER = new Set(["christie", "andrew", "james", "josh", "omar"])`.
- `lib/sdr.ts:14-20` (comment block) acknowledges the duplication and prescribes manual sync, but doesn't list all three sites.
- The classifier prompt (file: `trigger/prompts/classify-reply.md`, not opened here but referenced) is fed the list at runtime via `classify.ts:193` — so consuming a single source from the prompt-input layer is correct.

**Expected behavior**
A single canonical `SDR_FIRST_NAMES` constant. Other modules import it. A unit test asserts integrity (e.g. that `mappers.ts`'s lowercased Set is a faithful derivation of the canonical list).

**Suggested fix**
1. Promote `lib/sdr.ts` to be the canonical source.
2. Replace the duplicate in `trigger/lib/classify.ts:50` with `import { SDR_FIRST_NAMES } from "../../lib/sdr.js";` (the lib/ → trigger/ directional split is fine: `lib/sdr.ts` contains nothing that pulls in Next-only code).
3. Replace the third copy in `trigger/lib/mappers.ts:144-150` with:
   ```ts
   import { SDR_FIRST_NAMES } from "../../lib/sdr.js";
   const SDR_FIRST_NAMES_LOWER = new Set(SDR_FIRST_NAMES.map((n) => n.toLowerCase()));
   ```
4. Remove the "keep in sync" warning from the `lib/sdr.ts` docstring; replace with a one-liner that this is the single source.
5. Add a unit test confirming the import direction and case-folding behavior:
   ```ts
   it("SDR_FIRST_NAMES_LOWER mirrors SDR_FIRST_NAMES, lowercased", () => {
     expect([...SDR_FIRST_NAMES_LOWER].sort())
       .toEqual(SDR_FIRST_NAMES.map((n) => n.toLowerCase()).sort());
   });
   ```

This kind of pure-data deduplication is exactly the simplification the project's `simplify` skill is for — three duplicate lines is a smell, but here we've got three across three modules.

**Acceptance criteria**
- [ ] Only one declaration of the SDR allowlist exists in the repo.
- [ ] Adding a new SDR requires editing one file.
- [ ] A test prevents future re-introduction of duplicate declarations (or the imports themselves are the test).
- [ ] All existing classify / ingest / wall behavior is unchanged.
