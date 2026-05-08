### [Improvement] `runClassifyBatch` floats promises and silently drops cleanup-error rejections

**Severity:** Low
**Priority:** P3
**Status:** Closed
**Area:** `trigger/lib/classify-batch.ts`

**Resolution:** Replaced the in-flight Set + `Promise.race` loop with an explicit `pMap<T, R>(items, fn, concurrency, onComplete?)` helper. Each item runs inside a worker that fully `await`s `fn(item)` and slots the result by index — no floating promises, no `.finally()` cleanup, no `inflight.delete` race. Each item returns either `{ ok: true, ... }` or `{ ok: false, error }` so a single bad thread never sinks the run; the outer aggregation loop accumulates stats from the result array as straight-line code. The structural fragility (interleaved counter increments under partial failures) is gone — counter math is sequential post-pMap. Existing e2e tests (`tests/e2e/classify-end-to-end.test.ts`) pass without modification, confirming behavior parity. With ESLint scope expanded in Batch 1, the file is now linted; no `no-floating-promises` violations.

**Problem**
The concurrency loop in `runClassifyBatch` (`trigger/lib/classify-batch.ts:218-256`) launches each thread's classify+write task into an in-flight Set, then `Promise.race`s on the set to wait for slot availability:

```ts
const launch = (thread: PendingThread): Promise<void> => {
  ...
  const p = (async () => {
    try {
      const result = await classifyReply(input);
      const writeStats = await writeClassification(thread, result);
      ...
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      stats.errors.push(`thread ${thread.thread_id}: ${msg}`);
    }
  })();
  inflight.add(p);
  p.finally(() => inflight.delete(p));   // ← floats; if `delete()` itself throws, unhandled
  return p;
};

while (cursor < pending.length || inflight.size > 0) {
  while (inflight.size < concurrency && cursor < pending.length) {
    launch(pending[cursor++]);            // ← return value discarded; `launch` returns Promise<void>
  }
  if (inflight.size > 0) await Promise.race(inflight);
}
```

Two things to flag:

1. **`launch(pending[cursor++])` discards the returned promise.** The promise is held in the `inflight` Set, so it's tracked — that's fine for waiting. But the discarded return value bypasses ESLint's `no-floating-promises` rule (which is also disabled today because `trigger/` is excluded from lint — see ticket 005). If `launch` ever changes shape (e.g. starts throwing synchronously on an invalid input), the failure becomes silent.

2. **`p.finally(() => inflight.delete(p))` floats a promise.** Standard pattern, but `finally` returns a new promise that can reject if `delete` throws (unlikely on Set, but the linter would still flag).

3. **`Promise.race(inflight)` is called after `await`. If `inflight.size === 0`** (all in-flight tasks already settled while this iteration was running), the `if (inflight.size > 0)` guard skips it — but this leaves a brief loop where neither cursor advances nor we wait. Fine in practice (the outer condition exits), but the structure is more complex than necessary.

Functionally the loop works (the e2e tests verify it). The improvement is structural — it would benefit from `Promise.all` over chunked slices, or a small `pLimit`-style helper, both of which:
- Make the promise lifecycle explicit.
- Surface any single failure as a thrown rejection from the loop.
- Are easier to reason about + test.

**Impact**
- Today: nothing observable.
- Potential: the swallowed cleanup-rejection path means a deeply unexpected error during stats accumulation could leave runs hung in a way that isn't visible in the Trigger.dev dashboard. Probability low; severity bounded.

**Evidence**
- `trigger/lib/classify-batch.ts:218-256` — full loop body (cited).
- `trigger/lib/classify-batch.ts:230-244` — try/catch around the work, but stats mutations after a partial failure aren't atomic (e.g. `stats.threadsClassified++; if (result.is_high_quality) stats.threadsHighQuality++;` — a thrown error between those two lines leaves a half-counted state, which the catch block then turns into an "errors" entry. Only matters if internal stats logic ever throws, which today is plain `++`. But the structure is fragile to refactors.).

**Expected behavior**
A clearer concurrency primitive that:
1. Fails loud on any unexpected error (synchronous or otherwise).
2. Reads as a single expression.
3. Is easy to test in isolation.

**Suggested fix**
Replace the in-flight Set with a small `pMap`-style helper:

```ts
async function pMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, worker);
  await Promise.all(workers);
  return results;
}
```

Then the batch loop becomes:

```ts
const results = await pMap(
  pending,
  async (thread) => {
    try {
      const result = await classifyReply(buildClassifyInput(thread));
      const writeStats = await writeClassification(thread, result);
      return { ok: true, thread, result, writeStats };
    } catch (e) {
      return { ok: false, thread, error: e instanceof Error ? e.message : String(e) };
    }
  },
  concurrency,
);

for (const r of results) {
  if (!r.ok) { stats.errors.push(`thread ${r.thread.thread_id}: ${r.error}`); continue; }
  stats.threadsClassified++;
  ...
}
```

**Acceptance criteria**
- [ ] Concurrency loop is one expression with explicit error-or-success per item.
- [ ] No floating promise patterns (`p.finally(() => …)` without await/catch).
- [ ] Behavior is unchanged for the existing e2e tests in `tests/e2e/classify-end-to-end.test.ts`.
- [ ] (If ticket 005 lands) the file passes `npm run lint` with `no-floating-promises` enabled.
