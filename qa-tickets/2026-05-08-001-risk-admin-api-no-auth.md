### [Risk] Admin API routes are publicly writable in production

**Severity:** Critical
**Priority:** P0
**Status:** Open
**Area:** `app/api/admin/*`, `app/admin/*`, `lib/supabase-admin.ts`

**Problem**
The four `/api/admin/*` route handlers (`publish`, `redactions`, `highlights`, `revalidate`) and the `/admin` page perform service-role Supabase writes with **no authentication or authorization check at all**. Any unauthenticated visitor who knows the URL — or who reads the live HTML, where `<Link href="/admin">` exposes it on every page load — can:

1. Toggle `is_published` on any thread (publish or hide any reply on the public wall).
2. Set arbitrary `display_priority` to pin or de-pin threads.
3. Insert arbitrary text strings as redactions or highlights tied to any thread id.
4. **Delete any redaction or highlight by primary key**, including `auto_lead` rows that carry the lead's first name / last name / company / email PII (see ticket 003).
5. Force ISR revalidation in a loop.

Each mutation runs through `supabaseAdmin()` which uses `SUPABASE_SERVICE_ROLE_KEY` — the keys that bypass Postgres RLS entirely. The blast radius is the entire `prw_*` schema.

The route docstrings still claim "Auth-gated; caller must have a valid Supabase session AND be on the ADMIN_EMAILS allowlist" (`app/api/admin/publish/route.ts:5`), but the implementation has no auth code. The `app/admin/page.tsx` docstring (lines 4-7) acknowledges auth was removed 2026-05-07 and `docs/m10-admin-and-public-wall.md` lines 103-111 frame it as a deliberate, documented tradeoff during the build-out phase.

**Impact**
- **Defacement risk.** A drive-by attacker can publish a fake reply (insert a `prw_redactions` or `prw_highlights` row pointing at a thread, then flip `is_published`), or unpublish every legitimate reply on the wall. The site is the team's public-facing social-proof asset linked from omnivate.ai marketing — defacement directly hurts conversion.
- **Data tampering.** Inserting redaction strings like `Omnivate` or `cold email` blacks out arbitrary text on every reply. Inserting highlight phrases puts the attacker's chosen text in the purple wash.
- **PII regression vector.** Deleting a thread's `auto_lead` redaction rows un-redacts the lead's first/last/company/email on the public wall. Auto rows do not regenerate on a re-classify; only a re-ingest of the underlying Smartlead campaign rebuilds them. See ticket 003.
- **Reputation.** The wall is positioned as proof; visitors discovering it can be tampered with destroys that proof.
- **Documented vs actual gap.** The m10 doc and the route docstrings disagree with the code, which is itself a maintainability + audit risk.

**Evidence**
- `app/api/admin/publish/route.ts:24-60` — `POST` handler validates body shape with Zod then writes via `supabaseAdmin()`. No auth check, no rate limit, no shared secret.
- `app/api/admin/redactions/route.ts:26-79` — POST and DELETE both jump straight to `supabaseAdmin()`.
- `app/api/admin/highlights/route.ts:26-78` — same pattern.
- `app/api/admin/revalidate/route.ts:11-14` — unauthenticated `revalidatePath('/')` with no guard.
- `app/admin/page.tsx:21` — `<AdminDashboard … adminEmail="open-access" />` literal hardcoded.
- `app/api/admin/publish/route.ts:40` — write payload sets `edited_by: "open-access"` literally.
- Public discoverability: `app/page.tsx:64-70` renders the Admin link unconditionally on every visit.
- `docs/m10-admin-and-public-wall.md:103-111` — risk acknowledged, with the proposed fix already scoped: "the simplest path is hard-coding a session cookie issued by a server route that checks against an env-var allowlist. No Supabase Auth dependency, no SMTP, no redirect URLs. ~30 lines of code."

**Expected behavior**
Every state-changing admin route requires authentication. The minimum acceptable bar for a publicly-deployed site:
1. A shared secret check on every `/api/admin/*` route (env var like `ADMIN_API_TOKEN`, sent as a header from the dashboard, rejected with 401 otherwise), OR
2. The session-cookie-allowlist sketch from m10 docs lines 109-111 (~30 LOC).

Either approach also re-introduces a real `getAdminSession()` returning the actual admin email so `edited_by`, `created_by` audit columns stop being literal strings.

**Suggested fix**
Two-step, both small:

1. Add `lib/admin-auth.ts` — a `requireAdmin(request: NextRequest): Promise<{ email: string }>` helper that either:
   - Reads an HTTP-only `prw_admin_session` cookie, verifies its value against `process.env.ADMIN_SESSION_SECRET` via HMAC, and returns the embedded email; OR
   - For the simplest cut, checks an `Authorization: Bearer <ADMIN_API_TOKEN>` header against an env var.

2. Wrap every existing `/api/admin/*` handler with `requireAdmin(request)` at the top, returning `401` on miss. Replace the literal `"open-access"` strings in `edited_by` / `created_by` with the resolved email.

3. Restore the `/auth` page to a real flow (the simplest cut: a server action that compares an entered token against `ADMIN_SESSION_TOKEN` and sets the cookie).

4. Update `app/admin/page.tsx` to redirect to `/auth?redirect=/admin` if the cookie is missing or invalid, and remove the `adminEmail="open-access"` literal.

5. Move the `/admin` link in `app/page.tsx:64-70` behind a session check, OR keep it visible (acceptable — knowing the URL is not the security boundary anymore) but rename it to "Admin" (it already is). Either way, the route itself stops being writable to the public.

6. Update the route docstrings, `app/admin/page.tsx`, and `docs/m10-admin-and-public-wall.md` to reflect what the code does after the fix.

**Acceptance criteria**
- [ ] An unauthenticated `curl -X POST /api/admin/publish -d '{"thread_id":1,"is_published":true}'` returns 401, not 200.
- [ ] Same for POST/DELETE on `/api/admin/redactions` and `/api/admin/highlights`, and POST `/api/admin/revalidate`.
- [ ] `/admin` redirects unauthenticated visitors to `/auth` with a useful redirect target.
- [ ] `prw_publish_state.edited_by` and `prw_redactions.created_by` / `prw_highlights.created_by` written by admin actions contain the actual admin email, not `"open-access"`.
- [ ] All four route docstrings match the code.
- [ ] `docs/m10-admin-and-public-wall.md` § "Auth, removed mid-milestone" is updated to reflect the restored auth.
- [ ] An integration test under `tests/integration/` exercises the 401 path on each admin route.
