/**
 * /demo — M9 deliverable. Renders the top 10 high-quality classified threads
 * using <EmailReplyCard>, with their auto_lead + auto_classifier redactions
 * applied (plus SDR first names masked at render time). The killer phrase
 * picked by the classifier gets a quiet purple highlight inside the body,
 * and the body itself is truncated: start-of-reply → highlight + ~80 chars
 * of trailing context + ellipsis.
 *
 * Server-rendered. Data is fetched per request (no ISR yet — that lands
 * with M10's perf work).
 */

import Link from "next/link";
import { EmailReplyCard } from "@/components/email-reply-card";
import { buildExcerpt } from "@/lib/excerpt";
import { getWallThreads } from "@/lib/supabase-public";

export const dynamic = "force-dynamic";

/** Reconstruct a single body string from buildExcerpt's parts, with a
 * trailing ellipsis when the original body extended past the tail. The
 * EmailReplyCard sees this string as if it were the natural body — the
 * highlight prop tells it which substring to wrap in a purple span. */
function truncatedBody(body: string, highlight: string | null): {
  body: string;
  highlight: string | null;
} {
  const ex = buildExcerpt(body, highlight);
  const ellipsis = ex.truncated ? "…" : "";
  if (ex.highlight) {
    return {
      body: `${ex.before}${ex.highlight}${ex.after}${ellipsis}`,
      highlight: ex.highlight,
    };
  }
  // Fallback path: classifier picked no highlight or it didn't substring-
  // match. Body is start-only excerpt; no highlight wash to draw.
  return {
    body: `${ex.after}${ellipsis}`,
    highlight: null,
  };
}

export default async function DemoPage() {
  const threads = await getWallThreads(10);

  return (
    <main className="min-h-screen px-6 py-16 sm:px-8 sm:py-20 lg:px-12">
      <div className="space-y-12">
        <header className="space-y-4">
          <div className="flex items-center gap-3">
            <p className="text-sm font-medium uppercase tracking-wider text-accent">
              M9 demo
            </p>
            <span className="inline-flex items-center rounded-pill bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent">
              {threads.length} replies
            </span>
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-fg sm:text-5xl">
            What real prospects actually said.
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-fg-muted">
            Ten of the highest-scoring positive replies, pulled live from
            Supabase. Each card shows the verbatim praise — redactions applied,
            highlight phrase emphasized, recipient identity masked.
          </p>
        </header>

        {threads.length === 0 ? (
          <div className="rounded-card border border-dashed border-border bg-bg-subtle p-12 text-center">
            <p className="text-sm text-fg-muted">
              No high-quality threads classified yet at the latest prompt
              version. Run{" "}
              <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-xs text-fg">
                npm run classify:local
              </code>{" "}
              to populate.
            </p>
          </div>
        ) : (
          // CSS columns masonry: cards flow at natural heights, no row-
          // stretching, denser packing. break-inside-avoid keeps each card
          // in one column.
          <div className="columns-1 gap-5 sm:columns-2 lg:columns-3 xl:columns-4 2xl:columns-5">
            {threads.map((t) => {
              const { body, highlight } = truncatedBody(t.body, t.highlight);
              return (
                <div key={t.thread_id} className="mb-5 break-inside-avoid">
                  <EmailReplyCard
                    from_email={t.from_email}
                    from_display_name={t.from_display_name}
                    to_email={t.to_email}
                    subject={t.subject}
                    body={body}
                    highlight={highlight}
                    redactions={t.redactions}
                    received_at={t.received_at}
                    density="compact"
                  />
                </div>
              );
            })}
          </div>
        )}

        <footer className="border-t border-border pt-8">
          <p className="text-xs text-fg-subtle">
            Live data from Supabase (project{" "}
            <code className="font-mono text-[11px]">uivgowblojtyiobhgjlv</code>
            ). Highlight = classifier-picked killer phrase; redactions = lead,
            SDR, and third-party names auto-detected at ingest + classification.{" "}
            <Link
              href="/"
              className="font-medium text-accent transition-colors hover:text-accent-hover"
            >
              ← Back to overview
            </Link>
          </p>
        </footer>
      </div>
    </main>
  );
}
