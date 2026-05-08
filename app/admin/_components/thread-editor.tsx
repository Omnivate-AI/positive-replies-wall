"use client";

/**
 * Right-pane preview + admin actions for a single thread. Receives
 * mutation callbacks from the parent dashboard (so RQ-driven optimistic
 * updates flow through one place) and renders a public-wall preview
 * alongside the priority/highlight/redaction controls.
 */

import { useMemo, useState } from "react";
import { EmailReplyCard } from "@/components/email-reply-card";
import { buildExcerpt, pickAnchorHighlight } from "@/lib/excerpt";
import { SDR_FIRST_NAMES } from "@/lib/sdr";
import type { AdminThread } from "@/lib/supabase-public";
import { CloseIcon } from "./icons";

interface ThreadEditorProps {
  thread: AdminThread;
  onTogglePublished: () => void;
  onSetPriority: (p: number) => void;
  onAddRedaction: (text: string) => void;
  onRemoveRedaction: (id: number) => void;
  onAddHighlight: (text: string) => void;
  onRemoveHighlight: (id: number) => void;
  onCaptureSelection: () => void;
}

export function ThreadEditor({
  thread,
  onTogglePublished,
  onSetPriority,
  onAddRedaction,
  onRemoveRedaction,
  onAddHighlight,
  onRemoveHighlight,
  onCaptureSelection,
}: ThreadEditorProps) {
  // ThreadEditor receives `key={thread.thread_id}` from the parent so
  // switching threads remounts this component — local form state resets
  // naturally without a setState-in-effect dance. The same `key` also
  // re-initializes these inputs when the parent receives a fresh thread
  // payload (e.g. after a server-driven update).
  const [redactionInput, setRedactionInput] = useState("");
  const [highlightInput, setHighlightInput] = useState("");
  const [priorityInput, setPriorityInput] = useState(String(thread.display_priority));

  // Build the truncated body the public wall would render so the admin
  // sees exactly what visitors will see. Anchor on the earliest highlight
  // that exists in the body; pass the full highlight list to the renderer
  // so every occurrence gets the purple wash.
  const highlightTexts = useMemo(
    () => thread.highlights.map((h) => h.text),
    [thread.highlights],
  );
  const anchor = pickAnchorHighlight(thread.body, highlightTexts);
  const ex = buildExcerpt(thread.body, anchor);
  const truncatedBody = ex.highlight
    ? `${ex.before}${ex.highlight}${ex.after}${ex.truncated ? "…" : ""}`
    : `${ex.after}${ex.truncated ? "…" : ""}`;

  // Render redactions = stored redactions + SDR allowlist + sender identity
  // (display name + email — defense in depth, never trust the auto_lead
  // row to be present) + recipient SDR mailbox.
  const allRedactions = useMemo(() => {
    const set = new Set(thread.redactions.map((r) => r.text));
    for (const n of SDR_FIRST_NAMES) set.add(n);
    if (thread.from_display_name) set.add(thread.from_display_name);
    if (thread.from_email) set.add(thread.from_email);
    if (thread.to_email) set.add(thread.to_email);
    return Array.from(set);
  }, [thread.redactions, thread.from_display_name, thread.from_email, thread.to_email]);

  return (
    <>
      <header className="flex items-center justify-between gap-3 border-b border-border bg-surface px-6 py-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-fg">
            {thread.from_display_name ?? thread.from_email}
          </p>
          <p className="truncate text-xs text-fg-muted">
            Score {thread.total_score} · Thread #{thread.thread_id}
          </p>
        </div>
        <button
          onClick={onTogglePublished}
          className={`inline-flex items-center gap-1.5 rounded-button px-4 py-2 text-xs font-medium transition-all ${
            thread.is_published
              ? "border border-success/30 bg-success-soft text-success hover:bg-success/10"
              : "bg-accent text-white shadow-button hover:bg-accent-hover"
          }`}
        >
          {thread.is_published && (
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-success" />
          )}
          {thread.is_published ? "Unpublish" : "Publish"}
        </button>
      </header>

      {/* Inner workspace: preview in the middle, actions on the right.
       * 1:1 ratio inside a 70% parent gives 35% each — total layout is
       * 30% list + 35% preview + 35% actions. */}
      <div className="grid flex-1 grid-cols-1 gap-6 overflow-y-auto p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Preview pane */}
        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wider text-fg-muted">
            Public preview
          </p>
          <div data-preview-pane onMouseUp={onCaptureSelection}>
            <EmailReplyCard
              from_email={thread.from_email}
              from_display_name={thread.from_display_name}
              to_email={thread.to_email}
              subject={thread.subject}
              body={truncatedBody}
              highlights={highlightTexts}
              redactions={allRedactions}
              received_at={thread.received_at}
              density="compact"
            />
          </div>
          <p className="text-xs text-fg-subtle">
            Tip: select text above and choose <strong>Highlight</strong> or{" "}
            <strong>Redact</strong>.
          </p>
        </div>

        {/* Actions pane */}
        <aside className="space-y-6">
          {/* Priority */}
          <section className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-wider text-fg-muted">
              Display priority
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                max="10000"
                value={priorityInput}
                onChange={(e) => setPriorityInput(e.target.value)}
                className="w-24 rounded-button border border-border bg-surface px-3 py-1.5 text-sm text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
              <button
                onClick={() => onSetPriority(Number(priorityInput) || 0)}
                disabled={Number(priorityInput) === thread.display_priority}
                className="rounded-button border border-border bg-surface px-3 py-1.5 text-xs font-medium text-fg transition-colors hover:bg-bg-subtle disabled:opacity-50"
              >
                Save
              </button>
            </div>
            <p className="text-xs text-fg-subtle">
              Higher = more prominent. 0 = default sort.
            </p>
          </section>

          {/* Highlights — list of phrases wrapped in the purple wash on
           * the public wall. Cards-list pattern mirrors redactions: each
           * highlight is its own card, admin entries get an X delete,
           * auto_classifier entries are immutable. Add a new highlight
           * via the typed input below or by selecting text in the
           * preview pane and clicking "Highlight" in the floating toolbar. */}
          <section className="space-y-2 rounded-card border border-border bg-surface p-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium uppercase tracking-wider text-fg-muted">
                Highlights
                <span className="ml-1.5 normal-case text-fg-subtle">
                  ({thread.highlights.length})
                </span>
              </label>
              <span className="rounded-pill bg-purple-50 px-1.5 py-px text-xs font-medium text-purple-700">
                Wall
              </span>
            </div>
            <ul className="space-y-1">
              {thread.highlights.length === 0 ? (
                <li className="text-xs text-fg-subtle">
                  No highlights on this thread yet.
                </li>
              ) : (
                thread.highlights.map((h) => (
                  <li
                    key={h.id}
                    className="group flex items-start justify-between gap-2 rounded-button border border-border bg-bg-subtle px-2.5 py-1.5"
                  >
                    <div className="min-w-0">
                      <span className="block text-xs leading-relaxed text-fg">
                        {h.text}
                      </span>
                      <span className="text-xs text-fg-subtle">{h.source}</span>
                    </div>
                    {h.source === "admin" && (
                      <button
                        onClick={() => onRemoveHighlight(h.id)}
                        className="shrink-0 rounded p-1 text-fg-subtle opacity-0 transition-all hover:bg-danger-soft hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                        aria-label="Remove highlight"
                      >
                        <CloseIcon />
                      </button>
                    )}
                  </li>
                ))
              )}
            </ul>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (highlightInput.trim().length < 2) return;
                onAddHighlight(highlightInput);
                setHighlightInput("");
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                placeholder="Add a phrase to highlight"
                value={highlightInput}
                onChange={(e) => setHighlightInput(e.target.value)}
                className="flex-1 rounded-button border border-border bg-surface px-3 py-1.5 text-sm text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
              <button
                type="submit"
                disabled={highlightInput.trim().length < 2}
                className="rounded-button bg-fg px-3 py-1.5 text-xs font-medium text-bg transition-colors hover:opacity-90 disabled:opacity-40"
              >
                Add
              </button>
            </form>
          </section>

          {/* Redactions */}
          <section className="space-y-2 rounded-card border border-border bg-surface p-4">
            <label className="text-xs font-medium uppercase tracking-wider text-fg-muted">
              Redactions
              <span className="ml-1.5 normal-case text-fg-subtle">
                ({thread.redactions.length})
              </span>
            </label>
            <ul className="space-y-1">
              {thread.redactions.length === 0 ? (
                <li className="text-xs text-fg-subtle">No redactions on this thread yet.</li>
              ) : (
                thread.redactions.map((r) => (
                  <li
                    key={r.id}
                    className="group flex items-center justify-between gap-2 rounded-button border border-border bg-bg-subtle px-2.5 py-1.5"
                  >
                    <div className="min-w-0">
                      <span className="block truncate text-xs text-fg">{r.text}</span>
                      <span className="text-xs text-fg-subtle">{r.source}</span>
                    </div>
                    {r.source === "admin" && (
                      <button
                        onClick={() => onRemoveRedaction(r.id)}
                        aria-label="Remove redaction"
                        className="shrink-0 rounded p-1 text-fg-subtle opacity-0 transition-all hover:bg-danger-soft hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <CloseIcon />
                      </button>
                    )}
                  </li>
                ))
              )}
            </ul>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onAddRedaction(redactionInput);
                setRedactionInput("");
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                placeholder="Add a phrase to redact"
                value={redactionInput}
                onChange={(e) => setRedactionInput(e.target.value)}
                className="flex-1 rounded-button border border-border bg-surface px-3 py-1.5 text-sm text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
              <button
                type="submit"
                disabled={redactionInput.trim().length < 2}
                className="rounded-button bg-fg px-3 py-1.5 text-xs font-medium text-bg transition-colors hover:opacity-90 disabled:opacity-40"
              >
                Add
              </button>
            </form>
          </section>

          <p className="text-xs leading-relaxed text-fg-subtle">
            Auto-detected redactions (lead/SDR/classifier) are immutable in
            this UI — they regenerate from each new ingest + classify run.
          </p>
        </aside>
      </div>
    </>
  );
}
