import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-16 sm:px-8">
      <div className="space-y-12">
        <header className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-wider text-accent">
            Positive Replies Wall · M7
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-fg sm:text-5xl">
            Pick a rendering. Audit the classifier.
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-fg-muted">
            Two short tasks before the wall ships. Choose how every reply should
            be displayed, then spot-check the AI&rsquo;s judgment on twenty real
            replies.
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/m7/pocs"
            className="group rounded-card border border-border bg-surface p-6 shadow-card transition-all hover:-translate-y-0.5 hover:border-border-strong hover:shadow-card-hover"
          >
            <div className="mb-3 inline-flex h-9 items-center rounded-pill bg-accent-soft px-3 text-xs font-medium text-accent">
              Step 1
            </div>
            <h2 className="text-lg font-semibold text-fg">
              Compare renderings
            </h2>
            <p className="mt-1 text-sm text-fg-muted">
              Three sample replies, three approaches: actual screenshots,
              code-rendered cards, and a hybrid. With a redaction toggle.
            </p>
            <div className="mt-4 inline-flex items-center text-sm font-medium text-accent transition-transform group-hover:translate-x-0.5">
              Open viewer
              <svg
                className="ml-1 h-4 w-4"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  d="M5 3l5 5-5 5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </Link>

          <Link
            href="/m7/quiz"
            className="group rounded-card border border-border bg-surface p-6 shadow-card transition-all hover:-translate-y-0.5 hover:border-border-strong hover:shadow-card-hover"
          >
            <div className="mb-3 inline-flex h-9 items-center rounded-pill bg-accent-soft px-3 text-xs font-medium text-accent">
              Step 2
            </div>
            <h2 className="text-lg font-semibold text-fg">
              Take the quiz
            </h2>
            <p className="mt-1 text-sm text-fg-muted">
              Twenty real replies. Mark each &ldquo;Qualified&rdquo; or
              &ldquo;Not qualified.&rdquo; See your agreement with the AI at the
              end.
            </p>
            <div className="mt-4 inline-flex items-center text-sm font-medium text-accent transition-transform group-hover:translate-x-0.5">
              Start quiz
              <svg
                className="ml-1 h-4 w-4"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  d="M5 3l5 5-5 5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </Link>
        </div>

        <p className="text-xs text-fg-subtle">
          M7 deliverable for the positive-replies-wall project. Data is
          hardcoded into the build; no live database calls.
        </p>
      </div>
    </main>
  );
}
