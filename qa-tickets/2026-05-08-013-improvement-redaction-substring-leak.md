### [Improvement] Redactions are case-insensitive substring matches — short or common-word leads can mask innocent text

**Severity:** Medium
**Priority:** P2
**Status:** Closed
**Area:** `lib/redactions.tsx`, `migrations/003-restructure-threads.sql`

**Resolution:** End-to-end migration to typed redactions with explicit `match_type` per row.

- `lib/redactions.tsx` — `applyRedactions` now accepts `(string | RedactionEntry)[]`. String entries stay literal (backward compat for legacy callers and tests); typed entries route by `match_type`. New `inferMatchType(text)` heuristic exposed for callers that need to derive a default — single-token strings without `@`/`.` → `word_boundary`, everything else → `literal`.
- `components/email-reply-card.tsx` — `Redaction` type alias added; `EmailReplyCard.redactions`, `ReplyBody.redactions`, and `renderParagraph` all accept `Redaction[]`.
- `lib/supabase-public.ts` — `WallThread.redactions` typed as `RedactionEntry[]` (was `string[]`). `AdminThread.redactions` adds `match_type`. Both `getPublishedWallThreads` and `getAdminThreads` (and the legacy `getWallThreads` / `/m7/pocs`) project `match_type` from `prw_redactions`.
- `components/wall-grid.tsx` — handles typed redactions; supplementary defense-in-depth entries (SDR allowlist names, `from_display_name`, `from_email`, `to_email`) are added with appropriate `match_type` (allowlist → `word_boundary`; emails → `literal`; display name → heuristic via `inferMatchType`).
- `trigger/lib/mappers.ts` — `redactionsFromLead` returns `AutoLeadRedaction[]` with per-row `match_type`. The heuristic mirrors the renderer's `inferMatchType`. `trigger/lib/ingest.ts` writes the heuristic decision into `prw_redactions.match_type` instead of hard-coding `"literal"`.
- `migrations/005-redaction-word-boundary.sql` — backfill for existing `auto_lead` rows. UPDATEs rows where `text` has no whitespace/`@`/`.` to `match_type='word_boundary'`. Idempotent. **Not applied** in this commit (touches prod data; apply via the team's normal migration flow).
- Tests — `tests/unit/redactions.test.tsx` adds 6 new word_boundary cases (Ed/editor, Lee/feeling-Greeley-tunneling, Apple/pineapple, eli@xyz.com literal-with-punctuation, backwards-compat, mixed inputs) plus 3 cases covering `inferMatchType`. `tests/unit/mappers.test.ts` updated to the new tuple shape; adds a multi-token-company-name case. All 148/148 tests pass.

**Problem**
The redaction renderer (`lib/redactions.tsx:21-50`) and the email-reply-card highlight overlay (`components/email-reply-card.tsx:64-107`) match redaction strings as case-insensitive substrings of the body text:

```ts
const re = new RegExp(`(${escaped.join("|")})`, "gi");
```

`auto_lead` redactions are populated from the prospect's `first_name`, `last_name`, `company_name`, `email` (`trigger/lib/mappers.ts:159-167`). With a 2-character minimum (`mappers.ts:173`), short or common-word names will match nested in unrelated text:

- A lead named **"Ed"** redacts every occurrence of "Ed" in the body — including `editor`, `wedded`, `educated`, `embedded`, and dozens more.
- A lead named **"Lee"** redacts `feeling`, `Greeley`, `tunneling`.
- A lead with last name **"Lay"** redacts `display`, `delay`, `played`, `clay`, `relayed`.
- A lead at company **"Apple"** masks the literal word `apple` and `pineapple` and `dapple`.
- An email like `eli@xyz.com` blacks out `eligible`, `delight`, `relish` (the local part `eli` substrings into common words).

The DB schema (`migrations/003-restructure-threads.sql:227-229`) anticipates this with a `match_type` column allowing `'word_boundary'`, but the renderer only knows about `'literal'` (substring). No code path produces or consumes `word_boundary`. The column is dormant.

**Impact**
- **Visual noise on the wall.** A reply saying "I'm leading the team" with lead surname "Lee" renders as `I'm ███ding the team` — confusing, distracting, and undermines the wall's "verbatim, just redacted names" promise (`docs/m10-admin-and-public-wall.md` and the page hero at `app/page.tsx:101` literally say "Verbatim quotes ... Names redacted. Praise unedited.").
- **Information leak in the opposite direction.** The redacted bars expose the lead's name length, which combined with surrounding text can become identifying. With `Lee` masking `lee` substrings throughout, a reader sees pattern length 3 in three places — increasingly identifying.
- **Defense-in-depth angle.** The wall ships `from_display_name`, `from_email`, `to_email`, and the SDR allowlist into the mask set as a separate guarantee. That's the right defense pattern, but it doesn't help the body-content case where `auto_lead` short-name matches dominate.

The risk is bounded today (most leads are `Mauritz`, `Jordan`, `Justine`, etc. — multi-syllable European names), but a single short-named lead is enough to ship a buggy-looking card.

**Evidence**
- `lib/redactions.tsx:21-50` — substring regex, no word-boundary mode.
- `components/email-reply-card.tsx:64-107` — same pattern for highlights and the redaction overlay.
- `trigger/lib/mappers.ts:173` — `if (trimmed.length < 2) continue;` — only filters single chars; a 2-char lead like `Al` or `Jo` is allowed.
- `migrations/003-restructure-threads.sql:227-229`:
  ```sql
  match_type TEXT NOT NULL DEFAULT 'literal'
    CHECK (match_type IN ('literal', 'word_boundary')),
  ```
  Schema-level support for word_boundary; renderer ignores it.
- `migrations/003-restructure-threads.sql:218-244` — comment says "future-proofing" — the future case is now (M11 done, the wall is live).
- `docs/m10-admin-and-public-wall.md:11`: "Defense-in-depth redactions at render time: from_display_name, from_email, to_email, and the SDR allowlist are always added to the mask set even if they're not in prw_redactions."
- The frontend-engineer SKILL §10 (Accessibility — semantic HTML, contrast) and §20 (UX — clear visual hierarchy) both point at "the redaction bars should mean what users think they mean."

**Expected behavior**
- Single-name redactions (first name, last name, isolated tokens) match on **word boundaries** by default. So `Lee` matches `Lee` and `Lee.` and `Lee,` but not `feeling`.
- Multi-token or punctuation-bearing redactions (`Mauritz Gilfillan`, `apple.com`, `eli@xyz.com`) keep the literal substring behavior — they're already specific enough.
- The renderer routes by `match_type` — schema's already there; just teach the renderer.

**Suggested fix**
1. **Decide which auto_lead rows get `match_type='word_boundary'`** at write time:
   - First name alone → `word_boundary`.
   - Last name alone → `word_boundary`.
   - Company name → `literal` (companies often have words/punctuation that need substring).
   - Full email → `literal`.
   - Or a heuristic: if the trimmed string has no space, no punctuation, and length ≤ 8 → `word_boundary`. Else → `literal`.

2. **Update `trigger/lib/mappers.ts:redactionsFromLead`** to return `{ text, match_type }` tuples instead of bare strings, and update `trigger/lib/ingest.ts:262-282` to pass the `match_type` per row.

3. **Update `applyRedactions`** to accept the rows with their match_type, build separate regexes per mode, and apply word_boundary using `\\b` anchors. Same for the email-reply-card highlight overlay (it currently takes a flat `string[]` — update to the same shape).

4. **Update `getPublishedWallThreads()` and `getAdminThreads()`** to project `match_type` alongside text in the redaction arrays.

5. **Backfill**: a small migration (or a one-shot script) re-scoring existing auto_lead rows under the new heuristic — UPDATE prw_redactions SET match_type='word_boundary' WHERE source='auto_lead' AND ... matches the heuristic.

6. **Tests**: extend `tests/unit/redactions.test.tsx` with cases for `Ed`, `Lee`, `Apple` to prove word_boundary mode doesn't substring-leak.

**Acceptance criteria**
- [ ] A redaction string `Ed` does NOT mask the word `editor` in body text.
- [ ] A redaction string `eli@xyz.com` still masks the full email even when surrounded by punctuation.
- [ ] Existing tests for "Mauritz Gilfillan" and "example.com" continue to pass.
- [ ] At least 3 new unit tests cover the word-boundary cases.
- [ ] The renderer reads `match_type` from each redaction row and routes accordingly.
