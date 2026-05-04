/**
 * Generic retry helper for transient failures.
 *
 * Used to wrap Supabase upserts: the Trigger.dev backfill saw a handful of
 * `TypeError: fetch failed` errors mid-run. Without retry, those campaigns
 * silently lose their batch of replies — partial-completion is exactly the
 * kind of problem enterprise pipelines must avoid.
 */

export interface RetryOptions {
  maxAttempts?: number;
  /** Initial backoff in ms; doubled each attempt, capped at maxDelayMs. */
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Decide if an error is worth retrying. Default: any thrown error retries. */
  isRetryable?: (e: unknown) => boolean;
  /** Optional callback for observability. */
  onRetry?: (attempt: number, err: unknown, delayMs: number) => void;
}

const DEFAULTS: Required<Omit<RetryOptions, "isRetryable" | "onRetry">> = {
  maxAttempts: 4,
  baseDelayMs: 500,
  maxDelayMs: 8000,
};

export async function retry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? DEFAULTS.maxAttempts;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULTS.baseDelayMs;
  const maxDelayMs = opts.maxDelayMs ?? DEFAULTS.maxDelayMs;
  const isRetryable = opts.isRetryable ?? (() => true);

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt >= maxAttempts || !isRetryable(e)) throw e;
      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      if (opts.onRetry) opts.onRetry(attempt, e, delay);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

/** Heuristic: retry on transient network errors (TypeError from fetch failures). */
export function isTransientFetchError(e: unknown): boolean {
  if (e instanceof TypeError) return true; // node fetch wraps network/DNS errors as TypeError
  const msg = e instanceof Error ? e.message : String(e);
  return /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up/i.test(msg);
}
