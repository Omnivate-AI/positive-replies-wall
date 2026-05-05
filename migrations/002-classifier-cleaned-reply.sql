-- Migration 002 — add cleaned_reply_text column to prw_classifications.
--
-- Background: the M6 v1.0 classifier scored against the full Smartlead body,
-- including any quoted thread / forwarded blocks / mobile auto-signatures the
-- prospect's mail client appended. The M7 quiz UI then ran a brittle regex
-- (extractReplyOnly) to TRIM the trail before showing it to Omar — so the AI
-- and the human were judging different text. M6 v1.1 fixes this by asking the
-- model to return the cleaned reply alongside the scores, then we save it here.
--
-- The wall (M9), the quiz (M7), and any future audit surface read this column
-- so they show exactly what the AI scored.
--
-- Nullable on purpose: legacy v1.0 rows have no cleaned text (the prompt
-- didn't ask for it). The quiz falls back to its existing regex-stripper for
-- those rows.

ALTER TABLE prw_classifications
  ADD COLUMN IF NOT EXISTS cleaned_reply_text TEXT;

COMMENT ON COLUMN prw_classifications.cleaned_reply_text IS
  'AI-extracted prospect reply with quoted thread / forwarded blocks / mojibake stripped. Populated from v1.1 onward.';
