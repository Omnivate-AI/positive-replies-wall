import Link from "next/link";
import type { Metadata } from "next";
import { getReplyStats } from "@/lib/supabase-public";
import { CountReveal } from "./count-reveal";

// Force dynamic rendering — count refreshes on every request, no Next.js
// fetch cache. Demoable on the Loom: classify a reply, refresh page, see
// the number tick up.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Positive Replies, coming soon — Omnivate",
  description:
    "A wall of real positive replies from Omnivate's AI-driven outbound campaigns. Coming soon to omnivate.ai.",
};

export default async function ComingSoonPage() {
  const stats = await getReplyStats().catch(() => ({
    totalReplies: 0,
    highQualityCount: 0,
    promptVersion: "v1.2",
  }));

  return (
    <main className="relative flex min-h-screen flex-col bg-bg">
      {/* Subtle radial accent in the background — premium hero feel without
          being heavy-handed. Pure CSS, no images. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, color-mix(in oklch, var(--color-accent) 6%, transparent) 0%, transparent 70%)",
        }}
      />

      {/* Top nav — minimal, just an Omnivate label + back-to-home link */}
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6 sm:px-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-fg-muted transition-colors hover:text-fg"
        >
          <svg
            className="h-3 w-3"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M11 4l-5 4 5 4" />
          </svg>
          Omnivate
        </Link>
        <span className="text-xs font-medium uppercase tracking-wider text-fg-subtle">
          Preview
        </span>
      </header>

      {/* Hero */}
      <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-20 text-center sm:px-8">
        <p className="mb-5 inline-flex items-center justify-center gap-2 self-center rounded-pill bg-accent-soft px-3 py-1 text-xs font-medium text-accent">
          <LiveDot />
          Coming soon
        </p>

        <h1 className="text-balance text-5xl font-semibold tracking-tight text-fg sm:text-6xl">
          Positive Replies,
          <br className="hidden sm:block" />{" "}
          <span className="text-fg-muted">coming soon</span>
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-balance text-base leading-relaxed text-fg-muted sm:text-lg">
          A wall of real prospect replies from Omnivate&rsquo;s AI-driven
          outbound campaigns. Captured, classified, and rendered with the
          same authentic feel as the original email &mdash; with sensitive
          details visibly redacted.
        </p>

        {/* Live count cards */}
        <CountReveal totalReplies={stats.totalReplies} highQualityCount={stats.highQualityCount} />

        <p className="mt-10 text-xs text-fg-subtle">
          Counts refresh on every page load &middot; classifier {stats.promptVersion}
        </p>
      </section>

      {/* Footer */}
      <footer className="mx-auto w-full max-w-5xl px-6 py-8 text-center text-xs text-fg-subtle sm:px-8">
        <p>
          Powered by Omnivate AI Outbound &middot;{" "}
          <Link
            href="/m7/quiz"
            className="font-medium text-fg-muted transition-colors hover:text-fg"
          >
            Take the classifier audit quiz
          </Link>
        </p>
      </footer>
    </main>
  );
}

function LiveDot() {
  return (
    <span className="relative inline-flex h-1.5 w-1.5">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
    </span>
  );
}
