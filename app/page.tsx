import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-16 sm:px-8">
      <div className="space-y-12">
        <header className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-wider text-accent">
            Positive Replies Wall
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-fg sm:text-5xl">
            Pick a rendering. Audit the classifier. Preview the wall.
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-fg-muted">
            Three short stops on the way to the public wall. Choose how every
            reply should display, spot-check the AI&rsquo;s judgment on twenty
            real replies, and preview the landing page that goes live on
            omnivate.ai.
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

          <Link
            href="/coming-soon"
            className="group rounded-card border border-border bg-surface p-6 shadow-card transition-all hover:-translate-y-0.5 hover:border-border-strong hover:shadow-card-hover"
          >
            <div className="mb-3 inline-flex h-9 items-center gap-2 rounded-pill bg-accent-soft px-3 text-xs font-medium text-accent">
              <span className="relative inline-flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
              </span>
              Live
            </div>
            <h2 className="text-lg font-semibold text-fg">
              Preview the wall
            </h2>
            <p className="mt-1 text-sm text-fg-muted">
              The coming-soon landing page that ships to omnivate.ai. Pulls a
              live count from Supabase on every refresh.
            </p>
            <div className="mt-4 inline-flex items-center text-sm font-medium text-accent transition-transform group-hover:translate-x-0.5">
              Open preview
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
          M7 / M8 deliverables for the positive-replies-wall project. Cards 1
          and 2 are hardcoded fixtures; card 3 reads live from Supabase.
        </p>
      </div>
    </main>
  );
}
