-- Migration 005 — backfill match_type='word_boundary' on auto_lead redactions
--
-- Context: ticket #013. The renderer now routes redactions by match_type;
-- single-token short names need word_boundary so e.g. lead "Lee" doesn't
-- mask "feeling", "Greeley", "tunneling" in body text.
--
-- The schema column already exists (003-restructure-threads.sql) with the
-- check constraint allowing 'literal' | 'word_boundary'. This migration
-- updates rows already in the table so the renderer behaves correctly on
-- the existing wall before any new ingest.
--
-- Heuristic mirror of trigger/lib/mappers.ts:inferMatchType:
--   - has whitespace → literal (multi-token names)
--   - has '@' or '.' → literal (emails, domains)
--   - else            → word_boundary (single-token names)
--
-- Idempotent: runs only against rows still at the default 'literal'. Re-runs
-- are no-ops.

BEGIN;

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
-- word_boundary (first names, last names, single-word company names).
