-- Migration 003 — restructure to thread + messages model.
--
-- DESTRUCTIVE. Drops prw_replies, prw_classifications, prw_redactions,
-- prw_publish_state, prw_ingest_runs and recreates the first four under a new
-- shape. The 339 rows ingested under v1.x are discarded; ingest is re-run from
-- Smartlead afterwards (the previous ingest didn't persist outbound SENT
-- messages separately, so re-fetching is simpler than backfilling).
--
-- Why the restructure (Omar 2026-05-06):
--   The wall-of-praise visitor only ever needs the highlighted phrase on the
--   public surface, but internally we want to study WHAT WE SAID that earned
--   each positive reply. That requires storing the whole conversation, not
--   just the inbound reply row.
--
-- Shape:
--   prw_threads (1)        — one row per qualifying conversation
--     ├── prw_messages (N) — every email in the thread, both directions
--     ├── prw_classifications (1 per prompt_version)
--     ├── prw_redactions (N) — black-bar spans (auto + admin)
--     └── prw_publish_state (1) — admin curation
--
-- Cross-repo links (sibling outbound repo, same Supabase project):
--   * campaign_registry — unified Smartlead campaign table; FK target
--   * <client>_leads tables — sharded per client; SOFT polymorphic link only
--     (lead_table TEXT + lead_id BIGINT). Match key on ingest:
--     linkedin_url OR email.
--
-- prw_ingest_runs is dropped outright (per-run bookkeeping not load-bearing).

BEGIN;

-- ============================================================================
-- 1. Drop the old prw_* shape (children first)
-- ============================================================================
DROP TABLE IF EXISTS prw_redactions;
DROP TABLE IF EXISTS prw_publish_state;
DROP TABLE IF EXISTS prw_classifications;
DROP TABLE IF EXISTS prw_replies;
DROP TABLE IF EXISTS prw_ingest_runs;

-- ============================================================================
-- 2. prw_threads — one row per (lead × campaign) where we have a positive reply
-- ============================================================================
CREATE TABLE prw_threads (
  id BIGSERIAL PRIMARY KEY,

  -- Smartlead identifiers (dedup key)
  smartlead_lead_id BIGINT NOT NULL,
  smartlead_campaign_id BIGINT NOT NULL,
  smartlead_client_id BIGINT,
  smartlead_campaign_lead_map_id BIGINT,

  -- Cross-repo FK to outbound's campaign_registry. Nullable: not every
  -- Smartlead campaign has been auto-discovered into campaign_registry yet.
  -- ON DELETE SET NULL so a campaign cleanup doesn't take threads down with it.
  campaign_registry_id INTEGER REFERENCES campaign_registry (id) ON DELETE SET NULL,

  -- Soft polymorphic lead reference (leads are sharded per-client in outbound).
  -- Populated when ingest can match (linkedin_url OR email) against the
  -- campaign's client lead_table. Null when no match.
  lead_table TEXT,
  lead_id BIGINT,

  -- Denormalized lead/company snapshot (resilient to upstream deletes/changes).
  lead_first_name TEXT,
  lead_last_name TEXT,
  lead_email TEXT NOT NULL,
  lead_title TEXT,
  lead_linkedin_url TEXT,
  company_name TEXT,
  company_website TEXT,
  company_linkedin_url TEXT,

  -- Smartlead unibox deep link for admin click-through
  unibox_url TEXT,

  -- Public-wall highlight (the killer phrase shown on the wall).
  -- Populated by classifier on first run; admin-editable thereafter.
  -- The truncated excerpt is computed at render time from this + the
  -- qualifying reply body — not stored.
  highlight_text TEXT,

  -- Bookkeeping
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL DEFAULT 'smartlead',

  UNIQUE (smartlead_lead_id, smartlead_campaign_id)
);

CREATE INDEX prw_threads_campaign_registry_idx
  ON prw_threads (campaign_registry_id);
CREATE INDEX prw_threads_lead_lookup_idx
  ON prw_threads (lead_table, lead_id);
CREATE INDEX prw_threads_lead_email_idx
  ON prw_threads (lead_email);
CREATE INDEX prw_threads_lead_linkedin_idx
  ON prw_threads (lead_linkedin_url);

COMMENT ON TABLE prw_threads IS
  'One row per qualifying positive-reply conversation. Replaces prw_replies. Dedup key (smartlead_lead_id, smartlead_campaign_id). Soft polymorphic lead link via (lead_table, lead_id) because outbound leads are sharded per-client.';
COMMENT ON COLUMN prw_threads.highlight_text IS
  'The killer phrase shown on the public wall. Auto-populated by classifier (suggested_highlight_text) on first run; admin-editable. Excerpt is computed at render time, not stored.';
COMMENT ON COLUMN prw_threads.lead_table IS
  'Sibling outbound repo lead-table name (e.g. pantheon_leads, valda_leads). Null when ingest could not match the lead. See client_analytics_config.lead_table for resolution.';

-- ============================================================================
-- 3. prw_messages — every email in the thread (outbound + inbound)
-- ============================================================================
CREATE TABLE prw_messages (
  id BIGSERIAL PRIMARY KEY,
  thread_id BIGINT NOT NULL REFERENCES prw_threads (id) ON DELETE CASCADE,

  -- Smartlead identifiers. message_id is globally unique per Smartlead.
  smartlead_message_id TEXT UNIQUE,
  smartlead_stats_id TEXT,
  smartlead_email_seq_number INTEGER,  -- step in the sequence (1, 2, 3, ...) for outbound

  -- Direction + role within the thread.
  direction TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  is_qualifying_reply BOOLEAN NOT NULL DEFAULT FALSE,

  -- Sender identity. Outbound 'from' is a client SDR's mailbox (we send on
  -- behalf of clients) — NOT Omnivate. Inbound 'from' is the lead.
  from_name TEXT,
  from_email TEXT NOT NULL,
  to_email TEXT,

  -- Content
  subject TEXT,
  body_html TEXT,
  body_text TEXT,

  -- Timing. For outbound: when WE sent. For inbound: when the lead replied.
  sent_at TIMESTAMPTZ NOT NULL,

  -- Raw payload preservation
  raw_smartlead_json JSONB,

  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX prw_messages_thread_seq_idx
  ON prw_messages (thread_id, sent_at);
CREATE INDEX prw_messages_direction_idx
  ON prw_messages (thread_id, direction);

-- Enforce: at most one qualifying reply per thread.
CREATE UNIQUE INDEX prw_messages_one_qualifying_per_thread
  ON prw_messages (thread_id) WHERE is_qualifying_reply;

COMMENT ON TABLE prw_messages IS
  'Every email in the thread — outbound steps 1..N AND every inbound. We pull the entire sequence regardless of when the qualifying reply landed, so the internal "what made them reply" view sees everything we sent.';
COMMENT ON COLUMN prw_messages.is_qualifying_reply IS
  'True for the single inbound message that earned this thread its place on the wall. Enforced unique-per-thread by partial index.';
COMMENT ON COLUMN prw_messages.from_email IS
  'Sender of THIS message. For direction=outbound, this is a client SDR''s mailbox (we send on behalf of clients). For direction=inbound, this is the lead (or a forwarded recipient).';

-- ============================================================================
-- 4. prw_classifications — AI scoring + classifier-suggested highlight/redactions
-- ============================================================================
CREATE TABLE prw_classifications (
  id BIGSERIAL PRIMARY KEY,
  thread_id BIGINT NOT NULL REFERENCES prw_threads (id) ON DELETE CASCADE,

  -- M4 rubric sub-scores (unchanged shape from migration 001)
  praise_score INTEGER NOT NULL CHECK (praise_score BETWEEN 0 AND 30),
  specificity_score INTEGER NOT NULL CHECK (specificity_score BETWEEN 0 AND 25),
  authenticity_score INTEGER NOT NULL CHECK (authenticity_score BETWEEN 0 AND 25),
  standalone_score INTEGER NOT NULL CHECK (standalone_score BETWEEN 0 AND 20),
  total_score INTEGER GENERATED ALWAYS AS
    (praise_score + specificity_score + authenticity_score + standalone_score) STORED,

  -- Publish-worthy flag at the M4 threshold (>=55). Stored explicitly so the
  -- threshold can shift without re-classifying.
  is_high_quality BOOLEAN NOT NULL,

  -- M4 categories (multi-valued)
  categories TEXT[] NOT NULL DEFAULT '{}'::TEXT[],

  -- AI-extracted prospect reply (quoted thread / mobile signatures stripped,
  -- mojibake normalized). Populated from v1.1 onward; the wall renders this.
  cleaned_reply_text TEXT,

  -- NEW for v2.x — classifier-suggested highlight + redactions. The thread's
  -- highlight_text column is the admin-final value; this is the original
  -- suggestion (audit trail; also the seed value before any admin edit).
  suggested_highlight_text TEXT,

  -- Third-party names mentioned in the reply that should be redacted on the
  -- public wall (e.g. someone the lead is talking about). Lead's own name and
  -- company are auto-redacted at ingest from the linked outbound lead row, so
  -- the classifier focuses on names IT sees in the body.
  suggested_redactions TEXT[] NOT NULL DEFAULT '{}'::TEXT[],

  -- Model's reasoning trace for human audit on borderline cases
  reasoning TEXT,

  -- e.g. "v2.0", "v2.1-tightened-praise". Lets us evolve the prompt without
  -- losing history.
  prompt_version TEXT NOT NULL,

  classified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (thread_id, prompt_version)
);

CREATE INDEX prw_classifications_high_quality_idx
  ON prw_classifications (is_high_quality, total_score DESC);
CREATE INDEX prw_classifications_thread_idx
  ON prw_classifications (thread_id);

COMMENT ON TABLE prw_classifications IS
  'AI classifier output per thread per prompt version. Multiple rows per thread allowed (one per prompt_version) so re-classification is non-destructive. Adds suggested_highlight_text + suggested_redactions in v2.x.';

-- ============================================================================
-- 5. prw_redactions — final spans to mask at render time
-- ============================================================================
CREATE TABLE prw_redactions (
  id BIGSERIAL PRIMARY KEY,
  thread_id BIGINT NOT NULL REFERENCES prw_threads (id) ON DELETE CASCADE,

  -- Literal string to mask in rendered output. Underlying body in
  -- prw_messages stays intact.
  text TEXT NOT NULL,

  -- 'literal' = direct substring replace
  -- 'word_boundary' = match whole words only (future-proofing)
  match_type TEXT NOT NULL DEFAULT 'literal'
    CHECK (match_type IN ('literal', 'word_boundary')),

  -- Where this redaction came from. Drives admin filtering and auto-cleanup
  -- if the lead/classifier output changes.
  --   auto_lead       — derived from the linked outbound lead row at ingest
  --                     (first_name, last_name, company_name)
  --   auto_classifier — third-party names detected by the classifier
  --   admin           — manually added/edited by Omar
  source TEXT NOT NULL DEFAULT 'admin'
    CHECK (source IN ('auto_lead', 'auto_classifier', 'admin')),

  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (thread_id, text, match_type)
);

CREATE INDEX prw_redactions_thread_idx ON prw_redactions (thread_id);

COMMENT ON TABLE prw_redactions IS
  'Per-thread spans to mask at render time. Auto-populated on ingest (lead first/last/company → source=auto_lead) and by classifier (third-party names → source=auto_classifier); admin-editable.';

-- ============================================================================
-- 6. prw_publish_state — admin curation (1:1 with prw_threads)
-- ============================================================================
CREATE TABLE prw_publish_state (
  thread_id BIGINT PRIMARY KEY REFERENCES prw_threads (id) ON DELETE CASCADE,

  is_published BOOLEAN NOT NULL DEFAULT FALSE,

  -- Admin override for pinning. Higher = more prominent. Default 0 (no pin).
  -- Public wall sorts by reply timestamp DESC; display_priority overrides for
  -- pinned items.
  display_priority INTEGER NOT NULL DEFAULT 0,

  published_at TIMESTAMPTZ,
  edited_by TEXT,
  edited_at TIMESTAMPTZ
);

CREATE INDEX prw_publish_state_published_idx
  ON prw_publish_state (is_published, display_priority DESC);

COMMENT ON TABLE prw_publish_state IS
  'Per-thread admin curation state. Public wall reads only WHERE is_published = true.';

COMMIT;
