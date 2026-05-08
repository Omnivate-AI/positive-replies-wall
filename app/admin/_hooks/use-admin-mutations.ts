"use client";

/**
 * Admin mutation hooks — six TanStack Query `useMutation` calls covering
 * publish/priority/redaction/highlight CRUD.
 *
 * Architectural note (lesson 2.5 from report.md, re-applied 2026-05-08):
 * each hook receives all state it needs (prevValue / target / tempId)
 * via `mutate({...})` args. The caller (dashboard.tsx) reads the current
 * `threads` closure SYNCHRONOUSLY in the click handler and passes through.
 * This avoids the React-19-concurrent-mode footgun where reading state
 * inside a `setThreads(prev => …)` updater is deferred until render —
 * `let target = …; setThreads(prev => { target = …; return … });
 * return { target };` returns `target` undefined because the updater
 * runs LATER, not during the setState call.
 *
 * Lifecycle:
 *   - mutationFn: hits /api/admin/* and follows up with revalidate.
 *   - onMutate: optimistic forward update only (writes to local state).
 *   - onSuccess: reconciles local state with the server response (e.g.
 *     replace tempId with the real DB id).
 *   - onError: rolls back using the args passed to mutate (NOT a
 *     captured-from-updater context).
 *
 * Why no useQuery for threads: the threads list is server-rendered in
 * `app/admin/page.tsx` (force-dynamic) and passed as `initialThreads`.
 * Local-state mutation through useState + functional patches is
 * sufficient. Moving the source of truth into the QueryClient is a
 * follow-up that can land alongside the main-app integration's auth
 * model.
 */

import { useMutation } from "@tanstack/react-query";
import type { AdminThread, RedactionMatchType } from "@/lib/supabase-public";

export type SetThreadsFn = (
  fn: (prev: AdminThread[]) => AdminThread[],
) => void;
export type SetErrorFn = (err: string | null) => void;

export interface AdminRedaction {
  id: number;
  text: string;
  source: string;
  match_type: RedactionMatchType;
}

export interface AdminHighlight {
  id: number;
  text: string;
  source: string;
}

async function api(path: string, init: RequestInit): Promise<Response> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
    };
    throw new Error(body.message ?? body.error ?? `${path} failed (${res.status})`);
  }
  return res;
}

async function revalidate(): Promise<void> {
  // Best-effort — a failed revalidate doesn't fail the mutation. The next
  // ISR cycle (60s) picks the changes up regardless.
  try {
    await api("/api/admin/revalidate", { method: "POST" });
  } catch {
    /* swallow */
  }
}

function patchOne(
  setThreads: SetThreadsFn,
  threadId: number,
  fn: (t: AdminThread) => AdminThread,
): void {
  setThreads((prev) => prev.map((t) => (t.thread_id === threadId ? fn(t) : t)));
}

// ─── Publish toggle ─────────────────────────────────────────────────────

export interface TogglePublishedArgs {
  threadId: number;
  nextValue: boolean;
  /** Caller-provided previous value for rollback on error. Read
   * synchronously in the dashboard handler from the `threads` closure
   * before calling `mutate(...)`. */
  prevValue: boolean;
}

export function useTogglePublished(
  setThreads: SetThreadsFn,
  setError: SetErrorFn,
) {
  return useMutation<void, Error, TogglePublishedArgs>({
    mutationFn: async ({ threadId, nextValue }) => {
      await api("/api/admin/publish", {
        method: "POST",
        body: JSON.stringify({ thread_id: threadId, is_published: nextValue }),
      });
      await revalidate();
    },
    onMutate: ({ threadId, nextValue }) => {
      patchOne(setThreads, threadId, (t) => ({ ...t, is_published: nextValue }));
    },
    onError: (err, { threadId, prevValue }) => {
      patchOne(setThreads, threadId, (t) => ({ ...t, is_published: prevValue }));
      setError(err.message || "Failed to update publish state");
    },
  });
}

// ─── Priority ───────────────────────────────────────────────────────────

export interface SetPriorityArgs {
  threadId: number;
  value: number;
  prevValue: number;
}

export function useSetPriority(
  setThreads: SetThreadsFn,
  setError: SetErrorFn,
) {
  return useMutation<void, Error, SetPriorityArgs>({
    mutationFn: async ({ threadId, value }) => {
      await api("/api/admin/publish", {
        method: "POST",
        body: JSON.stringify({ thread_id: threadId, display_priority: value }),
      });
      await revalidate();
    },
    onMutate: ({ threadId, value }) => {
      patchOne(setThreads, threadId, (t) => ({ ...t, display_priority: value }));
    },
    onError: (err, { threadId, prevValue }) => {
      patchOne(setThreads, threadId, (t) => ({
        ...t,
        display_priority: prevValue,
      }));
      setError(err.message || "Failed to update priority");
    },
  });
}

// ─── Add redaction ──────────────────────────────────────────────────────

export interface AddRedactionArgs {
  threadId: number;
  text: string;
  /** Caller-generated negative id used for the optimistic row, then
   * swapped for the real DB id in onSuccess. */
  tempId: number;
}

export function useAddRedaction(
  setThreads: SetThreadsFn,
  setError: SetErrorFn,
) {
  return useMutation<
    { redaction?: { id: number; match_type?: RedactionMatchType } },
    Error,
    AddRedactionArgs
  >({
    mutationFn: async ({ threadId, text }) => {
      const res = await api("/api/admin/redactions", {
        method: "POST",
        body: JSON.stringify({ thread_id: threadId, text }),
      });
      const body = (await res.json()) as {
        redaction?: { id: number; match_type?: RedactionMatchType };
      };
      await revalidate();
      return body;
    },
    onMutate: ({ threadId, text, tempId }) => {
      const trimmed = text.trim();
      // Admin-added redactions default to literal substring match, matching
      // the API contract (see app/api/admin/redactions/route.ts).
      patchOne(setThreads, threadId, (t) => ({
        ...t,
        redactions: [
          ...t.redactions,
          { id: tempId, text: trimmed, source: "admin", match_type: "literal" },
        ],
      }));
    },
    onSuccess: (data, { threadId, text, tempId }) => {
      const trimmed = text.trim();
      const realId = data.redaction?.id;
      const matchType: RedactionMatchType = data.redaction?.match_type ?? "literal";
      patchOne(setThreads, threadId, (t) => {
        const withoutTemp = t.redactions.filter((r) => r.id !== tempId);
        if (!realId) return { ...t, redactions: withoutTemp };
        if (withoutTemp.some((r) => r.id === realId)) {
          // Server's row already in state (rare race: same text added
          // concurrently or returned by a prior fetch). Just drop the temp.
          return { ...t, redactions: withoutTemp };
        }
        return {
          ...t,
          redactions: [
            ...withoutTemp,
            { id: realId, text: trimmed, source: "admin", match_type: matchType },
          ],
        };
      });
    },
    onError: (err, { threadId, tempId }) => {
      patchOne(setThreads, threadId, (t) => ({
        ...t,
        redactions: t.redactions.filter((r) => r.id !== tempId),
      }));
      setError(err.message || "Failed to add redaction");
    },
  });
}

// ─── Remove redaction ───────────────────────────────────────────────────

export interface RemoveRedactionArgs {
  threadId: number;
  redactionId: number;
  /** Caller passes the full target row so onError can re-add it on
   * rollback without depending on stale local state. */
  target: AdminRedaction;
}

export function useRemoveRedaction(
  setThreads: SetThreadsFn,
  setError: SetErrorFn,
) {
  return useMutation<void, Error, RemoveRedactionArgs>({
    mutationFn: async ({ redactionId }) => {
      await api("/api/admin/redactions", {
        method: "DELETE",
        body: JSON.stringify({ id: redactionId }),
      });
      await revalidate();
    },
    onMutate: ({ threadId, redactionId }) => {
      patchOne(setThreads, threadId, (t) => ({
        ...t,
        redactions: t.redactions.filter((r) => r.id !== redactionId),
      }));
    },
    onError: (err, { threadId, target }) => {
      patchOne(setThreads, threadId, (t) =>
        t.redactions.some((r) => r.id === target.id)
          ? t
          : { ...t, redactions: [...t.redactions, target] },
      );
      setError(err.message || "Failed to remove redaction");
    },
  });
}

// ─── Add highlight ──────────────────────────────────────────────────────

export interface AddHighlightArgs {
  threadId: number;
  text: string;
  tempId: number;
}

export function useAddHighlight(
  setThreads: SetThreadsFn,
  setError: SetErrorFn,
) {
  return useMutation<
    { highlight?: { id: number } },
    Error,
    AddHighlightArgs
  >({
    mutationFn: async ({ threadId, text }) => {
      const res = await api("/api/admin/highlights", {
        method: "POST",
        body: JSON.stringify({ thread_id: threadId, text }),
      });
      const body = (await res.json()) as { highlight?: { id: number } };
      await revalidate();
      return body;
    },
    onMutate: ({ threadId, text, tempId }) => {
      const trimmed = text.trim();
      patchOne(setThreads, threadId, (t) => ({
        ...t,
        highlights: [
          ...t.highlights,
          { id: tempId, text: trimmed, source: "admin" },
        ],
      }));
    },
    onSuccess: (data, { threadId, text, tempId }) => {
      const trimmed = text.trim();
      const realId = data.highlight?.id;
      patchOne(setThreads, threadId, (t) => {
        const withoutTemp = t.highlights.filter((h) => h.id !== tempId);
        if (!realId) return { ...t, highlights: withoutTemp };
        if (withoutTemp.some((h) => h.id === realId)) {
          return { ...t, highlights: withoutTemp };
        }
        return {
          ...t,
          highlights: [
            ...withoutTemp,
            { id: realId, text: trimmed, source: "admin" },
          ],
        };
      });
    },
    onError: (err, { threadId, tempId }) => {
      patchOne(setThreads, threadId, (t) => ({
        ...t,
        highlights: t.highlights.filter((h) => h.id !== tempId),
      }));
      setError(err.message || "Failed to add highlight");
    },
  });
}

// ─── Remove highlight ───────────────────────────────────────────────────

export interface RemoveHighlightArgs {
  threadId: number;
  highlightId: number;
  target: AdminHighlight;
}

export function useRemoveHighlight(
  setThreads: SetThreadsFn,
  setError: SetErrorFn,
) {
  return useMutation<void, Error, RemoveHighlightArgs>({
    mutationFn: async ({ highlightId }) => {
      await api("/api/admin/highlights", {
        method: "DELETE",
        body: JSON.stringify({ id: highlightId }),
      });
      await revalidate();
    },
    onMutate: ({ threadId, highlightId }) => {
      patchOne(setThreads, threadId, (t) => ({
        ...t,
        highlights: t.highlights.filter((h) => h.id !== highlightId),
      }));
    },
    onError: (err, { threadId, target }) => {
      patchOne(setThreads, threadId, (t) =>
        t.highlights.some((h) => h.id === target.id)
          ? t
          : { ...t, highlights: [...t.highlights, target] },
      );
      setError(err.message || "Failed to remove highlight");
    },
  });
}

/** Bundled accessor — gives the dashboard a single `mutations` object. */
export function useAdminMutations(
  setThreads: SetThreadsFn,
  setError: SetErrorFn,
) {
  return {
    togglePublished: useTogglePublished(setThreads, setError),
    setPriority: useSetPriority(setThreads, setError),
    addRedaction: useAddRedaction(setThreads, setError),
    removeRedaction: useRemoveRedaction(setThreads, setError),
    addHighlight: useAddHighlight(setThreads, setError),
    removeHighlight: useRemoveHighlight(setThreads, setError),
  };
}
