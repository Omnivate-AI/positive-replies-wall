### [Improvement] `scripts/apply-migration.ts` uses top-level await without awaiting graceful shutdown; on Postgres-side error it surfaces opaque text

**Severity:** Low
**Priority:** P3
**Status:** Open
**Area:** `scripts/apply-migration.ts`

**Problem**
`scripts/apply-migration.ts:34-52` uses top-level `await` to POST a SQL file to the Supabase Management API:

```ts
const res = await fetch(
  `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  },
);

const body = await res.text();
if (!res.ok) {
  console.error(`HTTP ${res.status}: ${body}`);
  process.exit(1);
}
console.log(`OK (${res.status})`);
console.log(body.slice(0, 500));
```

Two issues:

1. **No SQL error handling on `200 OK` responses.** The Supabase Management API returns 200 with a JSON body containing `{ error: "..." }` for SQL-side errors (constraint violation, syntax error, missing table, etc.) — the script logs `OK (200)` and the first 500 chars of the body, then exits 0. So a migration with a syntax error reports as success.
2. **Idempotency.** No check whether the migration has already been applied. Re-running this script with the same file is potentially destructive (e.g. migration 003 drops tables). The script doesn't track applied migrations.
3. **No transaction wrapper.** The `query` API runs the SQL as a single statement. Without explicit `BEGIN/COMMIT` in the file (003 has it, 001/002/004 don't), a multi-statement file that fails halfway leaves the DB partially mutated.

**Impact**
- A botched migration reports `OK` and the operator sees a success log while the table is half-created.
- Re-running the script unintentionally re-applies destructive migrations.
- Defensive operators feel they have to validate the migration ran by querying Supabase manually after every run — that's the symptom of a tool that doesn't tell you the truth.

This is bounded today because:
- The team manually checks Supabase after every migration.
- Migrations are run rarely (4 total in the project history).

But it's the kind of "silent footgun" that bites the day someone applies a 5-statement migration in a hurry.

**Evidence**
- `scripts/apply-migration.ts:34-52` — full body, no JSON parse, no error-field check.
- `migrations/003-restructure-threads.sql` wraps in `BEGIN; ... COMMIT;`.
- `migrations/001-positive-replies.sql`, `002-classifier-cleaned-reply.sql`, `004-prw-highlights.sql` do NOT wrap in transactions; the script doesn't add one either.
- The script doesn't check `applied_migrations` (or any equivalent) before running.

**Expected behavior**
- Parse the response body as JSON; if it contains an `error` field, exit non-zero with the message.
- Either reject re-runs of the same file, or be explicit that the script is intentionally re-runnable (and document the contract: "the SQL must be idempotent").
- Wrap the file content in `BEGIN; ... COMMIT;` if it isn't already (or reject files that don't include their own transaction blocks).

**Suggested fix**
```ts
const body = await res.text();
if (!res.ok) {
  console.error(`HTTP ${res.status}: ${body}`);
  process.exit(1);
}
let parsed: unknown;
try {
  parsed = JSON.parse(body);
} catch {
  parsed = null;
}
if (parsed && typeof parsed === "object") {
  const obj = parsed as { error?: unknown; message?: unknown };
  if (obj.error || obj.message) {
    console.error(`Migration returned error: ${JSON.stringify(parsed).slice(0, 1000)}`);
    process.exit(1);
  }
}
console.log(`OK (${res.status})`);
console.log(body.slice(0, 500));
```

Also add a one-time check at the top:

```ts
if (!sql.toLowerCase().includes("begin") || !sql.toLowerCase().includes("commit")) {
  console.warn(`WARNING: ${file} does not contain BEGIN/COMMIT — partial failures will leave the DB inconsistent.`);
}
```

Long-term, consider switching to `npx supabase db push` (it's already in `package.json` as `db:migrate`, but the README + scripts mix the two strategies).

**Acceptance criteria**
- [ ] Running `scripts/apply-migration.ts` on a SQL file with a deliberate syntax error exits non-zero.
- [ ] The success log only appears for actual successes.
- [ ] A warning fires when the input file lacks an explicit transaction block.
- [ ] The README clarifies which path (the tsx script vs `db:migrate`) is the canonical migration runner.
