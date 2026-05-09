-- Migration 005 — drop the dormant prw_threads.highlight_text column.
--
-- Context:
--   Migration 003 introduced `prw_threads.highlight_text` as the single
--   killer-phrase store for each thread. Migration 004 (M10 review) replaced
--   it with the parallel `prw_highlights` table to support multiple
--   highlights per thread + source attribution (auto_classifier vs admin).
--   The migration-004 commit explicitly KEPT the column as a dormant
--   audit-trail / rollback safety, with a note to drop it once the
--   multi-highlight schema had been stable.
--
--   That stability bar is met:
--   - No code path in this repo reads or writes `prw_threads.highlight_text`
--     (verified by grep against the codebase 2026-05-07).
--   - All 250 production classifications under v2.0 wrote highlights into
--     `prw_highlights` exclusively.
--   - The e2e test that USED to read from this column was already migrated
--     to query `prw_highlights` (see commit affed43, 2026-05-07).
--   - `prw_highlights.source` is a strict superset of any audit value the
--     dropped column could have provided (it distinguishes
--     auto_classifier / admin sources per highlight, the column never did).
--
-- Effect:
--   - Drops the column. Rows are deleted alongside.
--   - Anyone who manually wrote `highlight_text` overrides between
--     migration 003 and migration 004 has them preserved as
--     `prw_highlights.source='admin'` rows from migration 004's backfill.
--
-- This is irreversible without restoring from a Supabase point-in-time
-- backup. Apply during a low-traffic window.

BEGIN;

ALTER TABLE prw_threads DROP COLUMN IF EXISTS highlight_text;

COMMIT;
