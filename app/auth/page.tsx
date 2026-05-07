/**
 * /auth — admin sign-in via 6-digit OTP.
 *
 * Layout: split-screen. Left pane is the form (60% of width on lg+, full
 * width on mobile). Right pane is a full-bleed Unsplash image with a
 * dark gradient overlay and a small editorial pull-quote — keeps the page
 * from feeling like a generic auth modal and reinforces the brand.
 *
 * Mobile: image hidden, form fills the screen. Sign-in friction stays low
 * on phones where stacked split-screens feel like wasted scroll.
 */

import Link from "next/link";
import { LoginForm } from "./login-form";

// Unsplash image — picked for: warm, abstract-architectural feel that
// reads "professional" without competing with the form. The query params
// are Unsplash's auto-format/crop. Swap the photo ID anytime by editing
// this constant.
const HERO_IMAGE =
  "https://images.unsplash.com/photo-1497032628192-86f99bcd76bc?w=1600&q=80&auto=format&fit=crop";

interface PageProps {
  searchParams: Promise<{ error?: string; redirect?: string }>;
}

export default async function AuthPage({ searchParams }: PageProps) {
  const params = await searchParams;
  return (
    <main className="grid min-h-screen grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* Form pane */}
      <section className="relative flex flex-col bg-surface">
        <header className="flex items-center justify-between px-8 pt-8 sm:px-12 sm:pt-10">
          <Link href="/" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="Omnivate"
              width={28}
              height={28}
              className="h-7 w-7 rounded-full"
            />
            <span className="text-sm font-medium tracking-tight text-fg">
              Positive Replies
            </span>
          </Link>
          <Link
            href="/"
            className="text-xs font-medium text-fg-muted transition-colors hover:text-fg"
          >
            Back to wall →
          </Link>
        </header>

        <div className="flex flex-1 items-center justify-center px-8 py-12 sm:px-12">
          <div className="w-full max-w-sm space-y-8">
            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-accent">
                Admin
              </p>
              <h1 className="text-3xl font-semibold leading-tight tracking-tight text-fg sm:text-[34px]">
                Sign in to manage the wall.
              </h1>
              <p className="max-w-md text-sm leading-relaxed text-fg-muted">
                Enter your work email and we&rsquo;ll send a one-time
                sign-in link. The link is single-use and expires after one
                hour.
              </p>
            </div>

            {params.error === "not_authorized" && (
              <div className="rounded-button border border-danger/20 bg-danger-soft px-3.5 py-2.5 text-xs text-danger">
                That email isn&rsquo;t on the admin allowlist.
              </div>
            )}
            {params.error === "misconfigured" && (
              <div className="rounded-button border border-danger/20 bg-danger-soft px-3.5 py-2.5 text-xs text-danger">
                Auth is misconfigured. Tell the engineer.
              </div>
            )}

            <LoginForm redirectTo={params.redirect ?? "/admin"} />

            <p className="text-[11px] leading-relaxed text-fg-subtle">
              Access is limited to the Omnivate admin allowlist. Need
              access? Ask Omar.
            </p>
          </div>
        </div>

        <footer className="px-8 pb-8 sm:px-12 sm:pb-10">
          <p className="text-[11px] text-fg-subtle">
            © Omnivate AI · Operated by humans, on behalf of humans.
          </p>
        </footer>
      </section>

      {/* Image pane (hidden on mobile to keep sign-in fast) */}
      <aside
        aria-hidden="true"
        className="relative hidden overflow-hidden bg-bg-subtle lg:block"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={HERO_IMAGE}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        {/* Dark gradient + subtle indigo wash for legibility of the overlay */}
        <div className="absolute inset-0 bg-gradient-to-tr from-[#0b0b1a]/85 via-[#0b0b1a]/40 to-transparent" />
        <div className="relative flex h-full flex-col justify-end p-12 xl:p-16">
          <div className="max-w-md space-y-6">
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-white/70">
              Wall of replies
            </p>
            <p className="text-3xl font-medium leading-snug tracking-tight text-white xl:text-[36px]">
              &ldquo;This is one of the best cold/outbound emails I&rsquo;ve
              received in years.&rdquo;
            </p>
            <p className="text-sm text-white/60">
              — A real prospect, sent to one of our SDRs. We have hundreds
              like this.
            </p>
          </div>
        </div>
      </aside>
    </main>
  );
}
