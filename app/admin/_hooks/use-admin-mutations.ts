"use client";

/**
 * Admin mutation hooks — six TanStack Query `useMutation` calls covering
 * publish/priority/redaction/highlight CRUD. Each owns its lifecycle:
 *   - mutationFn: hits /api/admin/* and follows up with revalidate.
 *   - onMutate: optimistically updates local thread state, returns context
 *     (snapshot or temp id) for rollback.
 *   - onError: rolls back using the context.
 *   - onSuccess: reconciles the local state with the server response
 *     (replaces a temp id with the real one, etc.).
 *
 * Why not a `useQuery` for threads? The threads list is server-rendered in
 * `app/admin/page.tsx` (force-dynamic) and passed as `initialThreads`. The
 * mutations modify the local state directly. Moving the source of truth
 * into the QueryClient is a follow-up that lands when the main-app
 * integration introduces auth and we restructure for shared state.
 */

import { useMutation } from "@tanstack/react-query";
import type { AdminThread, RedactionMatchType } from "@/lib/supabase-public";

export type SetThreadsFn = (
  fn: (prev: AdminThread[]) => AdminThread[],
) => void;
export type SetErrorFn = (err: string | null) => void;

interface AdminRedaction {
  id: number;
  text: string;
  source: string;
  match_type: RedactionMatchType;
}

interface AdminHighlight {
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
  // ISR cycle (60s) will pick the changes up regardless.
  try {
    await api("/api/admin/revalidate", { method: "POST" });
  } catch {
    /* swallow */
  }
}

const tempId = (): number =>
  -(Date.now() * 1000 + Math.floor(Math.random() * 1000));

function patchOne(
  setThreads: SetThreadsFn,
  threadId: number,
  fn: (t: AdminThread) => AdminThread,
): void {
  setThreads((prev) => prev.map((t) => (t.thread_id === threadId ? fn(t) : t)));
}

// ─── Publish toggle ─────────────────────────────────────────────────────

interface TogglePublishedArgs {
  threadId: number;
  nextValue: boolean;
}

export function useTogglePublished(
  setThreads: SetThreadsFn,
  setError: SetErrorFn,
) {
  return useMutation<
    void,
    Error,
    TogglePublishedArgs,
    { prevValue: boolean | undefined }
  >({
    mutationFn: async ({ threadId, nextValue }) => {
      await api("/api/admin/publish", {
        method: "POST",
        body: JSON.stringify({ thread_id: threadId, is_published: nextValue }),
      });
      await revalidate();
    },
    onMutate: async ({ threadId, nextValue }) => {
      let prevValue: boolean | undefined;
      setThreads((prev) => {
        const target = prev.find((t) => t.thread_id === threadId);
        prevValue = target?.is_published;
        return prev.map((t) =>
          t.thread_id === threadId ? { ...t, is_published: nextValue } : t,
        );
      });
      return { prevValue };
    },
    onError: (err, { threadId }, context) => {
      if (context?.prevValue !== undefined) {
        patchOne(setThreads, threadId, (t) => ({
          ...t,
          is_published: context.prevValue!,
        }));
      }
      setError(err.message || "Failed to update publish state");
    },
  });
}

// ─── Priority ───────────────────────────────────────────────────────────

interface SetPriorityArgs {
  threadId: number;
  value: number;
}

export function useSetPriority(
  setThreads: SetThreadsFn,
  setError: SetErrorFn,
) {
  return useMutation<
    void,
    Error,
    SetPriorityArgs,
    { prevValue: number | undefined }
  >({
    mutationFn: async ({ threadId, value }) => {
      await api("/api/admin/publish", {
        method: "POST",
        body: JSON.stringify({ thread_id: threadId, display_priority: value }),
      });
      await revalidate();
    },
    onMutate: async ({ threadId, value }) => {
      let prevValue: number | undefined;
      setThreads((prev) => {
        prevValue = prev.find((t) => t.thread_id === threadId)?.display_priority;
        return prev.map((t) =>
          t.thread_id === threadId ? { ...t, display_priority: value } : t,
        );
      });
      return { prevValue };
    },
    onError: (err, { threadId }, context) => {
      if (context?.prevValue !== undefined) {
        patchOne(setThreads, threadId, (t) => ({
          ...t,
          display_priority: context.prevValue!,
        }));
      }
      setError(err.message || "Failed to update priority");
    },
  });
}

// ─── Add redaction ──────────────────────────────────────────────────────

interface AddRedactionArgs {
  threadId: number;
  text: string;
}

export function useAddRedaction(
  setThreads: SetThreadsFn,
  setError: SetErrorFn,
) {
  return useMutation<
    { redaction?: { id: number; match_type?: RedactionMatchType } },
    Error,
    AddRedactionArgs,
    { tempId: number; dupe: boolean }
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
    onMutate: async ({ threadId, text }) => {
      const trimmed = text.trim();
      const id = tempId();
      let dupe = false;
      patchOne(setThreads, threadId, (t) => {
        if (t.redactions.some((r) => r.text === trimmed)) {
          dupe = true;
          return t;
        }
        // Admin-added redactions are literal substring matches by default
        // (matches the API contract — see app/api/admin/redactions/route.ts).
        return {
          ...t,
          redactions: [
            ...t.redactions,
            { id, text: trimmed, source: "admin", match_type: "literal" },
          ],
        };
      });
      return { tempId: id, dupe };
    },
    onSuccess: (data, { threadId, text }, context) => {
      if (!context || context.dupe) return;
      const trimmed = text.trim();
      const realId = data.redaction?.id;
      const matchType: RedactionMatchType = data.redaction?.match_type ?? "literal";
      patchOne(setThreads, threadId, (t) => {
        const withoutTemp = t.redactions.filter((r) => r.id !== context.tempId);
        if (!realId) return { ...t, redactions: withoutTemp };
        // Avoid double-add if the real row already exists (rare race).
        if (withoutTemp.some((r) => r.id === realId)) {
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
    onError: (err, { threadId }, context) => {
      if (context && !context.dupe) {
        patchOne(setThreads, threadId, (t) => ({
          ...t,
          redactions: t.redactions.filter((r) => r.id !== context.tempId),
        }));
      }
      setError(err.message || "Failed to add redaction");
    },
  });
}

// ─── Remove redaction ───────────────────────────────────────────────────

interface RemoveRedactionArgs {
  threadId: number;
  redactionId: number;
}

export function useRemoveRedaction(
  setThreads: SetThreadsFn,
  setError: SetErrorFn,
) {
  return useMutation<
    void,
    Error,
    RemoveRedactionArgs,
    { target: AdminRedaction | null }
  >({
    mutationFn: async ({ redactionId }) => {
      // Refuse to delete temp ids — they aren't persisted.
      if (redactionId < 0) return;
      await api("/api/admin/redactions", {
        method: "DELETE",
        body: JSON.stringify({ id: redactionId }),
      });
      await revalidate();
    },
    onMutate: async ({ threadId, redactionId }) => {
      if (redactionId < 0) return { target: null };
      let target: AdminRedaction | null = null;
      setThreads((prev) =>
        prev.map((t) => {
          if (t.thread_id !== threadId) return t;
          const found = t.redactions.find((r) => r.id === redactionId);
          if (!found || found.source !== "admin") return t;
          target = found;
          return { ...t, redactions: t.redactions.filter((r) => r.id !== redactionId) };
        }),
      );
      return { target };
    },
    onError: (err, { threadId }, context) => {
      if (context?.target) {
        const target = context.target;
        patchOne(setThreads, threadId, (t) =>
          t.redactions.some((r) => r.id === target.id)
            ? t
            : { ...t, redactions: [...t.redactions, target] },
        );
      }
      setError(err.message || "Failed to remove redaction");
    },
  });
}

// ─── Add highlight ──────────────────────────────────────────────────────

interface AddHighlightArgs {
  threadId: number;
  text: string;
}

export function useAddHighlight(
  setThreads: SetThreadsFn,
  setError: SetErrorFn,
) {
  return useMutation<
    { highlight?: { id: number } },
    Error,
    AddHighlightArgs,
    { tempId: number; dupe: boolean }
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
    onMutate: async ({ threadId, text }) => {
      const trimmed = text.trim();
      const id = tempId();
      let dupe = false;
      patchOne(setThreads, threadId, (t) => {
        if (t.highlights.some((h) => h.text === trimmed)) {
          dupe = true;
          return t;
        }
        return {
          ...t,
          highlights: [...t.highlights, { id, text: trimmed, source: "admin" }],
        };
      });
      return { tempId: id, dupe };
    },
    onSuccess: (data, { threadId, text }, context) => {
      if (!context || context.dupe) return;
      const trimmed = text.trim();
      const realId = data.highlight?.id;
      patchOne(setThreads, threadId, (t) => {
        const withoutTemp = t.highlights.filter((h) => h.id !== context.tempId);
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
    onError: (err, { threadId }, context) => {
      if (context && !context.dupe) {
        patchOne(setThreads, threadId, (t) => ({
          ...t,
          highlights: t.highlights.filter((h) => h.id !== context.tempId),
        }));
      }
      setError(err.message || "Failed to add highlight");
    },
  });
}

// ─── Remove highlight ───────────────────────────────────────────────────

interface RemoveHighlightArgs {
  threadId: number;
  highlightId: number;
}

export function useRemoveHighlight(
  setThreads: SetThreadsFn,
  setError: SetErrorFn,
) {
  return useMutation<
    void,
    Error,
    RemoveHighlightArgs,
    { target: AdminHighlight | null }
  >({
    mutationFn: async ({ highlightId }) => {
      if (highlightId < 0) return;
      await api("/api/admin/highlights", {
        method: "DELETE",
        body: JSON.stringify({ id: highlightId }),
      });
      await revalidate();
    },
    onMutate: async ({ threadId, highlightId }) => {
      if (highlightId < 0) return { target: null };
      let target: AdminHighlight | null = null;
      setThreads((prev) =>
        prev.map((t) => {
          if (t.thread_id !== threadId) return t;
          const found = t.highlights.find((h) => h.id === highlightId);
          if (!found || found.source !== "admin") return t;
          target = found;
          return {
            ...t,
            highlights: t.highlights.filter((h) => h.id !== highlightId),
          };
        }),
      );
      return { target };
    },
    onError: (err, { threadId }, context) => {
      if (context?.target) {
        const target = context.target;
        patchOne(setThreads, threadId, (t) =>
          t.highlights.some((h) => h.id === target.id)
            ? t
            : { ...t, highlights: [...t.highlights, target] },
        );
      }
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
