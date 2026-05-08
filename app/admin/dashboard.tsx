"use client";

/**
 * Admin dashboard — two-pane layout.
 *
 * Left pane: filterable list of all threads (search + status filters).
 * Right pane: selected-thread preview with EmailReplyCard + admin actions
 * (publish toggle, display priority, redaction list with delete + add input,
 * and click-and-drag selection in the body to add a new redaction).
 *
 * State model: `threads` is the source of truth, mutated locally on every
 * action so the UI stays responsive. Server is the authority — every
 * mutation is also POSTed to /api/admin/*; on failure the UI surfaces an
 * error and rolls back.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { EmailReplyCard } from "@/components/email-reply-card";
import { buildExcerpt, pickAnchorHighlight } from "@/lib/excerpt";
import { SDR_FIRST_NAMES } from "@/lib/sdr";
import type { AdminThread } from "@/lib/supabase-public";

type StatusFilter = "all" | "published" | "unpublished" | "high_quality";

/** Compact relative time: "2h", "3d", "2w", "5mo", "1y". Used in the list
 * row metadata so the admin can see at-a-glance how fresh a reply is. */
function timeSince(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const s = Math.max(0, (Date.now() - then) / 1000);
  if (s < 60) return `${Math.floor(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  if (s < 2592000) return `${Math.floor(s / 604800)}w`;
  if (s < 31536000) return `${Math.floor(s / 2592000)}mo`;
  return `${Math.floor(s / 31536000)}y`;
}

interface Props {
  initialThreads: AdminThread[];
  adminEmail: string;
}

interface PendingSelection {
  threadId: number;
  text: string;
  rect: { top: number; left: number; width: number; height: number };
}

export function AdminDashboard({ initialThreads, adminEmail }: Props) {
  const [threads, setThreads] = useState(initialThreads);
  const [selectedId, setSelectedId] = useState<number | null>(
    initialThreads[0]?.thread_id ?? null,
  );
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [error, setError] = useState<string | null>(null);
  const [pendingSel, setPendingSel] = useState<PendingSelection | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const [, startTransition] = useTransition();
  // `timeSince()` uses Date.now(), which differs between SSR snapshot and
  // client hydration. For sub-minute ages the strings don't match and we
  // throw React error #418. Gate the relative-time render on whether we're
  // on the server or client so the server emits an empty placeholder and
  // the client fills it in. useSyncExternalStore is the React-canonical
  // way to express this without setState-in-effect (which the new
  // react-hooks/set-state-in-effect rule rightly flags as cascading-render).
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // Dismiss the floating toolbar when the user clicks anywhere that isn't
  // the toolbar itself or the preview body. Clicking inside the preview
  // body just collapses the selection (handled by the next mouseup).
  useEffect(() => {
    if (!pendingSel) return;
    function onDown(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-selection-toolbar]")) return;
      if (target.closest("[data-preview-pane]")) return;
      setPendingSel(null);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [pendingSel]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return threads.filter((t) => {
      if (filter === "published" && !t.is_published) return false;
      if (filter === "unpublished" && t.is_published) return false;
      if (filter === "high_quality" && !t.is_high_quality) return false;
      if (s.length > 0) {
        const hay =
          `${t.from_display_name ?? ""} ${t.from_email} ${t.subject ?? ""} ${t.body}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [threads, search, filter]);

  // Debug stats — surfaced in the sidebar so we can spot drift between the
  // server-fetched threads and what's actually in the DB at a glance.
  const counts = useMemo(() => {
    const total = threads.length;
    const hq = threads.filter((t) => t.is_high_quality).length;
    const published = threads.filter((t) => t.is_published).length;
    const unpublished = total - published;
    return { total, hq, published, unpublished };
  }, [threads]);

  const selected = threads.find((t) => t.thread_id === selectedId) ?? null;

  // All optimistic mutations use functional setThreads(prev => …) so they
  // always read the latest state. Closing over `t.redactions` from the
  // call-time snapshot caused stale-state bugs where rollbacks duplicated
  // entries (the source of the React duplicate-key warning).
  function patchThread(id: number, fn: (t: AdminThread) => AdminThread) {
    setThreads((prev) => prev.map((t) => (t.thread_id === id ? fn(t) : t)));
  }

  async function call(path: string, init: RequestInit): Promise<Response> {
    const res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.message ?? body?.error ?? `${path} failed (${res.status})`);
    }
    return res;
  }

  async function togglePublished(threadId: number) {
    // Read current value from closure rather than relying on the setState
    // updater to set closure variables synchronously (React 19 doesn't
    // guarantee that — see removeRedaction).
    const current = threads.find((t) => t.thread_id === threadId);
    if (!current) return;
    const prevValue = current.is_published;
    const nextValue = !prevValue;

    patchThread(threadId, (t) => ({ ...t, is_published: nextValue }));
    try {
      await call("/api/admin/publish", {
        method: "POST",
        body: JSON.stringify({ thread_id: threadId, is_published: nextValue }),
      });
      await call("/api/admin/revalidate", { method: "POST" });
    } catch (e) {
      patchThread(threadId, (t) => ({ ...t, is_published: prevValue }));
      setError(e instanceof Error ? e.message : "Failed to update publish state");
    }
  }

  async function setPriority(threadId: number, value: number) {
    const current = threads.find((t) => t.thread_id === threadId);
    if (!current) return;
    const prevValue = current.display_priority;

    patchThread(threadId, (t) => ({ ...t, display_priority: value }));
    try {
      await call("/api/admin/publish", {
        method: "POST",
        body: JSON.stringify({ thread_id: threadId, display_priority: value }),
      });
      await call("/api/admin/revalidate", { method: "POST" });
    } catch (e) {
      patchThread(threadId, (t) => ({ ...t, display_priority: prevValue }));
      setError(e instanceof Error ? e.message : "Failed to update priority");
    }
  }

  async function addRedaction(threadId: number, text: string) {
    const trimmed = text.trim();
    if (trimmed.length < 2) return;
    // Generate a robust unique temp id — Date.now() alone collides when
    // the same handler fires twice within a millisecond (which is what
    // produced the duplicate React keys).
    const tempId = -(Date.now() * 1000 + Math.floor(Math.random() * 1000));

    let dupe = false;
    patchThread(threadId, (t) => {
      if (t.redactions.some((r) => r.text === trimmed)) {
        dupe = true;
        return t;
      }
      return {
        ...t,
        // Admin-added redactions are literal substring matches by default
        // (matches the API contract — see app/api/admin/redactions/route.ts).
        redactions: [
          ...t.redactions,
          { id: tempId, text: trimmed, source: "admin", match_type: "literal" },
        ],
      };
    });
    if (dupe) return;

    try {
      const res = await call("/api/admin/redactions", {
        method: "POST",
        body: JSON.stringify({ thread_id: threadId, text: trimmed }),
      });
      const { redaction } = await res.json();
      patchThread(threadId, (t) => {
        if (!redaction?.id) {
          // Server didn't return a row — drop the temp.
          return { ...t, redactions: t.redactions.filter((r) => r.id !== tempId) };
        }
        // Replace temp with the real row. If the real row already exists
        // (rare race: same text added concurrently), filter the dupe.
        const withoutTemp = t.redactions.filter((r) => r.id !== tempId);
        if (withoutTemp.some((r) => r.id === redaction.id)) return { ...t, redactions: withoutTemp };
        return {
          ...t,
          redactions: [
            ...withoutTemp,
            {
              id: redaction.id,
              text: trimmed,
              source: "admin",
              match_type: redaction.match_type ?? "literal",
            },
          ],
        };
      });
      await call("/api/admin/revalidate", { method: "POST" });
    } catch (e) {
      patchThread(threadId, (t) => ({
        ...t,
        redactions: t.redactions.filter((r) => r.id !== tempId),
      }));
      setError(e instanceof Error ? e.message : "Failed to add redaction");
    }
  }

  async function removeRedaction(threadId: number, redactionId: number) {
    // Refuse to delete temp ids — they aren't persisted yet.
    if (redactionId < 0) return;

    // Read the target redaction from CURRENT state via the closure (threads
    // is recreated every render, so this is the latest committed state at
    // click time). This pattern avoids the React-19-concurrent-mode
    // gotcha where the setState(prev => ...) reducer is not guaranteed to
    // run synchronously, so closure variables set inside it can't be read
    // immediately after the setState call.
    const current = threads.find((t) => t.thread_id === threadId);
    const target = current?.redactions.find((r) => r.id === redactionId);
    if (!target || target.source !== "admin") return;

    // Optimistic remove.
    patchThread(threadId, (t) => ({
      ...t,
      redactions: t.redactions.filter((r) => r.id !== redactionId),
    }));

    try {
      await call("/api/admin/redactions", {
        method: "DELETE",
        body: JSON.stringify({ id: redactionId }),
      });
      await call("/api/admin/revalidate", { method: "POST" });
    } catch (e) {
      // Re-add on failure (guard against double-add if state already has it).
      patchThread(threadId, (t) =>
        t.redactions.some((r) => r.id === target.id)
          ? t
          : { ...t, redactions: [...t.redactions, target] },
      );
      setError(e instanceof Error ? e.message : "Failed to remove redaction");
    }
  }

  /** mouseUp inside the preview pane → capture the current text selection
   * so the floating toolbar can offer Highlight | Redact actions. We
   * snapshot the rect synchronously because clicking a toolbar button
   * later collapses the live selection. */
  function captureSelection(threadId: number) {
    const sel = window.getSelection?.();
    const text = sel?.toString().trim() ?? "";
    if (!sel || text.length < 2 || sel.rangeCount === 0) {
      setPendingSel(null);
      return;
    }
    const r = sel.getRangeAt(0).getBoundingClientRect();
    setPendingSel({
      threadId,
      text,
      rect: { top: r.top, left: r.left, width: r.width, height: r.height },
    });
  }

  function clearSelection() {
    setPendingSel(null);
    window.getSelection?.()?.removeAllRanges();
  }

  async function addHighlight(threadId: number, text: string) {
    const trimmed = text.trim();
    if (trimmed.length < 2) return;
    const tempId = -(Date.now() * 1000 + Math.floor(Math.random() * 1000));

    let dupe = false;
    patchThread(threadId, (t) => {
      if (t.highlights.some((h) => h.text === trimmed)) {
        dupe = true;
        return t;
      }
      return {
        ...t,
        highlights: [...t.highlights, { id: tempId, text: trimmed, source: "admin" }],
      };
    });
    if (dupe) return;

    try {
      const res = await call("/api/admin/highlights", {
        method: "POST",
        body: JSON.stringify({ thread_id: threadId, text: trimmed }),
      });
      const { highlight } = await res.json();
      patchThread(threadId, (t) => {
        if (!highlight?.id) {
          return { ...t, highlights: t.highlights.filter((h) => h.id !== tempId) };
        }
        const withoutTemp = t.highlights.filter((h) => h.id !== tempId);
        if (withoutTemp.some((h) => h.id === highlight.id)) return { ...t, highlights: withoutTemp };
        return {
          ...t,
          highlights: [
            ...withoutTemp,
            { id: highlight.id, text: trimmed, source: "admin" },
          ],
        };
      });
      await call("/api/admin/revalidate", { method: "POST" });
    } catch (e) {
      patchThread(threadId, (t) => ({
        ...t,
        highlights: t.highlights.filter((h) => h.id !== tempId),
      }));
      setError(e instanceof Error ? e.message : "Failed to add highlight");
    }
  }

  async function removeHighlight(threadId: number, highlightId: number) {
    if (highlightId < 0) return;

    // Read from current state via closure (see removeRedaction for the
    // React-19 reasoning).
    const current = threads.find((t) => t.thread_id === threadId);
    const target = current?.highlights.find((h) => h.id === highlightId);
    if (!target || target.source !== "admin") return;

    patchThread(threadId, (t) => ({
      ...t,
      highlights: t.highlights.filter((h) => h.id !== highlightId),
    }));

    try {
      await call("/api/admin/highlights", {
        method: "DELETE",
        body: JSON.stringify({ id: highlightId }),
      });
      await call("/api/admin/revalidate", { method: "POST" });
    } catch (e) {
      patchThread(threadId, (t) =>
        t.highlights.some((h) => h.id === target.id)
          ? t
          : { ...t, highlights: [...t.highlights, target] },
      );
      setError(e instanceof Error ? e.message : "Failed to remove highlight");
    }
  }

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[30%_1fr]">
      {/* Left pane: thread list */}
      <aside className="flex max-h-screen flex-col border-r border-border bg-bg-subtle">
        <header className="sticky top-0 z-10 space-y-3 border-b border-border bg-surface/95 p-5 backdrop-blur">
          <div className="flex items-center justify-between gap-2">
            <Link
              href="/"
              prefetch={false}
              className="flex min-w-0 items-center gap-2 transition-opacity hover:opacity-80"
              aria-label="Back to wall"
            >
              <Image
                src="/logo.png"
                alt=""
                width={28}
                height={28}
                className="h-7 w-7 shrink-0 rounded-full"
              />
              <div className="min-w-0">
                <p className="truncate text-xs font-medium uppercase tracking-wider text-accent">
                  Admin
                </p>
              </div>
            </Link>
          </div>
          {/* Status line — collapsed from a debug grid into a single row of
           * compact metadata so it reads as a status bar, not a dashboard. */}
          <div className="flex items-center gap-3 text-xs text-fg-subtle">
            <span>
              <span className="font-semibold tabular-nums text-fg">{counts.total}</span> total
            </span>
            <span aria-hidden className="text-border">·</span>
            <span>
              <span className="font-semibold tabular-nums text-success">{counts.hq}</span> HQ
            </span>
            <span aria-hidden className="text-border">·</span>
            <span>
              <span className="font-semibold tabular-nums text-accent">{counts.published}</span> live
            </span>
          </div>
          <input
            type="search"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-button border border-border bg-surface px-3 py-1.5 text-sm text-fg outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
          <div className="flex gap-1.5 text-xs">
            {(
              [
                ["all", "All"],
                ["high_quality", "High quality"],
                ["published", "Published"],
                ["unpublished", "Unpublished"],
              ] as [StatusFilter, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`rounded-pill px-2.5 py-1 transition-colors ${
                  filter === key
                    ? "bg-accent-soft text-accent"
                    : "bg-surface text-fg-muted hover:bg-bg-subtle"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {adminEmail && adminEmail !== "open-access" && (
            <p className="text-xs text-fg-subtle">Signed in as {adminEmail}</p>
          )}
        </header>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-fg-muted">
              No threads match.
            </div>
          ) : (
            <ul className="space-y-px p-2">
              {filtered.map((t) => {
                const isSelected = t.thread_id === selectedId;
                const scoreClass =
                  t.total_score >= 7
                    ? "bg-success-soft text-success"
                    : t.total_score >= 4
                      ? "bg-accent-soft text-accent"
                      : "bg-bg-subtle text-fg-subtle";
                const age = mounted ? timeSince(t.received_at) : "";
                return (
                  <li key={t.thread_id}>
                    <button
                      onClick={() => setSelectedId(t.thread_id)}
                      className={`relative w-full rounded-button border px-4 py-3 text-left transition-all ${
                        isSelected
                          ? "border-accent/30 bg-accent-soft shadow-button"
                          : "border-transparent hover:border-border hover:bg-surface"
                      }`}
                    >
                      {isSelected && (
                        <span
                          aria-hidden
                          className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent"
                        />
                      )}
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-fg">
                          {t.from_display_name ?? t.from_email}
                        </span>
                        <span
                          className={`shrink-0 rounded-pill px-1.5 py-0.5 text-xs font-semibold tabular-nums ${scoreClass}`}
                        >
                          {t.total_score}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-[13px] leading-snug text-fg-muted">
                        {t.subject ?? "(no subject)"}
                      </p>
                      <div className="mt-1.5 flex items-center gap-1.5 text-xs">
                        {age && (
                          <span className="text-fg-subtle tabular-nums">{age}</span>
                        )}
                        {t.is_high_quality && (
                          <span className="rounded-pill bg-success-soft px-1.5 py-px text-success">
                            HQ
                          </span>
                        )}
                        {t.is_published && (
                          <span className="rounded-pill bg-accent-soft px-1.5 py-px text-accent">
                            Live
                          </span>
                        )}
                        {t.display_priority > 0 && (
                          <span className="rounded-pill bg-surface px-1.5 py-px text-fg-muted ring-1 ring-border">
                            #{t.display_priority}
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* Right pane: selected thread preview + actions */}
      <section className="flex max-h-screen flex-col">
        {error && (
          <div className="border-b border-danger/20 bg-danger-soft px-5 py-2 text-xs text-danger">
            {error}
            <button onClick={() => setError(null)} className="ml-3 underline">
              dismiss
            </button>
          </div>
        )}

        {!selected ? (
          <div className="flex flex-1 items-center justify-center text-sm text-fg-muted">
            Select a thread on the left.
          </div>
        ) : (
          <ThreadEditor
            // key forces a remount on thread switch — local form state
            // (the redaction + highlight add inputs, priority field)
            // resets naturally without a setState-in-effect.
            key={selected.thread_id}
            thread={selected}
            onTogglePublished={() => togglePublished(selected.thread_id)}
            onSetPriority={(p) => setPriority(selected.thread_id, p)}
            onAddRedaction={(text) => addRedaction(selected.thread_id, text)}
            onRemoveRedaction={(id) => removeRedaction(selected.thread_id, id)}
            onAddHighlight={(text) => addHighlight(selected.thread_id, text)}
            onRemoveHighlight={(id) => removeHighlight(selected.thread_id, id)}
            onCaptureSelection={() => captureSelection(selected.thread_id)}
          />
        )}
      </section>

      {/* Floating selection toolbar — appears when text is selected in the
       * preview pane. Two actions: Highlight (sets thread.highlight_text) or
       * Redact (adds a row to prw_redactions). Auto-dismisses on outside
       * click via the useEffect above. */}
      {pendingSel && (
        <div
          ref={toolbarRef}
          data-selection-toolbar
          style={{
            position: "fixed",
            top: `${Math.max(8, pendingSel.rect.top - 48)}px`,
            left: `${pendingSel.rect.left + pendingSel.rect.width / 2}px`,
            transform: "translateX(-50%)",
            zIndex: 50,
          }}
          className="flex items-center gap-0.5 rounded-button border border-border bg-surface p-1 shadow-card-hover ring-1 ring-black/5"
        >
          <button
            type="button"
            onClick={() => {
              startTransition(() => addHighlight(pendingSel.threadId, pendingSel.text));
              clearSelection();
            }}
            className="inline-flex items-center gap-1.5 rounded-button bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover"
          >
            <HighlightIcon />
            Highlight
          </button>
          <button
            type="button"
            onClick={() => {
              startTransition(() => addRedaction(pendingSel.threadId, pendingSel.text));
              clearSelection();
            }}
            className="inline-flex items-center gap-1.5 rounded-button px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:bg-bg-subtle hover:text-fg"
          >
            <RedactIcon />
            Redact
          </button>
        </div>
      )}
    </div>
  );
}

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

function ThreadEditor({
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

function HighlightIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11 2l3 3-7 7-3.5.5L4 9l7-7z" />
      <path d="M2 14h12" />
    </svg>
  );
}

function RedactIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <rect x="2" y="6" width="12" height="4" rx="1" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      className="h-3 w-3"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}
