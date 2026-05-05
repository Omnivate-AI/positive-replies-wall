"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { EmailReplyCard } from "@/components/email-reply-card";
import { QUIZ_REPLIES, type QuizReply } from "../data/quiz";

type Verdict = "qualified" | "not_qualified";

export default function QuizPage() {
  const total = QUIZ_REPLIES.length;
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Verdict[]>([]);
  const [done, setDone] = useState(false);

  function answer(v: Verdict) {
    if (done) return;
    const next = [...answers, v];
    setAnswers(next);
    if (next.length >= total) {
      setDone(true);
    } else {
      setIndex((i) => i + 1);
    }
  }

  // Keyboard shortcuts: Y / N
  useEffect(() => {
    if (done) return;
    function handler(e: KeyboardEvent) {
      const k = e.key.toLowerCase();
      if (k === "y" || k === "1") answer("qualified");
      else if (k === "n" || k === "2") answer("not_qualified");
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [answers, done]); // eslint-disable-line react-hooks/exhaustive-deps

  if (done) {
    return <QuizResult replies={QUIZ_REPLIES} answers={answers} />;
  }

  const reply = QUIZ_REPLIES[index];
  const progress = (index / total) * 100;
  const counterText = `${index + 1} / ${total}`;

  return (
    <main className="min-h-screen bg-bg">
      {/* Sticky header with progress bar */}
      <div className="sticky top-0 z-10 border-b border-border bg-white/80 backdrop-blur-md">
        <div className="mx-auto max-w-3xl px-6 py-4 sm:px-8">
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="text-sm font-medium text-fg-muted transition-colors hover:text-fg"
              >
                ←
              </Link>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-accent">
                  M7 · Step 2
                </p>
                <h1 className="text-base font-semibold text-fg">
                  Classifier audit
                </h1>
              </div>
            </div>
            <div className="text-sm font-medium tabular-nums text-fg-muted">
              {counterText}
            </div>
          </div>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-border">
            <motion.div
              className="h-full bg-accent"
              initial={false}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
        </div>
      </div>

      {/* Question body */}
      <section className="mx-auto max-w-3xl px-6 pb-32 pt-10 sm:px-8">
        <div className="mb-6">
          <p className="text-sm leading-relaxed text-fg-muted">
            Read the reply. Would you publish it on the wall? &ldquo;Qualified&rdquo; means it&rsquo;s a real,
            credible, specific compliment about the outreach itself — the kind a stranger reading
            it would find believable.
          </p>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={reply.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <EmailReplyCard
              from_email={reply.reply_from_email}
              from_display_name={[reply.lead_first_name, reply.lead_last_name].filter(Boolean).join(" ") || null}
              to_email={reply.reply_to_email}
              subject={reply.reply_subject}
              body={bodyForDisplay(reply)}
              received_at={reply.reply_received_at}
            />
          </motion.div>
        </AnimatePresence>
      </section>

      {/* Sticky bottom action bar */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-4 sm:px-8">
          <button
            type="button"
            onClick={() => answer("not_qualified")}
            className="flex-1 rounded-button border border-border-strong bg-white px-5 py-3 text-sm font-medium text-fg shadow-button transition-all hover:border-fg-muted hover:bg-bg-subtle active:scale-[0.99]"
          >
            <span className="hidden sm:inline">Not qualified</span>
            <span className="sm:hidden">Not</span>
            <kbd className="ml-2 hidden rounded border border-border bg-white px-1.5 py-0.5 font-mono text-[10px] text-fg-subtle sm:inline">N</kbd>
          </button>
          <button
            type="button"
            onClick={() => answer("qualified")}
            className="flex-1 rounded-button bg-accent px-5 py-3 text-sm font-semibold text-white shadow-button transition-all hover:bg-accent-hover active:scale-[0.99]"
          >
            <span className="hidden sm:inline">Qualified</span>
            <span className="sm:hidden">Yes</span>
            <kbd className="ml-2 hidden rounded border border-white/30 bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white/90 sm:inline">Y</kbd>
          </button>
        </div>
      </div>
    </main>
  );
}

function QuizResult({ replies, answers }: { replies: QuizReply[]; answers: Verdict[] }) {
  const total = replies.length;
  const breakdown = useMemo(() => {
    return replies.map((r, i) => {
      const omarSays = answers[i] === "qualified";
      const aiSays = r.is_high_quality;
      return { reply: r, omarSays, aiSays, agree: omarSays === aiSays };
    });
  }, [replies, answers]);

  const agreed = breakdown.filter((b) => b.agree).length;
  const disagreed = total - agreed;
  const pct = Math.round((agreed / total) * 100);
  const passes = agreed >= 18;

  return (
    <main className="min-h-screen bg-bg">
      {/* Header */}
      <div className="border-b border-border bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-6 px-6 py-4 sm:px-8">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-sm font-medium text-fg-muted transition-colors hover:text-fg"
            >
              ←
            </Link>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-accent">
                M7 · Step 2 — Result
              </p>
              <h1 className="text-base font-semibold text-fg">Classifier audit</h1>
            </div>
          </div>
        </div>
      </div>

      {/* Hero result */}
      <section className="mx-auto max-w-3xl px-6 pb-12 pt-16 sm:px-8 sm:pt-24">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="text-center"
        >
          <p className="text-sm font-medium uppercase tracking-wider text-fg-muted">
            You agreed with the AI on
          </p>
          <BigCounter value={agreed} total={total} />
          <p className="mt-3 text-base text-fg-muted">
            {pct}% agreement — {disagreed} disagreement{disagreed === 1 ? "" : "s"}
          </p>

          <div className="mt-8 inline-flex items-center gap-2 rounded-pill px-4 py-2 text-sm font-semibold"
               style={{
                 background: passes ? "varsuccess-soft" : "vardanger-soft",
                 color: passes ? "varsuccess" : "vardanger",
               }}>
            <span className="text-base">{passes ? "✓" : "○"}</span>
            {passes ? "Passes M6 acceptance (≥ 18 / 20)" : "Below M6 acceptance threshold (need ≥ 18)"}
          </div>
        </motion.div>
      </section>

      {/* Per-question breakdown */}
      <section className="mx-auto max-w-4xl px-6 pb-24 sm:px-8">
        <h2 className="mb-6 text-lg font-semibold text-fg">
          Per-question breakdown
        </h2>
        <div className="overflow-hidden rounded-card border border-border bg-white shadow-card">
          <table className="w-full text-sm">
            <thead className="bg-bg-subtle text-left text-[11px] font-medium uppercase tracking-wider text-fg-muted">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Sender</th>
                <th className="px-4 py-3 text-center">You</th>
                <th className="px-4 py-3 text-center">AI</th>
                <th className="px-4 py-3 text-center">Score</th>
                <th className="px-4 py-3 text-center">Agreement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {breakdown.map(({ reply, omarSays, aiSays, agree }, i) => (
                <tr key={reply.id} className={agree ? "" : "bg-red-50/30"}>
                  <td className="px-4 py-3 tabular-nums text-fg-muted">{i + 1}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-fg">
                      {[reply.lead_first_name, reply.lead_last_name].filter(Boolean).join(" ") || "(unknown)"}
                    </div>
                    <div className="text-xs text-fg-muted">{reply.lead_company_name || ""}</div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Pill value={omarSays} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Pill value={aiSays} />
                  </td>
                  <td className="px-4 py-3 text-center font-mono tabular-nums text-fg-muted">
                    {reply.total_score}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {agree ? (
                      <span className="text-success">✓</span>
                    ) : (
                      <span className="text-danger">✗</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Disagreements detail */}
        {disagreed > 0 && (
          <div className="mt-12">
            <h2 className="mb-6 text-lg font-semibold text-fg">
              Disagreements ({disagreed})
            </h2>
            <div className="space-y-6">
              {breakdown
                .filter((b) => !b.agree)
                .map(({ reply, omarSays, aiSays }) => (
                  <DisagreementCard
                    key={reply.id}
                    reply={reply}
                    omarSays={omarSays}
                    aiSays={aiSays}
                  />
                ))}
            </div>
          </div>
        )}

        <div className="mt-12 flex justify-center">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-button border border-border-strong bg-white px-5 py-3 text-sm font-medium text-fg transition-all hover:border-fg-muted"
          >
            Retake quiz
          </button>
        </div>
      </section>
    </main>
  );
}

function Pill({ value }: { value: boolean }) {
  return (
    <span
      className="inline-flex items-center rounded-pill px-2.5 py-0.5 text-xs font-medium"
      style={{
        background: value ? "varsuccess-soft" : "varbg-subtle",
        color: value ? "varsuccess" : "varfg-muted",
      }}
    >
      {value ? "Qualified" : "Not"}
    </span>
  );
}

function DisagreementCard({
  reply,
  omarSays,
  aiSays,
}: {
  reply: QuizReply;
  omarSays: boolean;
  aiSays: boolean;
}) {
  return (
    <div className="rounded-card border border-border bg-bg-subtle p-6 shadow-card">
      {/* Verdict comparison strip */}
      <div className="mb-5 flex items-center justify-end gap-2 text-xs">
        <span className="text-fg-muted">You:</span>
        <Pill value={omarSays} />
        <span className="ml-2 text-fg-muted">AI:</span>
        <Pill value={aiSays} />
      </div>

      {/* The reply itself — same code-generated component as the quiz card and Option B in the POC viewer */}
      <EmailReplyCard
        from_email={reply.reply_from_email}
        from_display_name={[reply.lead_first_name, reply.lead_last_name].filter(Boolean).join(" ") || null}
        to_email={reply.reply_to_email}
        subject={reply.reply_subject}
        body={bodyForDisplay(reply)}
        received_at={reply.reply_received_at}
      />

      {/* Sub-scores */}
      <div className="mt-5 grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
        <ScoreCell label="Praise" value={reply.praise_score} max={30} />
        <ScoreCell label="Specificity" value={reply.specificity_score} max={25} />
        <ScoreCell label="Authenticity" value={reply.authenticity_score} max={25} />
        <ScoreCell label="Standalone" value={reply.standalone_score} max={20} />
      </div>

      {/* AI's reasoning */}
      <div className="mt-4 text-xs text-fg-muted">
        <span className="font-medium text-fg">AI reasoning:</span> {reply.reasoning}
      </div>

      {/* Categories the model picked */}
      {reply.categories.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {reply.categories.map((c) => (
            <span
              key={c}
              className="inline-flex items-center rounded-pill bg-accent-soft px-2 py-0.5 text-[10px] font-medium text-accent"
            >
              {c.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ScoreCell({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wider text-fg-subtle">
        {label}
      </div>
      <div className="mt-1 font-mono tabular-nums text-fg">
        {value}<span className="text-fg-subtle"> / {max}</span>
      </div>
    </div>
  );
}

function BigCounter({ value, total }: { value: number; total: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let raf: number;
    const start = performance.now();
    const duration = 1000;
    function tick(now: number) {
      const t = Math.min(1, (now - start) / duration);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(eased * value));
      if (t < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return (
    <div className="mt-4 font-semibold tabular-nums text-fg">
      <span className="text-7xl sm:text-8xl">{display}</span>
      <span className="text-2xl text-fg-subtle"> / {total}</span>
    </div>
  );
}

/** Strip basic HTML tags for the quiz cards. Smartlead bodies are HTML. */
function stripHtml(html: string): string {
  return html
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Fallback regex stripper: cuts everything from the first quoted-thread /
 * forwarded-block / mobile-signature marker onward. Used only when a reply has
 * NO `cleaned_reply_text` from the AI classifier (legacy v1.0 rows or any
 * brand-new ingest that hasn't been classified yet).
 */
function extractReplyOnly(text: string): string {
  if (!text) return text;
  const markers: RegExp[] = [
    /^.*\bOn .+?\bwrote:\s*$/m,
    /^.*\bOn .+ at .+ <[^>]+> wrote:?$/m,
    /^-{3,}\s*Forwarded message\s*-{3,}/im,
    /^-{3,}\s*Original Message\s*-{3,}/im,
    /^_{4,}\s*$/m,
    /^\s*From:\s.+?\n\s*(?:Sent|Date):\s.+?\n\s*To:\s/m,
    /^\s*Sent from my (iPhone|iPad|Android|mobile|phone)\b/im,
    /^\s*Get Outlook for (iOS|Android)\s*$/im,
    /^\s*Sent via .+\s*$/m,
    /^>\s*[^\s]/m,
  ];
  let cutAt = text.length;
  for (const re of markers) {
    const m = text.match(re);
    if (m && typeof m.index === "number" && m.index < cutAt) cutAt = m.index;
  }
  return text.slice(0, cutAt).replace(/\n\s*(On|From)\s*$/i, "").trim();
}

/**
 * Body-for-display pipeline:
 *   1. If the classifier saved `cleaned_reply_text`, use that — it's exactly
 *      what the AI scored, with quoted thread / mojibake already cleaned.
 *   2. Otherwise (legacy / unclassified), fall back to stripHtml + regex
 *      extractor. Less reliable but keeps the quiz functional for old rows.
 */
function bodyForDisplay(reply: QuizReply): string {
  if (reply.cleaned_reply_text && reply.cleaned_reply_text.trim().length > 0) {
    return reply.cleaned_reply_text;
  }
  return extractReplyOnly(stripHtml(reply.reply_body_html));
}
