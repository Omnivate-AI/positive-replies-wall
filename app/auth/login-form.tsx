"use client";

/**
 * Visual-only sign-in form. Authentication was removed 2026-05-07; this
 * page exists for the design and the eventual re-introduction of auth.
 * The form fields are interactive but submission is a no-op that just
 * shows a "currently disabled" message. The dashboard at /admin is
 * publicly accessible during this phase.
 */

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { motion } from "framer-motion";

export function LoginForm({ redirectTo: _redirectTo }: { redirectTo: string }) {
  void _redirectTo;
  const [email, setEmail] = useState("");
  const [showNotice, setShowNotice] = useState(false);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setShowNotice(true);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="email" className="text-xs font-medium text-fg-muted">
          Work email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@omnivate.ai"
          className="w-full rounded-button border border-border bg-surface px-3.5 py-2.5 text-sm text-fg shadow-button outline-none transition-all duration-150 placeholder:text-fg-subtle focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
      </div>

      {showNotice && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
          className="space-y-2 rounded-button border border-border bg-bg-subtle px-3 py-2.5 text-xs leading-relaxed text-fg-muted"
        >
          <p>
            Authentication is currently disabled. The admin dashboard is
            open access during the build-out phase.
          </p>
          <Link
            href="/admin"
            className="inline-flex font-medium text-accent transition-colors hover:text-accent-hover"
          >
            Go to admin →
          </Link>
        </motion.div>
      )}

      <button
        type="submit"
        className="w-full rounded-button bg-accent px-3 py-2.5 text-sm font-medium text-white shadow-button transition-all duration-150 hover:bg-accent-hover hover:shadow-card focus:outline-none focus:ring-2 focus:ring-accent/40"
      >
        Sign in
      </button>
    </form>
  );
}
