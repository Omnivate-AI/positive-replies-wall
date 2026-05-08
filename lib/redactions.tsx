/**
 * Pure redaction logic — extracted from components/email-reply-card.tsx so
 * it's testable independently of React rendering.
 *
 * Match policy (per redaction entry's `match_type`):
 *   - "literal": case-insensitive substring (current default; required for
 *     emails, domains, multi-token names, anything with punctuation).
 *   - "word_boundary": case-insensitive whole-word match using `\bX\b`
 *     anchors. Required for short single-token names so "Lee" doesn't
 *     mask "feeling", "Greeley", "tunneling" — see ticket #013.
 *
 * Backwards-compatible signature: passing `string[]` (legacy callers, tests)
 * is treated as if every entry were `{ text, match_type: "literal" }` —
 * matching the renderer's behaviour before the typed-redactions migration.
 *
 * Within the active set, longest-first ordering wins so "Mauritz Gilfillan"
 * preempts the bare "Mauritz" alternative. Regex special characters in the
 * redaction string are escaped.
 *
 * The wall renders the masked output via a span: the underlying text remains
 * in the DOM (color: transparent) so it occupies the right horizontal space,
 * but `user-select: none` on the redacted span makes selection-based leak
 * one step harder.
 */

import { Fragment, type ReactNode } from "react";

export type RedactionMatchType = "literal" | "word_boundary";

export interface RedactionEntry {
  text: string;
  match_type: RedactionMatchType;
}

/** Heuristic for callers that need a default match_type for a free-form
 * string (e.g. SDR allowlist names, classifier-derived hints). Single-token
 * strings without `@` or `.` use word_boundary; everything else falls back
 * to literal. */
export function inferMatchType(text: string): RedactionMatchType {
  const trimmed = text.trim();
  if (/\s/.test(trimmed)) return "literal";
  if (/[@.]/.test(trimmed)) return "literal";
  return "word_boundary";
}

const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/g;

function normalize(
  redactions: readonly (string | RedactionEntry)[],
): RedactionEntry[] {
  const seen = new Set<string>();
  const out: RedactionEntry[] = [];
  for (const r of redactions) {
    if (r == null) continue;
    const text = typeof r === "string" ? r : r.text;
    const matchType: RedactionMatchType =
      typeof r === "string" ? "literal" : r.match_type;
    if (!text || text.length === 0) continue;
    const key = `${matchType}|${text.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ text, match_type: matchType });
  }
  // Longest-first ordering so multi-token names preempt the single-token half.
  out.sort((a, b) => b.text.length - a.text.length);
  return out;
}

export function applyRedactions(
  text: string,
  redactions: readonly (string | RedactionEntry)[],
): ReactNode {
  if (!redactions || redactions.length === 0) return text;
  const normalized = normalize(redactions);
  if (normalized.length === 0) return text;

  const parts = normalized.map((r) => {
    const escaped = r.text.replace(REGEX_SPECIAL, "\\$&");
    return r.match_type === "word_boundary" ? `\\b${escaped}\\b` : escaped;
  });
  const re = new RegExp(`(${parts.join("|")})`, "gi");

  const out: ReactNode[] = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIdx) {
      out.push(<Fragment key={`t${key++}`}>{text.slice(lastIdx, m.index)}</Fragment>);
    }
    // Nested span structure: outer `.redacted` carries the brand-color
    // pill (background, padding, rounded corners), inner `.redacted-text`
    // carries the blur. See `.redacted` rule in app/globals.css for why.
    out.push(
      <span key={`r${key++}`} className="redacted">
        <span className="redacted-text">{m[0]}</span>
      </span>,
    );
    lastIdx = m.index + m[0].length;
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  if (lastIdx < text.length) {
    out.push(<Fragment key={`t${key}`}>{text.slice(lastIdx)}</Fragment>);
  }
  return out;
}
