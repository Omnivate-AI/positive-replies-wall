/**
 * / — the public wall.
 *
 * Pulls only published threads with a non-empty highlight, sorted by
 * display_priority ASC, total_score DESC, sent_at DESC. Renders each via
 * EmailReplyCard with the truncated-excerpt body + auto + admin
 * redactions + SDR allowlist applied.
 *
 * Perf: ISR with revalidate=60. Admin actions trigger
 * /api/admin/revalidate which calls revalidatePath('/') so changes
 * surface within seconds, not the 60s window.
 */

import Link from "next/link";
import { EmailReplyCard } from "@/components/email-reply-card";
import { buildExcerpt, pickAnchorHighlight } from "@/lib/excerpt";
import { SDR_FIRST_NAMES } from "@/lib/sdr";
import { getPublishedWallThreads } from "@/lib/supabase-public";

export const revalidate = 60;

const BOOK_CALL_URL = "https://app.usemotion.com/meet/omar-almubarak/jzkldtn";

function truncatedBody(body: string, highlights: string[]): {
  body: string;
  highlights: string[];
} {
  // Anchor truncation on the earliest highlight that exists in the body.
  // Other highlights still get the purple wash where they appear in the
  // visible portion (multi-highlight rendering in EmailReplyCard).
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

export default async function HomePage() {
  // Guard against transient Supabase fetch failures so a Node-level
  // `TypeError: fetch failed` doesn't take the whole page to 500. The
  // retry loop inside getPublishedWallThreads already handles short
  // hiccups; this catch handles harder failures (extended outages) by
  // rendering the empty state.
  let threads: Awaited<ReturnType<typeof getPublishedWallThreads>> = [];
  try {
    threads = await getPublishedWallThreads();
  } catch (e) {
    console.error("[/] getPublishedWallThreads failed:", e);
  }

  return (
    <main className="min-h-screen px-6 py-16 sm:px-8 sm:py-20 lg:px-12">
      <div className="space-y-12">
        <header className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <p className="text-sm font-medium uppercase tracking-wider text-accent">
              Positive Replies
            </p>
            <Link
              href="/admin"
              className="inline-flex items-center gap-1 rounded-button border border-border bg-surface px-3 py-1.5 text-xs font-medium text-fg-muted shadow-button transition-colors hover:border-border-strong hover:text-fg"
            >
              Admin
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                aria-hidden="true"
              >
                <path
                  d="M5 3l5 5-5 5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
          </div>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-fg sm:text-5xl">
            Real positive replies from prospects we&rsquo;ve cold-emailed on
            behalf of our clients.
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-fg-muted">
            Names redacted. Praise verbatim.
          </p>
        </header>

        {threads.length === 0 ? (
          <div className="rounded-card border border-dashed border-border bg-bg-subtle p-12 text-center">
            <p className="text-sm text-fg-muted">
              No replies are published yet. Check back soon.
            </p>
          </div>
        ) : (
          <div className="columns-1 gap-5 sm:columns-2 lg:columns-3 xl:columns-4 2xl:columns-5">
            {threads.map((t) => {
              const { body, highlights } = truncatedBody(t.body, t.highlights);
              const allRedactions = (() => {
                const set = new Set(t.redactions);
                for (const n of SDR_FIRST_NAMES) set.add(n);
                // Defense in depth — never rely on prw_redactions alone to
                // mask the lead's identity or the SDR mailbox.
                if (t.from_display_name) set.add(t.from_display_name);
                if (t.from_email) set.add(t.from_email);
                if (t.to_email) set.add(t.to_email);
                return Array.from(set);
              })();
              return (
                <div key={t.thread_id} className="mb-5 break-inside-avoid">
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
        )}

        <footer className="flex flex-col items-start gap-4 border-t border-border pt-10 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-md text-sm leading-relaxed text-fg-muted">
            Want this kind of reply rate from your outbound? Let&rsquo;s talk.
          </p>
          <a
            href={BOOK_CALL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-button bg-accent px-5 py-2.5 text-sm font-medium text-white shadow-button transition-colors hover:bg-accent-hover"
          >
            Book a call
            <svg
              className="h-4 w-4"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              aria-hidden="true"
            >
              <path d="M5 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </footer>
      </div>
    </main>
  );
}
