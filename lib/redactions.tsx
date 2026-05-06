/**
 * Pure redaction logic — extracted from components/email-reply-card.tsx so
 * it's testable independently of React rendering.
 *
 * Match policy:
 *   - Case-insensitive substring replace
 *   - Longest-first ordering so "Mauritz Gilfillan" wins over "Mauritz"
 *     (otherwise the surname half of the full name would render unredacted)
 *   - Regex special characters in the redaction string are escaped
 *
 * The wall renders the masked output via a span: the underlying text remains
 * in the DOM (color: transparent) so it occupies the right horizontal space,
 * but `user-select: none` on the redacted span makes selection-based leak
 * one step harder. Definitive PII protection is at the data layer (server-
 * side rendering with redactions pre-applied lands in M10 with the admin
 * tooling).
 */

import { Fragment, type ReactNode } from "react";

export function applyRedactions(text: string, redactions: string[]): ReactNode {
  if (!redactions || redactions.length === 0) return text;
  const sorted = [...new Set(redactions.filter((s) => s.length > 0))].sort(
    (a, b) => b.length - a.length,
  );
  if (sorted.length === 0) return text;
  const escaped = sorted.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "gi");

  const out: ReactNode[] = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIdx) {
      out.push(<Fragment key={`t${key++}`}>{text.slice(lastIdx, m.index)}</Fragment>);
    }
    out.push(
      <span key={`r${key++}`} className="redacted">
        {m[0]}
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
