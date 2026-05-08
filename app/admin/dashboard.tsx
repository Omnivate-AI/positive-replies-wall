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
import type { AdminThread } from "@/lib/supabase-public";
import { HighlightIcon, RedactIcon } from "./_components/icons";
import { ThreadEditor } from "./_components/thread-editor";
import { useAdminMutations } from "./_hooks/use-admin-mutations";

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

  // Admin mutations live in TanStack Query hooks — see
  // app/admin/_hooks/use-admin-mutations. Each handler below reads the
  // state it needs SYNCHRONOUSLY from the `threads` closure and passes it
  // through as args to `mutate(...)`. The hooks no longer rely on
  // closure-capture inside `setThreads(prev => ...)` updaters — which was
  // the lesson-2.5 React-19-concurrent-mode bug that re-emerged in
  // Batch 5. Reading via the parent closure is the project report's
  // documented fix.
  const mutations = useAdminMutations(setThreads, setError);

  // Stable temp-id allocator. Negative so it can never collide with a
  // real DB id. Microsecond-granular plus a random tail to avoid
  // collisions when handlers fire in the same millisecond.
  const newTempId = (): number =>
    -(Date.now() * 1000 + Math.floor(Math.random() * 1000));

  function togglePublished(threadId: number) {
    const current = threads.find((t) => t.thread_id === threadId);
    if (!current) return;
    mutations.togglePublished.mutate({
      threadId,
      nextValue: !current.is_published,
      prevValue: current.is_published,
    });
  }

  function setPriority(threadId: number, value: number) {
    const current = threads.find((t) => t.thread_id === threadId);
    if (!current) return;
    if (value === current.display_priority) return;
    mutations.setPriority.mutate({
      threadId,
      value,
      prevValue: current.display_priority,
    });
  }

  function addRedaction(threadId: number, text: string) {
    const trimmed = text.trim();
    if (trimmed.length < 2) return;
    const current = threads.find((t) => t.thread_id === threadId);
    if (!current) return;
    // Skip duplicates synchronously (the hook no longer does the dupe
    // check internally — running it inside a setThreads updater is the
    // very pattern that fails under React 19).
    if (current.redactions.some((r) => r.text === trimmed)) return;
    mutations.addRedaction.mutate({
      threadId,
      text: trimmed,
      tempId: newTempId(),
    });
  }

  function removeRedaction(threadId: number, redactionId: number) {
    if (redactionId < 0) return; // refuse to delete tempIds — not persisted
    const current = threads.find((t) => t.thread_id === threadId);
    const target = current?.redactions.find((r) => r.id === redactionId);
    if (!target || target.source !== "admin") return;
    mutations.removeRedaction.mutate({ threadId, redactionId, target });
  }

  function addHighlight(threadId: number, text: string) {
    const trimmed = text.trim();
    if (trimmed.length < 2) return;
    const current = threads.find((t) => t.thread_id === threadId);
    if (!current) return;
    if (current.highlights.some((h) => h.text === trimmed)) return;
    mutations.addHighlight.mutate({
      threadId,
      text: trimmed,
      tempId: newTempId(),
    });
  }

  function removeHighlight(threadId: number, highlightId: number) {
    if (highlightId < 0) return;
    const current = threads.find((t) => t.thread_id === threadId);
    const target = current?.highlights.find((h) => h.id === highlightId);
    if (!target || target.source !== "admin") return;
    mutations.removeHighlight.mutate({ threadId, highlightId, target });
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


