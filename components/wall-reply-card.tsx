/**
 * WallReplyCard — the M9 public wall card.
 *
 * Distinct from `email-reply-card.tsx`:
 *   - Avatar-led header (Gravatar / DiceBear initials), not a "From: ..." label
 *   - Renders a TRUNCATED excerpt anchored on the classifier-picked highlight
 *     phrase, not the full body
 *   - Quiet visual emphasis on the highlight (soft amber wash, no italics, no
 *     pull-quote chrome — credibility goal: looks like a real email reply
 *     where one phrase happens to catch the eye, not a stylized testimonial)
 *   - Single layout — no density / bodyOnly / OG-capture variants
 *
 * Inputs are pre-cleaned plaintext: callers pass `prw_classifications.cleaned_reply_text`
 * as the body, NOT the raw `prw_messages.body_html`. Cleaned text is what the
 * classifier read; rendering it is what makes the highlight align.
 */

import clsx from "clsx";
import { applyRedactions } from "@/lib/redactions";
import { buildExcerpt } from "@/lib/excerpt";
import { Avatar } from "./avatar";

export interface WallReplyCardProps {
  from_email: string;
  from_display_name?: string | null;
  subject?: string | null;
  /** Cleaned reply text (plaintext, not HTML). */
  body: string;
  /** The classifier-picked killer phrase. Empty / null = no highlight; the
   * card renders a plain body-start excerpt instead. */
  highlight?: string | null;
  /** Spans to mask with black bars across name, email, subject, and body. */
  redactions?: string[];
  /** ISO timestamp of when the reply landed. */
  received_at?: string | null;
  className?: string;
}

function formatReceivedAt(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function WallReplyCard({
  from_email,
  from_display_name,
  subject,
  body,
  highlight,
  redactions = [],
  received_at,
  className,
}: WallReplyCardProps) {
  const excerpt = buildExcerpt(body, highlight);
  const dateStr = formatReceivedAt(received_at);

  return (
    <article
      className={clsx(
        "rounded-card border border-border bg-surface p-6 shadow-card",
        "transition-all hover:-translate-y-0.5 hover:border-border-strong hover:shadow-card-hover",
        className,
      )}
      aria-label="Email reply"
    >
      {/* Sender header */}
      <header className="flex items-center gap-3">
        <Avatar email={from_email} name={from_display_name ?? null} size={40} />
        <div className="min-w-0 flex-1">
          {from_display_name && (
            <p className="truncate text-sm font-medium text-fg redaction-transition">
              {applyRedactions(from_display_name, redactions)}
            </p>
          )}
          <p
            className={clsx(
              "truncate text-xs redaction-transition",
              from_display_name ? "text-fg-subtle" : "text-fg",
            )}
          >
            {applyRedactions(from_email, redactions)}
          </p>
        </div>
      </header>

      {/* Subject — kept subtle so the praise carries the visual hierarchy */}
      {subject && (
        <p className="mt-4 truncate text-xs text-fg-muted redaction-transition">
          {applyRedactions(subject, redactions)}
        </p>
      )}

      {/* Body excerpt with quiet highlight */}
      <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-fg redaction-transition">
        {excerpt.before && applyRedactions(excerpt.before, redactions)}
        {excerpt.highlight && (
          <span className="rounded-sm bg-amber-50 px-0.5 py-px">
            {applyRedactions(excerpt.highlight, redactions)}
          </span>
        )}
        {excerpt.after && applyRedactions(excerpt.after, redactions)}
        {excerpt.truncated && <span className="text-fg-muted"> …</span>}
      </p>

      {/* Footer — timestamp anchor */}
      {dateStr && (
        <footer className="mt-5 text-xs tabular-nums text-fg-subtle">{dateStr}</footer>
      )}
    </article>
  );
}
