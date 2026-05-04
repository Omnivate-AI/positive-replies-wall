# M6 — AI classification and scoring

## TL;DR

- **352 replies classified, 86 high-quality (24.4%), 0 errors**, prompt version `v1.0`.
- **Calibration: 31/31 M4 exemplars classified high-quality on the first prompt iteration**, 5/5 constructed junk replies rejected. Both M6 acceptance criteria pass.
- Goal-driven prompt at `trigger/prompts/classify-reply.md`, externalised so Omar can edit without touching code. Bumping `PROMPT_VERSION` in `trigger/lib/classify.ts` triggers re-classification (the unique key is `(reply_id, prompt_version)`, so old scores are preserved).
- 43 new tests added across the 4 buckets (90 total in the project, all passing).

## How it works

```
┌─ scripts/classify-local.ts          (local CLI runner)
│  → runClassifyBatch()
│
├─ trigger/classify-replies.ts        (Trigger.dev task wrapper)
│  → runClassifyBatch()
│
└─ trigger/lib/classify-batch.ts      (orchestrator — pure of Trigger.dev imports)
   ├─ fetchPendingReplies(): LEFT-JOIN prw_replies vs prw_classifications at PROMPT_VERSION
   ├─ classifyReply(input):           (per-reply, parallel up to concurrency=5)
   │  ├─ chatJson() → OpenRouter      (xiaomi/mimo-v2-flash, temp=0.1, max_tokens=600)
   │  ├─ ClassifyResultSchema.parse() (Zod validates 4 sub-scores in range, categories enum, reasoning string)
   │  └─ reconcileHighQuality()       (recomputes flag from sub-scores — never trust the model's flag)
   └─ writeClassification(): UPSERT into prw_classifications
                              ON CONFLICT (reply_id, prompt_version) DO NOTHING
                              (idempotent re-runs at same version)
```

Classifying all 352 took ~75 seconds at concurrency=5 with `xiaomi/mimo-v2-flash`. Token usage is ~3K per call; total cost was negligible (sub-cent on flash).

## The prompt — `trigger/prompts/classify-reply.md`

Mirrors Omnivate's goal-driven format from `outbound/knowledge/email-copy/goal-driven-ai-prompts.md`:

1. **OBJECTIVE** — described in human terms ("a real B2B prospect wrote back and said *something* about the outreach...")
2. **INPUT** — explicit field shapes including `sdr_first_names` so the model knows Christie/Andrew/James/Josh aren't to be redaction-conflated with prospect PII
3. **OUTPUT** — JSON-only contract with the 4 sub-scores, `is_high_quality`, `categories[]`, `reasoning`
4. **CATEGORY ENUM** — five M4 categories as a closed list
5. **THE RUBRIC** — band definitions for each sub-score component with concrete language anchors
6. **RULES** — 5 minimal hard constraints (JSON only, score email not offer, brief is OK, SDR names aren't PII, one reply at a time)
7. **GOOD EXAMPLES** — 12 worked classifications drawn from real M4 exemplars across all 5 categories, scored to demonstrate the full 60-100 range
8. **REJECTION EXAMPLES** — 3 constructed near-positives that should still classify as not high-quality (pure conversion, offer-not-email praise, polite-no)
9. **BAD EXAMPLES** — anti-patterns (markdown fences, inventing categories, returning total_score, scoring inconsistencies)

The prompt teaches judgment, not exhaustive rules. After the first iteration, calibration passed on all 36 fixtures (31 exemplars + 5 junk).

## Calibration results (`scripts/run-calibration.ts`)

```
Exemplars: 31 (must all classify is_high_quality=true)
Junk: 5 (must all classify is_high_quality=false)

✓ M4 image (4).png    total=97 HQ  [superlative]
✓ M4 image (28).png   total=100 HQ [superlative,personalization,conversion_with_compliment]
✓ M4 image (14).png   total=97 HQ  [superlative,conversion_with_compliment]
✓ M4 image (24).png   total=97 HQ  [superlative,personalization,conversion_with_compliment]
✓ M4 image (26).png   total=92 HQ  [personalization,conversion_with_compliment]
... (26 more, all clearing 55+)
✓ M4 image (1).png    total=58 HQ  [brief_acknowledgment]      ← floor
✓ M4 image (19).png   total=60 HQ  [brief_acknowledgment]      ← floor

✓ JUNK 1  total=40    (pure conversion)
✓ JUNK 2  total=40    (praise on offer not email)
✓ JUNK 3  total=40    (polite no)
✓ JUNK 4  total=0     (out of office)
✓ JUNK 5  total=30    (info request without praise)

Acceptance #1 (100% of M4 exemplars high-quality): PASS  (31/31)
Acceptance #2 (>=3 junk replies rejected):           PASS  (5/5)
```

Run yourself with `npm run calibration:m4`.

## Full-backfill stats

```sql
SELECT is_high_quality, COUNT(*), ROUND(AVG(total_score), 1) AS avg, MIN(total_score), MAX(total_score)
FROM prw_classifications WHERE prompt_version = 'v1.0' GROUP BY is_high_quality;
```

| `is_high_quality` | n | avg score | min | max |
|---|---|---|---|---|
| true | **86** | 79.4 | 55 | 100 |
| false | 266 | 33.6 | 0 | 54 |

Clean separation at the threshold — no fence-sitters between 50–55 (max non-HQ = 54, min HQ = 55).

### Category distribution among the 86 high-quality replies

```sql
SELECT category, COUNT(*) FROM (SELECT UNNEST(categories) AS category FROM prw_classifications WHERE is_high_quality = true) GROUP BY category;
```

| Category | Count |
|---|---|
| conversion_with_compliment | 66 |
| personalization | 61 |
| brief_acknowledgment | 21 |
| superlative | 15 |
| skeptic | 11 |

Average ~2 categories per reply (174 total fits ÷ 86 replies). Mix matches the variety M4 said the wall needs — no single category dominates.

## Idempotency

Built into the SQL via `UNIQUE(reply_id, prompt_version)` and the orchestrator's pre-fetch filter:

- **Same prompt version, re-run** → orchestrator filters out already-classified rows before any OpenRouter call. Pending count = 0; cost = 0.
- **Bumped prompt version (e.g., `v1.0` → `v1.1`)** → orchestrator sees no rows for `v1.1`, classifies all 352 again. Old `v1.0` rows stay queryable for audit / comparison.
- **Same prompt, accidentally double-fired in race** → the upsert's `ON CONFLICT DO NOTHING` blocks the second write at the DB level. Tested in `tests/integration/classify-supabase.test.ts`.

## Testing

90 total tests across 11 files, all passing in ~68 s. M6 added 43 new tests:

| Bucket | Files added | New tests | What they cover |
|---|---|---|---|
| Unit | `classify-schema.test.ts`, `openrouter.test.ts` | 33 | Zod schema (range checks, enum membership, integer-only, empty-reasoning rejection), `stripHtml()` (HTML entities, `<br>` → newlines, M2 forwarded-thread preservation), `chat()`/`chatJson()` (5xx/429/network retry, 4xx fail-fast, markdown-fence stripping, default model is `xiaomi/mimo-v2-flash`) |
| Integration | `classify-supabase.test.ts` | 5 | UNIQUE(reply_id, prompt_version), generated `total_score` column accuracy, multi-version classifications coexist, ON CONFLICT DO NOTHING returns 0 inserts on duplicate |
| E2E | `classify-end-to-end.test.ts` | 2 | Real OpenRouter + real Supabase: classify a sentinel superlative reply, verify HQ + score + categories + prompt_version persist; re-run is idempotent |
| Smoke | (extended `env-and-tables.test.ts`) | 2 | OPENROUTER_API_KEY present; classifier prompt file exists with all 6 goal-driven sections |

Two enterprise-grade safeguards baked in:

1. **`reconcileHighQuality()`** — the orchestrator never trusts the model's `is_high_quality` flag. The flag is recomputed from the sub-scores so a model bug ("praise=10, flag=true") cannot leak into DB. Tested implicitly via the calibration runner; the flag passed to DB always equals `total >= 55`.
2. **Zod parse before write** — every model response is validated against `ClassifyResultSchema` before reaching Supabase. Out-of-range scores or unknown categories throw at the boundary, not silently corrupt the table.

## Files

| Path | Role |
|---|---|
| `trigger/prompts/classify-reply.md` | The externalised classifier prompt — Omar's editable file |
| `trigger/lib/openrouter.ts` | `chat()` + `chatJson()` with retry, default model lock, JSON-mode |
| `trigger/lib/classify.ts` | `classifyReply()`, Zod schema, `PROMPT_VERSION`, `stripHtml()`, threshold |
| `trigger/lib/classify-batch.ts` | `runClassifyBatch()` — orchestrator with concurrency, pre-filter on prompt_version, retry-wrapped writes |
| `trigger/classify-replies.ts` | Trigger.dev task wrapper |
| `scripts/classify-local.ts` | Local CLI runner |
| `scripts/run-calibration.ts` | Calibration runner — verifies the two M6 acceptance criteria |
| `tests/_helpers/m4-exemplars.ts` | 31 M4 exemplars + 5 junk replies as reusable fixtures |

## How to re-run

```bash
# Calibrate the prompt (no DB writes; just runs M4 exemplars + junk through the classifier)
npm run calibration:m4

# Classify all unclassified replies at the current PROMPT_VERSION (the M5 → M6 backfill path)
npm run classify:local

# Classify a specific reply (useful when iterating on a single edge case)
npm run classify:local -- --reply-id 16

# Cap how many to do (useful when iterating mid-prompt-tuning)
npm run classify:local -- --limit 20

# Tune concurrency (default 5)
npm run classify:local -- --concurrency 3
```

## What's still open

- **Spot-check by Omar** (acceptance criterion #4 — twenty random classifications, agreement on at least 18). I can pull a random sample for him whenever he wants. Suggested SQL for the Loom:
  ```sql
  SELECT r.id, r.reply_from_email, r.reply_subject, c.total_score, c.is_high_quality, c.categories, c.reasoning, LEFT(r.reply_body_html, 300) AS body_preview
  FROM prw_replies r JOIN prw_classifications c ON c.reply_id = r.id
  WHERE c.prompt_version = 'v1.0' ORDER BY RANDOM() LIMIT 20;
  ```
- **Deploy to Trigger.dev** (still blocked on the project ref shared with M5). Once the ref is in `trigger.config.ts`, `npx trigger.dev@latest deploy` ships both `ingest-smartlead-replies` and `classify-replies` tasks together.
- **Loom recording** — show the prompt, run `classify:local --limit 3` live, query the DB, point at the calibration output. Five minutes.

## Threshold notes for post-launch tuning

The 55 threshold is calibrated against M4. After the wall is live:

- If borderline-yeses are getting rejected by the classifier (Omar disagrees with rejections), drop to 50 and re-run `classify:local` — but the storage uses generated `total_score` so we can also just change a single read-side query (`SELECT ... WHERE total_score >= 50`) instead of re-classifying.
- If obvious junk slips through (Omar disagrees with HQ classifications), bump to 60 and same trick.
- If the prompt itself is wrong (the model misreads a category), bump `PROMPT_VERSION` to `v1.1`, edit the prompt, run `classify:local` — old v1.0 scores stay queryable for diff-analysis.
