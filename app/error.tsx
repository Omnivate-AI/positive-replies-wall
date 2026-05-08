"use client";

/**
 * Global error boundary for the App Router.
 *
 * Catches runtime errors thrown during render outside the controlled
 * try/catch in the wall reader. Logs a structured event so Vercel
 * runtime-log search and any future alert rule can match on
 * `event=page_render_failed`.
 */

import { useEffect } from "react";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error(
      JSON.stringify({
        event: "page_render_failed",
        message: error.message,
        digest: error.digest,
      }),
    );
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-6">
      <div className="max-w-md space-y-5 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">
          Something went wrong
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
          We hit a snag loading this page.
        </h1>
        <p className="text-sm leading-relaxed text-fg-muted">
          Refresh in a minute, or try again. The team has been notified.
        </p>
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-button bg-accent px-5 py-2.5 text-sm font-medium text-white shadow-button transition-all hover:-translate-y-0.5 hover:bg-accent-hover"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
