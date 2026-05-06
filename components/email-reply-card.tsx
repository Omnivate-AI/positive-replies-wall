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
import { applyRedactions } from "@/lib/redactions";

// Re-export so existing call sites (the M7 quiz, the OG route, the POC viewer)
// keep working without import-path changes.
export { applyRedactions };

export interface EmailReplyCardProps {
  from_email: string;
  from_display_name?: string | null;
  to_email?: string | null;
  subject?: string | null;
  body: string;
  /** When the reply landed. Shown right-aligned next to the sender row. */
  received_at?: string | null;
  /** Strings to mask with black bars. Empty = no redaction. */
  redactions?: string[];
  /** Optional verbatim phrase from `body` to wrap in a quiet purple highlight.
   * When the phrase isn't found in the body, no highlight is drawn (the body
   * still renders normally). Used by the wall to surface the killer line. */
  highlight?: string | null;
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

/** Render one paragraph with redactions applied AND optionally wrap a verbatim
 * highlight phrase in a quiet purple span. Find pass: verbatim first, then
 * case-insensitive — paragraph-scoped because the highlight is virtually
 * always within a single paragraph in our data. */
function renderParagraph(
  para: string,
  redactions: string[],
  highlight: string | null | undefined,
): ReactNode {
  if (!highlight || highlight.length === 0) {
    return applyRedactions(para, redactions);
  }
  const length = highlight.length;
  let idx = para.indexOf(highlight);
  if (idx === -1) {
    const lowerIdx = para.toLowerCase().indexOf(highlight.toLowerCase());
    if (lowerIdx === -1) return applyRedactions(para, redactions);
    idx = lowerIdx;
  }
  const before = para.slice(0, idx);
  const hl = para.slice(idx, idx + length);
  const after = para.slice(idx + length);
  return (
    <Fragment>
      {before && applyRedactions(before, redactions)}
      <span className="rounded-sm bg-purple-100 px-0.5 py-px">
        {applyRedactions(hl, redactions)}
      </span>
      {after && applyRedactions(after, redactions)}
    </Fragment>
  );
}

/** Reusable email body — preserves line breaks AND tightens the visual gap
 * between paragraphs. Splits on blank lines so the inter-paragraph spacing is
 * a controlled 12px margin instead of a full line-height of empty space. */
export function ReplyBody({
  body,
  redactions = [],
  highlight,
  className,
}: {
  body: string;
  redactions?: string[];
  highlight?: string | null;
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
          {renderParagraph(para, redactions, highlight)}
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
  highlight,
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
        <ReplyBody body={body} redactions={redactions} highlight={highlight} />
      </article>
    );
  }

  return (
    <article
      className={clsx(
        "rounded-card border border-border bg-surface shadow-card",
        "transition-shadow hover:shadow-card-hover",
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
          <div className="hidden shrink-0 text-xs tabular-nums text-fg-subtle sm:block">
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
        <ReplyBody body={body} redactions={redactions} highlight={highlight} />
      </div>
    </article>
  );
}
