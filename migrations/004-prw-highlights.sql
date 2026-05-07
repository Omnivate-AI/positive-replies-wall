-- Migration 004 — multi-highlight support: parallel `prw_highlights` table.
--
-- Why: M10 review feedback (2026-05-07). The single `prw_threads.highlight_text`
-- column couldn't represent more than one praise span per reply, and the
-- admin UI's textarea+Save pattern around it had a race that wiped freshly-
-- set highlights. Switching to a list table mirrors the proven prw_redactions
-- pattern: each highlight is a row, admin gets card-based add/delete, and
-- multiple highlight phrases per thread are first-class.
--
-- prw_threads.highlight_text is INTENTIONALLY KEPT (not dropped). It becomes
-- a dormant audit-trail column — the new code reads + writes prw_highlights
-- exclusively. We can drop it in a follow-up migration once we're confident
-- there's no rollback need.
--
-- Backfill order matters:
--   1. auto_classifier rows from prw_classifications.suggested_highlight_text
--      (the canonical "what the model picked" layer)
--   2. admin rows from prw_threads.highlight_text where the value isn't
--      already in prw_highlights (so admin overrides become source=admin)
--
-- Where the same string exists in both layers, the auto_classifier row
-- wins via ON CONFLICT DO NOTHING — admin can re-add it later if they
-- want it surface-attributed differently. Acceptable: the UI doesn't
-- show source attribution to visitors, only to admins.

BEGIN;

CREATE TABLE prw_highlights (
  id BIGSERIAL PRIMARY KEY,
  thread_id BIGINT NOT NULL REFERENCES prw_threads (id) ON DELETE CASCADE,

  -- The verbatim phrase to wrap in the purple wash on the public wall.
  -- Renderer searches the cleaned reply text for this string and wraps
  -- every occurrence; multiple highlights per thread mean multiple
  -- wrapped spans on the same card.
  text TEXT NOT NULL,

  -- 'auto_classifier' = the classifier's suggested_highlight_text, copied
  --                     here at classify time (immutable in the admin UI)
  -- 'admin'           = manually added by an admin (deletable)
  source TEXT NOT NULL DEFAULT 'admin'
    CHECK (source IN ('auto_classifier', 'admin')),

  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (thread_id, text)
);

CREATE INDEX prw_highlights_thread_idx ON prw_highlights (thread_id);

COMMENT ON TABLE prw_highlights IS
  'Per-thread phrases to wrap in a quiet purple wash on the public wall. Parallel to prw_redactions: auto_classifier source from the classifier, admin source from manual curation. Multiple highlights per thread.';
COMMENT ON COLUMN prw_highlights.text IS
  'Verbatim phrase. Renderer wraps every occurrence in the cleaned reply text. The wall uses the FIRST highlight found as the truncation anchor.';

-- ============================================================================
-- Backfill 1: auto_classifier from prw_classifications.suggested_highlight_text
-- ============================================================================
INSERT INTO prw_highlights (thread_id, text, source)
SELECT DISTINCT thread_id, suggested_highlight_text, 'auto_classifier'
FROM prw_classifications
WHERE suggested_highlight_text IS NOT NULL
  AND length(trim(suggested_highlight_text)) > 0
ON CONFLICT (thread_id, text) DO NOTHING;

-- ============================================================================
-- Backfill 2: admin from prw_threads.highlight_text (skip if already inserted)
-- ============================================================================
INSERT INTO prw_highlights (thread_id, text, source)
SELECT id, highlight_text, 'admin'
FROM prw_threads
WHERE highlight_text IS NOT NULL
  AND length(trim(highlight_text)) > 0
ON CONFLICT (thread_id, text) DO NOTHING;

COMMIT;
