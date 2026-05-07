"use client";

/**
 * Public wall grid — renders the published reply cards in a responsive
 * 1/2/3/4 column layout, capped at 8 visible by default with a "Show
 * more" reveal for the rest.
 *
 * Pagination is purely client-side: the server passes ALL published
 * threads as props (the count is small in practice — dozens, not
 * thousands), and this component decides what's visible. Future
 * scale: switch to server-side cursor pagination when we cross a
 * couple hundred published replies.
 */

import { useState } from "react";
import { EmailReplyCard } from "./email-reply-card";
import { buildExcerpt, pickAnchorHighlight } from "@/lib/excerpt";
import { SDR_FIRST_NAMES } from "@/lib/sdr";
import type { WallThread } from "@/lib/supabase-public";

const PAGE_SIZE = 8;

function truncatedBody(body: string, highlights: string[]): {
  body: string;
  highlights: string[];
} {
  const anchor = pickAnchorHighlight(body, highlights);
  const ex = buildExcerpt(body, anchor);
  const ellipsis = ex.truncated ? "…" : "";
  if (ex.highlight) {
    return {
      body: `${ex.before}${ex.highlight}${ex.after}${ellipsis}`,
      highlights,
    };
  }
  return { body: `${ex.after}${ellipsis}`, highlights };
}

export function WallGrid({ threads }: { threads: WallThread[] }) {
  // Reveal `PAGE_SIZE` more cards per click — never all-at-once. Keeps
  // the wall feeling browsable rather than dumping the whole list when
  // there are lots of replies.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const visible = threads.slice(0, visibleCount);
  const hidden = threads.length - visible.length;
  const nextBatch = Math.min(PAGE_SIZE, hidden);

  return (
    <div className="space-y-12">
      <div className="columns-1 gap-8 sm:columns-2 lg:columns-3 xl:columns-4">
        {visible.map((t) => {
          const { body, highlights } = truncatedBody(t.body, t.highlights);
          const allRedactions = (() => {
            const set = new Set(t.redactions);
            for (const n of SDR_FIRST_NAMES) set.add(n);
            if (t.from_display_name) set.add(t.from_display_name);
            if (t.from_email) set.add(t.from_email);
            if (t.to_email) set.add(t.to_email);
            return Array.from(set);
          })();
          return (
            <div key={t.thread_id} className="mb-8 break-inside-avoid">
              <EmailReplyCard
                from_email={t.from_email}
                from_display_name={t.from_display_name}
                to_email={t.to_email}
                subject={t.subject}
                body={body}
                highlights={highlights}
                redactions={allRedactions}
                received_at={t.received_at}
                density="compact"
              />
            </div>
          );
        })}
      </div>

      {hidden > 0 && (
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
            className="inline-flex items-center gap-2 rounded-button bg-accent px-6 py-3 text-sm font-medium text-white shadow-button transition-all hover:-translate-y-0.5 hover:bg-accent-hover hover:shadow-card-hover"
          >
            Show {nextBatch} more
            <svg
              className="h-4 w-4"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              aria-hidden="true"
            >
              <path
                d="M3 6l5 5 5-5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <p className="text-xs text-fg-subtle tabular-nums">
            {visible.length} of {threads.length}
          </p>
        </div>
      )}
    </div>
  );
}
