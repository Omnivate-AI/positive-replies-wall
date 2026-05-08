/**
 * EmailReplyCard — code-rendered email recreation (M7 Option B).
 *
 * Layout (matches the screenshot pattern Omar approved):
 *   [Subject — large]
 *   [✉ icon]  Sender name <sender@email>
 *   [→ icon]  recipient@sdr.com
 *   ─────────────────────────────────────────
 *   Body, line-break-preserving
 *
 * Used by:
 *   - /m7/pocs Option B (full card with redaction toggle)
 *   - /api/og-reply (Option C captures this same component to PNG via @vercel/og)
 *   - /m7/quiz via the exported <ReplyBody> sub-component (body-only mode)
 */

import { Fragment, type ReactNode } from "react";
import clsx from "clsx";
import { applyRedactions, type RedactionEntry } from "@/lib/redactions";

// Re-export so existing call sites (the M7 quiz, the OG route, the POC viewer)
// keep working without import-path changes.
export { applyRedactions };
export type { RedactionEntry };

/** Either a typed redaction (with an explicit match_type) or a bare string
 * (treated as `match_type: "literal"` for backward compat). */
export type Redaction = string | RedactionEntry;

export interface EmailReplyCardProps {
  from_email: string;
  from_display_name?: string | null;
  to_email?: string | null;
  subject?: string | null;
  body: string;
  /** When the reply landed. Shown right-aligned next to the sender row. */
  received_at?: string | null;
  /** Strings to mask with black bars. Each entry is either a bare string
   * (literal substring match — legacy) or a typed entry that selects
   * literal vs word_boundary matching. Empty = no redaction. */
  redactions?: Redaction[];
  /** Verbatim phrases from `body` to wrap in a quiet purple highlight. The
   * renderer wraps every occurrence of every phrase. Multiple highlights
   * per card are first-class — pass `[]` to disable highlighting entirely. */
  highlights?: string[];
  /** Visual size variant. Default "comfortable". */
  density?: "comfortable" | "compact";
  /** Render only the body (no subject, no sender/recipient rows). For the quiz. */
  bodyOnly?: boolean;
  className?: string;
}

function formatReceivedAt(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Render one paragraph with redactions applied AND wrap every occurrence
 * of every highlight phrase in a quiet purple span. Longest-first matching
 * to avoid partial overlaps; case-insensitive so classifier-paraphrased
 * casing still matches. Redactions still apply *inside* the highlight span
 * — both visual treatments stack cleanly. */
function renderParagraph(
  para: string,
  redactions: Redaction[],
  highlights: string[],
): ReactNode {
  const valid = highlights.filter((h) => h && h.length > 0);
  if (valid.length === 0) return applyRedactions(para, redactions);

  const sorted = [...new Set(valid)].sort((a, b) => b.length - a.length);
  const escaped = sorted.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "gi");

  const out: ReactNode[] = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(para)) !== null) {
    if (m.index > lastIdx) {
      out.push(
        <Fragment key={`t${key++}`}>
          {applyRedactions(para.slice(lastIdx, m.index), redactions)}
        </Fragment>,
      );
    }
    out.push(
      <span
        key={`h${key++}`}
        className="rounded-sm bg-purple-100 px-0.5 py-px"
      >
        {applyRedactions(m[0], redactions)}
      </span>,
    );
    lastIdx = m.index + m[0].length;
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  if (lastIdx < para.length) {
    out.push(
      <Fragment key={`t${key}`}>
        {applyRedactions(para.slice(lastIdx), redactions)}
      </Fragment>,
    );
  }
  return out;
}

/** Reusable email body — preserves line breaks AND tightens the visual gap
 * between paragraphs. Splits on blank lines so the inter-paragraph spacing is
 * a controlled 12px margin instead of a full line-height of empty space. */
export function ReplyBody({
  body,
  redactions = [],
  highlights = [],
  className,
}: {
  body: string;
  redactions?: Redaction[];
  highlights?: string[];
  className?: string;
}) {
  const paragraphs = body.split(/\n{2,}/);
  return (
    <div
      className={clsx(
        "leading-relaxed text-[15px] text-fg redaction-transition sm:text-base",
        className,
      )}
    >
      {paragraphs.map((para, i) => (
        <p
          key={i}
          className={clsx("whitespace-pre-wrap", i > 0 && "mt-3")}
        >
          {renderParagraph(para, redactions, highlights)}
        </p>
      ))}
    </div>
  );
}

// FieldLabel removed — labels are inlined into the sender/recipient text so
// they read as normal flowing text ("From: Name <email>") instead of a
// two-column grid.

export function EmailReplyCard({
  from_email,
  from_display_name,
  to_email,
  subject,
  body,
  received_at,
  redactions = [],
  highlights = [],
  density = "comfortable",
  bodyOnly = false,
  className,
}: EmailReplyCardProps) {
  const padding = density === "compact" ? "p-5 sm:p-6" : "p-6 sm:p-8";
  const dateStr = formatReceivedAt(received_at);

  if (bodyOnly) {
    return (
      <article
        className={clsx(
          "rounded-card border border-border bg-surface shadow-card",
          padding,
          className,
        )}
        aria-label="Reply body"
      >
        <ReplyBody body={body} redactions={redactions} highlights={highlights} />
      </article>
    );
  }

  return (
    <article
      className={clsx(
        "rounded-card bg-surface shadow-lg",
        "transition-shadow hover:shadow-xl",
        padding,
        className,
      )}
      aria-label="Email reply"
    >
      {/* Subject */}
      {subject && (
        <h3 className="text-lg font-semibold leading-snug tracking-tight text-fg redaction-transition sm:text-xl">
          {applyRedactions(subject, redactions)}
        </h3>
      )}

      {/* Sender row: "From: Name <email>" reads as one line of text + timestamp on the right */}
      <div className="mt-4 flex items-baseline justify-between gap-3">
        <div className="min-w-0 flex-1 truncate text-sm text-fg redaction-transition">
          <span className="font-medium text-fg-muted">
            From:{" "}
          </span>
          {from_display_name && (
            <span className="font-medium">
              {applyRedactions(from_display_name, redactions)}
            </span>
          )}
          {from_display_name && " "}
          <span
            className={
              from_display_name
                ? "text-fg-muted"
                : "text-fg"
            }
          >
            &lt;{applyRedactions(from_email, redactions)}&gt;
          </span>
        </div>
        {dateStr && (
          <div
            className="hidden shrink-0 text-xs tabular-nums text-fg-subtle sm:block"
            // toLocaleString without a fixed timeZone formats in the runtime's
            // local zone — server (UTC) and client (visitor's local) produce
            // different strings and React throws hydration error #418. The
            // string is cosmetic; suppress the warning rather than force UTC.
            suppressHydrationWarning
          >
            {dateStr}
          </div>
        )}
      </div>

      {/* Recipient row: "to: email" reads as one line of text */}
      {to_email && (
        <div className="mt-2 truncate text-sm text-fg-muted redaction-transition">
          <span className="font-medium">to: </span>
          {applyRedactions(to_email, redactions)}
        </div>
      )}

      {/* Separator */}
      <div className="mt-5 h-px bg-border" aria-hidden="true" />

      {/* Body */}
      <div className="mt-5">
        <ReplyBody body={body} redactions={redactions} highlights={highlights} />
      </div>
    </article>
  );
}
