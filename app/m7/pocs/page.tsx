"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { EmailReplyCard } from "@/components/email-reply-card";
import { POC_REPLIES, type PocReply } from "../data/poc-samples";

const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const },
};

export default function PocsPage() {
  const [redacted, setRedacted] = useState(true);

  return (
    <main className="min-h-screen bg-bg">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 border-b border-border bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-425 items-center justify-between gap-6 px-6 py-4 sm:px-8">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-sm font-medium text-fg-muted transition-colors hover:text-fg"
            >
              ←
            </Link>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-accent">
                M7 · Step 1
              </p>
              <h1 className="text-base font-semibold text-fg">
                Compare rendering options
              </h1>
            </div>
          </div>
          <RedactionToggle on={redacted} onChange={setRedacted} />
        </div>
      </div>

      {/* Intro */}
      <section className="mx-auto max-w-3xl px-6 pb-2 pt-10 sm:px-8">
        <motion.div {...fadeUp}>
          <p className="text-base leading-relaxed text-fg-muted">
            The same three replies, rendered three ways. Toggle redaction to compare both states.
            Pick the option you want the wall built on.
          </p>
        </motion.div>
      </section>

      {/* Per-reply comparison */}
      <section className="mx-auto max-w-425 px-6 pb-24 sm:px-8">
        <div className="mt-12 space-y-20">
          {POC_REPLIES.map((reply, i) => (
            <ReplyComparison key={reply.id} reply={reply} index={i} redacted={redacted} />
          ))}
        </div>

        <div className="mt-20 rounded-card border border-border bg-bg-subtle p-8 sm:p-10">
          <h2 className="text-lg font-semibold text-fg">When you&rsquo;ve picked</h2>
          <p className="mt-2 text-sm leading-relaxed text-fg-muted">
            Kindly share which option (A, B, or C) you want the M9 rendering built on, then
            head to{" "}
            <Link href="/m7/quiz" className="font-medium text-accent hover:text-accent-hover">
              the classifier audit quiz →
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}

function ReplyComparison({
  reply,
  index,
  redacted,
}: {
  reply: PocReply;
  index: number;
  redacted: boolean;
}) {
  const activeRedactions = redacted ? reply.default_redactions : [];
  const ogQuery = `?id=${reply.id}${redacted ? "" : "&redact=0"}`;

  return (
    <motion.section
      {...fadeUp}
      transition={{ ...fadeUp.transition, delay: index * 0.08 }}
      aria-labelledby={`sample-${reply.id}`}
    >
      <div className="mb-8 flex items-end justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
            Sample {index + 1}
          </p>
          <h2 id={`sample-${reply.id}`} className="mt-1 text-xl font-semibold text-fg">
            {reply.reply_from_display_name} <span className="text-fg-subtle">·</span>{" "}
            <span className="text-fg-muted">{reply.reply_from_email.split("@")[1]}</span>
          </h2>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <PocColumn
          letter="A"
          name="Smartlead screenshot"
          tradeoff="Most credible, hardest to operate. Redaction would mean drawing rectangles on each image."
        >
          <div className="overflow-hidden rounded-card border border-border bg-white shadow-card">
            <Image
              src={reply.screenshot_src}
              alt={`Screenshot of reply from ${reply.reply_from_display_name}`}
              width={800}
              height={600}
              className="w-full object-contain"
              priority={index === 0}
              unoptimized
            />
          </div>
          <p className="mt-3 text-xs text-fg-subtle">
            Note: Option A&rsquo;s shown unredacted — masking would require manual image edits.
          </p>
        </PocColumn>

        <PocColumn
          letter="B"
          name="Code-rendered"
          tradeoff="Pixel-controllable, redaction is a styled span, free updates. The default lean."
          recommended
        >
          <EmailReplyCard
            from_email={reply.reply_from_email}
            from_display_name={reply.reply_from_display_name}
            to_email={reply.reply_to_email}
            subject={reply.reply_subject}
            body={reply.reply_body}
            received_at={reply.reply_received_at}
            redactions={activeRedactions}
          />
        </PocColumn>

        <PocColumn
          letter="C"
          name="Hybrid (rendered → image)"
          tradeoff="Image-like consistency, data-driven source. Heavier per-render cost."
        >
          {/* No outer wrapper — the OG image already has the rounded card frame baked in.
              Cache-bust on toggle so the image regenerates with the new redaction state. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/og-reply${ogQuery}`}
            alt={`Generated image of reply from ${reply.reply_from_display_name}`}
            className="w-full"
            key={ogQuery}
          />
          <p className="mt-3 text-xs text-fg-subtle">
            Generated by /api/og-reply via @vercel/og — same data as Option B.
          </p>
        </PocColumn>
      </div>
    </motion.section>
  );
}

function PocColumn({
  letter,
  name,
  tradeoff,
  recommended,
  children,
}: {
  letter: string;
  name: string;
  tradeoff: string;
  recommended?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-4 flex items-baseline gap-2">
        <span
          className={
            recommended
              ? "inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-white"
              : "inline-flex h-6 w-6 items-center justify-center rounded-full border border-border-strong text-[11px] font-semibold text-fg-muted"
          }
        >
          {letter}
        </span>
        <h3 className="text-sm font-semibold text-fg">{name}</h3>
        {recommended && (
          <span className="ml-1 inline-flex items-center rounded-pill bg-accent-soft px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
            Recommended
          </span>
        )}
      </div>
      {children}
      <p className="mt-3 text-xs leading-relaxed text-fg-muted">{tradeoff}</p>
    </div>
  );
}

function RedactionToggle({ on, onChange }: { on: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="group flex items-center gap-3 rounded-pill border border-border bg-white px-3 py-1.5 text-xs font-medium text-fg shadow-button transition-all hover:border-border-strong cursor-pointer"
    >
      <span className="hidden text-fg-muted sm:inline">Redaction</span>
      <span
        className={
          "relative inline-flex h-5 w-9 items-center rounded-full transition-colors " +
          (on ? "bg-accent" : "bg-border-strong")
        }
      >
        <span
          className={
            "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform " +
            (on ? "translate-x-4" : "translate-x-0.5")
          }
        />
      </span>
      <span className="text-fg">{on ? "On" : "Off"}</span>
    </button>
  );
}
