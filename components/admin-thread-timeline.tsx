"use client";

/**
 * Admin-only thread timeline — surfaces the full SDR↔lead conversation
 * for a thread (every outbound step + every inbound). Internal-only;
 * does not appear on the public wall.
 *
 * Powers the "what did we say that earned the reply?" study Omar called
 * out as the motivation for the M9 thread+messages restructure.
 *
 * Lazy-loaded: fetches /api/admin/threads/[id] on mount, so the parent
 * admin dashboard stays fast (it doesn't ship every message in the
 * initial server fetch).
 */

import { useEffect, useState } from "react";
import clsx from "clsx";
import type {
  AdminThreadDetail,
  AdminThreadMessage,
} from "@/app/api/admin/threads/[id]/route";

interface Props {
  threadId: number;
}

/** Quick-and-dirty HTML stripper for display. Preserves line breaks from
 * <br> and block-level closers. Decodes the most common entities. The
 * trigger-side classifier has a more thorough version with mojibake fixes
 * and embedded image handling — we don't need that here, just readable text. */
function stripHtmlForDisplay(html: string): string {
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

/** Render a compact gap between consecutive messages: "+3d", "+1h", "+2w". */
function gapBetween(prev: string, current: string): string {
  const a = new Date(prev).getTime();
  const b = new Date(current).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return "";
  const sec = Math.floor((b - a) / 1000);
  if (sec < 60) return `+${sec}s`;
  if (sec < 3600) return `+${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `+${Math.floor(sec / 3600)}h`;
  if (sec < 604800) return `+${Math.floor(sec / 86400)}d`;
  if (sec < 2592000) return `+${Math.floor(sec / 604800)}w`;
  return `+${Math.floor(sec / 2592000)}mo`;
}

function formatAbsoluteTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AdminThreadTimeline({ threadId }: Props) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ready"; data: AdminThreadDetail }
    | { kind: "error"; message: string }
  >({ kind: "loading" });

  useEffect(() => {
    // No setState({ kind: "loading" }) reset — the parent ThreadEditor
    // gets `key={selected.thread_id}`, so it (and us) remount fresh when
    // the user picks a different thread. This satisfies the
    // react-hooks/set-state-in-effect lint rule.
    let cancelled = false;
    fetch(`/api/admin/threads/${threadId}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body?.message ?? `${r.status} ${r.statusText}`);
        }
        return (await r.json()) as AdminThreadDetail;
      })
      .then((data) => {
        if (!cancelled) setState({ kind: "ready", data });
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setState({
            kind: "error",
            message: e instanceof Error ? e.message : String(e),
          });
      });
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  if (state.kind === "loading") {
    return (
      <div className="rounded-card border border-dashed border-border bg-bg-subtle p-6 text-center text-sm text-fg-muted">
        Loading thread…
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="rounded-card border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
        Failed to load thread: {state.message}
      </div>
    );
  }

  const { data } = state;
  const { messages } = data;

  if (messages.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-border bg-bg-subtle p-6 text-center text-sm text-fg-muted">
        No messages on this thread yet.
      </div>
    );
  }

  const counts = {
    outbound: messages.filter((m) => m.direction === "outbound").length,
    inbound: messages.filter((m) => m.direction === "inbound").length,
  };

  return (
    <div className="space-y-3">
      {/* Header strip: counts + Smartlead deep link */}
      <div className="flex items-center justify-between gap-3 rounded-card border border-border bg-bg-subtle px-4 py-2.5 text-xs">
        <div className="flex items-center gap-3 text-fg-muted">
          <span>
            <span className="font-semibold tabular-nums text-fg">
              {messages.length}
            </span>{" "}
            messages
          </span>
          <span aria-hidden className="text-border">
            ·
          </span>
          <span>
            <span className="font-semibold tabular-nums text-fg">
              {counts.outbound}
            </span>{" "}
            sent
          </span>
          <span aria-hidden className="text-border">
            ·
          </span>
          <span>
            <span className="font-semibold tabular-nums text-fg">
              {counts.inbound}
            </span>{" "}
            received
          </span>
        </div>
        {data.unibox_url && (
          <a
            href={data.unibox_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-button border border-border bg-surface px-2.5 py-1 font-medium text-fg transition-colors hover:bg-bg-subtle"
          >
            Open in Smartlead
            <svg
              className="h-3 w-3"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              aria-hidden="true"
            >
              <path
                d="M5 3l5 5-5 5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
        )}
      </div>

      {/* Messages */}
      <ol className="space-y-3">
        {messages.map((m, i) => {
          const prev = i > 0 ? messages[i - 1] : null;
          const gap = prev ? gapBetween(prev.sent_at, m.sent_at) : "";
          return (
            <Message
              key={m.id}
              message={m}
              gap={gap}
              showSubject={i === 0 || m.subject !== prev?.subject}
            />
          );
        })}
      </ol>
    </div>
  );
}

function Message({
  message,
  gap,
  showSubject,
}: {
  message: AdminThreadMessage;
  gap: string;
  showSubject: boolean;
}) {
  const isInbound = message.direction === "inbound";
  const body = message.body_text?.trim()
    ? message.body_text.trim()
    : stripHtmlForDisplay(message.body_html ?? "");

  return (
    <li className="relative">
      {gap && (
        <div className="mb-1.5 ml-4 flex items-center gap-2 text-xs text-fg-subtle">
          <span className="h-2 w-px bg-border" aria-hidden />
          <span className="tabular-nums">{gap}</span>
        </div>
      )}
      <article
        className={clsx(
          "relative rounded-card border bg-surface p-4 shadow-card",
          message.is_qualifying_reply
            ? "border-accent/30 ring-1 ring-accent/10"
            : "border-border",
        )}
      >
        {message.is_qualifying_reply && (
          <span
            aria-hidden
            className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent"
          />
        )}

        {/* Direction + step indicator + timestamp */}
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span
              className={clsx(
                "rounded-pill px-2 py-0.5 font-medium uppercase tracking-wider",
                isInbound
                  ? "bg-success-soft text-success"
                  : "bg-bg-subtle text-fg-muted",
              )}
            >
              {isInbound ? "Inbound" : "Outbound"}
            </span>
            {!isInbound && message.email_seq_number != null && (
              <span className="text-fg-subtle">
                Step {message.email_seq_number}
              </span>
            )}
            {message.is_qualifying_reply && (
              <span className="rounded-pill bg-accent-soft px-2 py-0.5 font-medium text-accent">
                Qualifying reply
              </span>
            )}
          </div>
          <time className="tabular-nums text-fg-subtle">
            {formatAbsoluteTime(message.sent_at)}
          </time>
        </div>

        {/* From/to row */}
        <div className="text-xs text-fg-muted">
          <span className="font-medium">From: </span>
          {message.from_name && (
            <span className="text-fg">{message.from_name} </span>
          )}
          <span>&lt;{message.from_email}&gt;</span>
          {message.to_email && (
            <>
              <span className="mx-1.5 text-fg-subtle" aria-hidden>
                →
              </span>
              <span>{message.to_email}</span>
            </>
          )}
        </div>

        {/* Subject (only when changed) */}
        {showSubject && message.subject && (
          <p className="mt-2 text-sm font-medium leading-snug tracking-tight text-fg">
            {message.subject}
          </p>
        )}

        {/* Body */}
        <div className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed text-fg">
          {body || (
            <span className="italic text-fg-subtle">(empty body)</span>
          )}
        </div>
      </article>
    </li>
  );
}
