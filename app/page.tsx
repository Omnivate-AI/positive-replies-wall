/**
 * / — the public wall.
 *
 * Layout (revamped 2026-05-07 against the testimonial-page reference):
 *   1. Top bar  — logo + word-mark, Admin link
 *   2. Hero     — soft Unsplash backdrop + title block, eyebrow + headline + sub
 *   3. Section heading row — "Wall of replies / What real prospects said"
 *      with a short description on the right
 *   4. Wall grid — up to 8 cards initially, then "Show more"
 *   5. Footer CTA — book-a-call invitation on a soft brand-tinted band
 *
 * Server-rendered. ISR revalidate=60. Distinguishes a real fetch failure
 * (renders an error panel + structured `wall_fetch_failed` log line) from
 * the legitimate "nothing published yet" empty state.
 */

import Image from "next/image";
import Link from "next/link";
import { WallGrid } from "@/components/wall-grid";
import { getPublishedWallThreads } from "@/lib/supabase-public";

export const revalidate = 60;

const BOOK_CALL_URL = "https://app.usemotion.com/meet/omar-almubarak/jzkldtn";

export default async function HomePage() {
  let threads: Awaited<ReturnType<typeof getPublishedWallThreads>> = [];
  let loadError = false;
  try {
    threads = await getPublishedWallThreads();
  } catch (e) {
    loadError = true;
    console.error(
      JSON.stringify({
        event: "wall_fetch_failed",
        error: e instanceof Error ? e.message : String(e),
      }),
    );
  }

  return (
    <main className="min-h-screen bg-bg">
      {/* ───── Top bar ───── */}
      <div className="border-b border-border/60 bg-surface/80 backdrop-blur">
        <div className="flex w-full items-center justify-between px-6 py-4 sm:px-8 lg:px-16">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/logo.png"
              alt="Omnivate"
              width={32}
              height={32}
              className="h-8 w-8 rounded-full"
            />
            <span className="text-sm font-semibold tracking-tight text-fg">
              Positive Replies
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 rounded-button border border-border bg-surface px-3 py-1.5 text-xs font-medium text-fg-muted shadow-button transition-colors hover:border-border-strong hover:text-fg"
            >
              Admin
              <Chevron />
            </Link>
          </div>
        </div>
      </div>

      {/* ───── Hero ───── */}
      {/* Single centered text block — eyebrow / h1 / description. No
       * frosted-glass panel (it existed to sit on top of the now-removed
       * Unsplash image; on a clean bg it reads as visual noise). No
       * in-hero CTA — the footer band carries the only "Book a call".
       * Tight vertical padding so the first row of cards lands above
       * the fold on a typical 1080p viewport. */}
      <section>
        <div className="w-full px-6 py-12 sm:px-8 sm:py-16 lg:px-16 lg:py-20">
          <div className="mx-auto max-w-7xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">
              Wall of replies
            </p>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-fg sm:text-5xl lg:text-[56px] lg:leading-[1.05]">
              What real prospects said when we cold-emailed them.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-fg-muted sm:text-lg">
              Every reply on this page is a real B2B prospect responding to a
              cold email we sent on behalf of an Omnivate client. Names are
              blurred; everything else is verbatim.
            </p>
          </div>
        </div>
      </section>

      {/* ───── Wall grid ───── */}
      <section className="w-full px-6 pt-4 pb-24 sm:px-8 sm:pb-32 lg:px-16">
        {threads.length === 0 ? (
          loadError ? (
            <div
              role="alert"
              className="rounded-card border border-dashed border-danger/40 bg-danger-soft/40 p-16 text-center"
            >
              <p className="text-sm text-danger">
                We&rsquo;re having trouble loading the wall right now. Please
                refresh in a minute.
              </p>
            </div>
          ) : (
            <div className="rounded-card border border-dashed border-border bg-bg-subtle p-16 text-center">
              <p className="text-sm text-fg-muted">
                No replies are published yet. Check back soon.
              </p>
            </div>
          )
        ) : (
          <WallGrid threads={threads} />
        )}
      </section>

      {/* ───── Footer CTA ───── */}
      <section className="border-t border-border bg-accent-soft">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-8 px-6 py-20 text-center sm:px-8 sm:py-24 lg:px-16">
          <div className="max-w-2xl space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">
              Ready when you are
            </p>
            <h2 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
              Want this kind of reply from your outbound?
            </h2>
            <p className="text-base leading-relaxed text-fg-muted">
              We&rsquo;ll show you the tools, the playbook, and how it could
              work for your team.
            </p>
          </div>
          <a
            href={BOOK_CALL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-button bg-accent px-6 py-3 text-sm font-medium text-white shadow-button transition-all hover:-translate-y-0.5 hover:bg-accent-hover hover:shadow-card-hover"
          >
            Book a call
            <Chevron />
          </a>
        </div>
      </section>

      {/* ───── Footer ───── */}
      <footer className="border-t border-border bg-surface">
        <div className="flex w-full flex-col items-start justify-between gap-4 px-6 py-10 sm:flex-row sm:items-center sm:px-8 lg:px-16">
          <div className="flex items-center gap-2.5">
            <Image
              src="/logo.png"
              alt=""
              width={24}
              height={24}
              className="h-6 w-6 rounded-full"
            />
            <span className="text-xs font-medium text-fg">
              AI cold outbound. Engineered, not prompted.
            </span>
          </div>
          <span className="text-xs text-fg-subtle">
            © {new Date().getFullYear()} Omnivate AI
          </span>
        </div>
      </footer>
    </main>
  );
}

function Chevron() {
  return (
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
  );
}
