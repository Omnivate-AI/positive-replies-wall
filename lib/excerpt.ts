/**
 * Truncated excerpt around a highlight phrase.
 *
 * Per Omar (2026-05-06):
 *   "Show from the beginning of the reply to that particular place [the
 *    highlight phrase] and a little more context. Then ellipsis."
 *
 * Output shape: { before, highlight, after } so the renderer can wrap the
 * highlight span with quiet emphasis while leaving before/after as plain text.
 *
 * Truncation rule:
 *   - Always render from the start of the reply up to the highlight phrase.
 *   - After the highlight, keep a short tail of context (TAIL_CHARS, default 80).
 *   - If the body extends beyond the tail, append the trimmed remainder with
 *     a leading "…" ellipsis.
 *
 * Edge cases handled:
 *   - Highlight not found in the body → fall back to a body-start excerpt
 *     capped at PRE_HIGHLIGHT_FALLBACK_CHARS chars + ellipsis. before='',
 *     highlight='', after='<truncated body>'. The card renders this as a
 *     plain excerpt with no quiet-highlight span.
 *   - Empty highlight (classifier returned "") → same as not-found path.
 *   - Highlight at the very start → before is empty string.
 *   - Body shorter than the highlight + tail → no ellipsis, after is the
 *     remaining body verbatim.
 */

export interface Excerpt {
  before: string;
  highlight: string;
  after: string;
  /** True when the after segment was clipped — the renderer knows whether to
   * draw the trailing "…" inside the after span or not. */
  truncated: boolean;
}

const TAIL_CHARS = 80;
const PRE_HIGHLIGHT_FALLBACK_CHARS = 200;

export function buildExcerpt(body: string, highlight: string | null | undefined): Excerpt {
  const cleanBody = body ?? "";

  // Fallback path: no highlight to anchor on.
  if (!highlight || highlight.trim().length === 0) {
    return fallbackExcerpt(cleanBody);
  }

  const idx = cleanBody.indexOf(highlight);
  if (idx !== -1) return splitAt(cleanBody, idx, highlight.length);

  // Case-insensitive lookup — the classifier may have title-cased a quote
  // that originally appeared in lowercase.
  const lowerIdx = cleanBody.toLowerCase().indexOf(highlight.toLowerCase());
  if (lowerIdx !== -1) return splitAt(cleanBody, lowerIdx, highlight.length);

  // Sentence-fragment fallback. The classifier sometimes paraphrases by
  // stitching two non-contiguous sentences (seen on thread 185, Doreen /
  // Hilti — "You pulled me in. You win." + "I appreciate you reading my
  // post..."). Split the highlight on sentence boundaries, try each
  // fragment from longest to shortest, use the first one that substring-
  // matches the body. Better than falling all the way back to body-start
  // because the actual praise often lives several paragraphs in.
  const fragments = splitIntoSentences(highlight)
    .filter((f) => f.length >= 20)
    .sort((a, b) => b.length - a.length);
  for (const frag of fragments) {
    const fIdx = cleanBody.indexOf(frag);
    if (fIdx !== -1) return splitAt(cleanBody, fIdx, frag.length);
    const fLowerIdx = cleanBody.toLowerCase().indexOf(frag.toLowerCase());
    if (fLowerIdx !== -1) return splitAt(cleanBody, fLowerIdx, frag.length);
  }

  return fallbackExcerpt(cleanBody);
}

function splitIntoSentences(text: string): string[] {
  // Split on . ! ? followed by whitespace; keep the punctuation with the
  // preceding fragment so "Hello world." stays one piece.
  const out: string[] = [];
  const re = /[^.!?]+[.!?]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push(m[0].trim());
  }
  // Trailing remainder with no terminal punctuation
  const lastEnd = out.reduce((acc, s) => acc + s.length, 0);
  if (lastEnd < text.length) {
    const tail = text.slice(lastEnd).trim();
    if (tail.length > 0) out.push(tail);
  }
  return out;
}

function splitAt(body: string, idx: number, length: number): Excerpt {
  const before = body.slice(0, idx);
  const highlight = body.slice(idx, idx + length);
  const tailStart = idx + length;
  const tailEnd = tailStart + TAIL_CHARS;
  const tail = body.slice(tailStart, tailEnd);
  const truncated = body.length > tailEnd;
  return {
    before,
    highlight,
    after: tail,
    truncated,
  };
}

function fallbackExcerpt(body: string): Excerpt {
  const truncated = body.length > PRE_HIGHLIGHT_FALLBACK_CHARS;
  const after = truncated ? body.slice(0, PRE_HIGHLIGHT_FALLBACK_CHARS) : body;
  return {
    before: "",
    highlight: "",
    after,
    truncated,
  };
}

/**
 * Pick the highlight phrase that anchors the excerpt — when a thread has
 * multiple highlights, we use the EARLIEST one in the body so the wall
 * card always shows praise above the fold. Other highlights elsewhere in
 * the rendered text still get the purple wash via the multi-highlight
 * renderer in `email-reply-card`.
 *
 * Resolution order per candidate:
 *   1. Verbatim substring match
 *   2. Case-insensitive match
 * The earliest start index across all matched candidates wins.
 *
 * Returns null when no candidate matches — caller falls back to the
 * body-start excerpt.
 */
export function pickAnchorHighlight(
  body: string,
  highlights: string[] | null | undefined,
): string | null {
  if (!body || !highlights || highlights.length === 0) return null;
  const lower = body.toLowerCase();
  let bestIdx = Infinity;
  let bestPhrase: string | null = null;
  for (const h of highlights) {
    if (!h || h.length === 0) continue;
    const verbatimIdx = body.indexOf(h);
    if (verbatimIdx !== -1 && verbatimIdx < bestIdx) {
      bestIdx = verbatimIdx;
      bestPhrase = h;
      continue;
    }
    const ciIdx = lower.indexOf(h.toLowerCase());
    if (ciIdx !== -1 && ciIdx < bestIdx) {
      bestIdx = ciIdx;
      bestPhrase = h;
    }
  }
  return bestPhrase;
}
