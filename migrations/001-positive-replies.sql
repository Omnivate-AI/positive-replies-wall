-- M5 schema for positive-replies-wall.
-- All tables prefixed `prw_` to avoid collision with the 117 existing tables
-- in the shared Omnivate Supabase project (uivgowblojtyiobhgjlv).
--
-- Decisions captured here:
--   * Redactions stored as strings (literal text spans), not {start,end} offsets.
--     Rationale: matches click-and-drag admin UX (selection IS the string), robust
--     to HTML-to-text reflow that breaks character offsets, and masks all
--     occurrences automatically. Trade-off accepted: cannot selectively mask
--     one occurrence of a recurring word and leave another visible.
--   * Classifications keyed on (reply_id, prompt_version) so re-classification
--     with a new prompt is non-destructive — old scores stay queryable.
--   * Sort key for the public wall is reply_received_at DESC (per M4 rule:
--     chronological, not score-ranked). display_priority is an admin override
--     for pinning, not the default sort.

-- ============================================================================
-- prw_replies: canonical positive-reply payload from Smartlead
-- ============================================================================
CREATE TABLE prw_replies (
  id BIGSERIAL PRIMARY KEY,

  -- Smartlead identifiers (the dedup key is smartlead_message_id)
  smartlead_message_id TEXT UNIQUE NOT NULL,
  smartlead_lead_id BIGINT NOT NULL,
  smartlead_campaign_id BIGINT NOT NULL,
  smartlead_client_id BIGINT,
  smartlead_stats_id TEXT,

  -- The actual reply message (type = REPLY in Smartlead's message thread)
  reply_from_email TEXT NOT NULL,
  reply_to_email TEXT,
  reply_subject TEXT,
  reply_body_html TEXT NOT NULL,
  reply_received_at TIMESTAMPTZ NOT NULL,

  -- Lead context (the prospect we originally targeted)
  lead_email TEXT,
  lead_first_name TEXT,
  lead_last_name TEXT,
  lead_company_name TEXT,
  lead_company_url TEXT,
  lead_linkedin_profile TEXT,
  lead_category_id INTEGER,

  -- Smartlead unibox deep link
  unibox_url TEXT,

  -- Raw payload preservation (brief: "raw Smartlead JSON for safety")
  raw_lead_json JSONB,
  raw_message_json JSONB,

  -- Bookkeeping
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL DEFAULT 'smartlead'
);

CREATE INDEX prw_replies_received_at_idx ON prw_replies (reply_received_at DESC);
CREATE INDEX prw_replies_campaign_idx ON prw_replies (smartlead_campaign_id);
CREATE INDEX prw_replies_client_idx ON prw_replies (smartlead_client_id);
CREATE INDEX prw_replies_lead_category_idx ON prw_replies (lead_category_id);

COMMENT ON TABLE prw_replies IS
  'Canonical positive-reply payloads ingested from Smartlead. Filtered to lead_category_id=1 (Interested) at ingest. Idempotent via UNIQUE(smartlead_message_id).';
COMMENT ON COLUMN prw_replies.reply_received_at IS
  'Reply timestamp from Smartlead messages.time. Primary sort key for the public wall (per M4: chronological, not score-ranked).';
COMMENT ON COLUMN prw_replies.reply_from_email IS
  'Sender of THIS reply message. May differ from lead_email when the prospect forwarded the original outreach (see M2 finding: Mark Richards → Jordan Heru forward example).';

-- ============================================================================
-- prw_classifications: AI scoring output per (reply, prompt_version)
-- ============================================================================
CREATE TABLE prw_classifications (
  id BIGSERIAL PRIMARY KEY,
  reply_id BIGINT NOT NULL REFERENCES prw_replies (id) ON DELETE CASCADE,

  -- M4 rubric sub-scores
  praise_score INTEGER NOT NULL CHECK (praise_score BETWEEN 0 AND 30),
  specificity_score INTEGER NOT NULL CHECK (specificity_score BETWEEN 0 AND 25),
  authenticity_score INTEGER NOT NULL CHECK (authenticity_score BETWEEN 0 AND 25),
  standalone_score INTEGER NOT NULL CHECK (standalone_score BETWEEN 0 AND 20),
  total_score INTEGER GENERATED ALWAYS AS
    (praise_score + specificity_score + authenticity_score + standalone_score) STORED,

  -- The publish-worthy flag at the M4 threshold (>=55). Stored explicitly so we can
  -- shift the threshold without re-classifying.
  is_high_quality BOOLEAN NOT NULL,

  -- M4 categories: 1=Superlative, 2=Personalization, 3=Skeptic, 4=Conversion-with-Compliment, 5=Brief-Acknowledgment
  -- A reply can match multiple.
  categories TEXT[] NOT NULL DEFAULT '{}'::TEXT[],

  -- Model's reasoning trace, for human audit on borderline cases
  reasoning TEXT,

  -- e.g. "v1.0", "v1.1-tightened-praise". Lets us evolve the prompt without losing history.
  prompt_version TEXT NOT NULL,

  classified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (reply_id, prompt_version)
);

CREATE INDEX prw_classifications_high_quality_idx
  ON prw_classifications (is_high_quality, total_score DESC);
CREATE INDEX prw_classifications_reply_idx ON prw_classifications (reply_id);

COMMENT ON TABLE prw_classifications IS
  'AI classifier output per reply per prompt version. Multiple rows per reply allowed (one per prompt_version) so re-classification is non-destructive.';

-- ============================================================================
-- prw_publish_state: 1:1 with prw_replies. Admin curation state.
-- ============================================================================
CREATE TABLE prw_publish_state (
  reply_id BIGINT PRIMARY KEY REFERENCES prw_replies (id) ON DELETE CASCADE,

  is_published BOOLEAN NOT NULL DEFAULT FALSE,

  -- Admin override for pinning. Higher = more prominent. Default 0 (no pin).
  -- Public page sorts by reply_received_at DESC; display_priority overrides for pinned items.
  display_priority INTEGER NOT NULL DEFAULT 0,

  published_at TIMESTAMPTZ,
  edited_by TEXT,
  edited_at TIMESTAMPTZ
);

CREATE INDEX prw_publish_state_published_idx
  ON prw_publish_state (is_published, display_priority DESC);

COMMENT ON TABLE prw_publish_state IS
  'Per-reply admin curation state. Public wall reads only WHERE is_published = true.';

-- ============================================================================
-- prw_redactions: 1:N with prw_replies. Spans to mask at render time.
-- ============================================================================
CREATE TABLE prw_redactions (
  id BIGSERIAL PRIMARY KEY,
  reply_id BIGINT NOT NULL REFERENCES prw_replies (id) ON DELETE CASCADE,

  -- The literal string to mask in rendered output. prw_replies.reply_body_html stays intact.
  text TEXT NOT NULL,

  -- 'literal' = direct substring replace (current ingest writes only this)
  -- 'word_boundary' = match whole words only (future-proofing)
  match_type TEXT NOT NULL DEFAULT 'literal'
    CHECK (match_type IN ('literal', 'word_boundary')),

  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (reply_id, text, match_type)
);

CREATE INDEX prw_redactions_reply_idx ON prw_redactions (reply_id);

COMMENT ON TABLE prw_redactions IS
  'Per-reply admin-marked spans to mask at render time. Original text in prw_replies stays untouched. M9 renderer applies these as solid black bars (per M4 redaction policy).';

-- ============================================================================
-- prw_ingest_runs: bookkeeping for the M5 ingestion task (used by M11 monitoring)
-- ============================================================================
CREATE TABLE prw_ingest_runs (
  id BIGSERIAL PRIMARY KEY,

  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),

  -- Coverage stats for this run
  clients_seen INTEGER NOT NULL DEFAULT 0,
  campaigns_seen INTEGER NOT NULL DEFAULT 0,
  leads_seen INTEGER NOT NULL DEFAULT 0,
  replies_seen INTEGER NOT NULL DEFAULT 0,
  replies_inserted INTEGER NOT NULL DEFAULT 0,
  replies_skipped_existing INTEGER NOT NULL DEFAULT 0,

  error_message TEXT,
  trigger_run_id TEXT
);

CREATE INDEX prw_ingest_runs_started_idx ON prw_ingest_runs (started_at DESC);

COMMENT ON TABLE prw_ingest_runs IS
  'One row per execution of the M5 ingestion task. Used for M11 monitoring + debugging coverage gaps.';
