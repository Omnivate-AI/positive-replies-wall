-- Migration 005 — backfill match_type='word_boundary' on auto_lead redactions
--
-- Context: ticket #013. The renderer routes redactions by match_type;
-- single-token short names need word_boundary so e.g. lead "Hari" doesn't
-- mask "hari" inside "sharing".
--
-- The schema column already exists (003-restructure-threads.sql) with a
-- check constraint allowing 'literal' | 'word_boundary'. New rows written
-- after Batch 3 already get word_boundary correctly. This migration
-- backfills rows still at the default 'literal'.
--
-- Heuristic mirror of trigger/lib/mappers.ts:inferMatchType:
--   - has whitespace → literal (multi-token names)
--   - has '@' or '.' → literal (emails, domains)
--   - else            → word_boundary (single-token names)
--
-- Two-step to handle the case where a (thread_id, text) pair has BOTH a
-- legacy 'literal' row AND a newer 'word_boundary' row (the latter from
-- a re-ingest that ran after Batch 3 shipped). The unique constraint on
-- (thread_id, text, match_type) means we can't simply UPDATE one to the
-- other — it'd collide. Instead:
--
--   Step 1: Delete literal rows where a word_boundary equivalent exists.
--           The word_boundary row already covers the same text; the
--           literal one is redundant.
--   Step 2: Update remaining literal rows to word_boundary.
--
-- Idempotent: re-runs are no-ops once the backfill has converged.

BEGIN;

DELETE FROM prw_redactions
WHERE source = 'auto_lead'
  AND match_type = 'literal'
  AND text !~ '[[:space:]]'
  AND text !~ '[@.]'
  AND EXISTS (
    SELECT 1 FROM prw_redactions r2
    WHERE r2.thread_id = prw_redactions.thread_id
      AND r2.text = prw_redactions.text
      AND r2.match_type = 'word_boundary'
  );

UPDATE prw_redactions
SET match_type = 'word_boundary'
WHERE source = 'auto_lead'
  AND match_type = 'literal'
  AND text !~ '[[:space:]]'
  AND text !~ '[@.]';

COMMIT;

-- Verification query (manual, post-migration):
--   SELECT match_type, COUNT(*) FROM prw_redactions
--   WHERE source = 'auto_lead' GROUP BY match_type;
-- A healthy outcome shows both literal (multi-token names + emails) and
-- word_boundary (first names, last names, single-word company names),
-- with no (thread_id, text) pair appearing in both buckets.
