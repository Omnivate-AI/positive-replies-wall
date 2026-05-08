### [Bug] README and inline docstrings reference removed routes (M7 hub, /coming-soon, /demo, /m7/*, /api/og-reply)

**Severity:** Medium
**Priority:** P2
**Status:** Open
**Area:** `README.md`, `components/email-reply-card.tsx`, `lib/supabase-public.ts`, `app/layout.tsx`

**Problem**
The README and several source-file docstrings describe routes and structure that no longer exist. New contributors reading them will be sent on multiple wild-goose chases.

Documented but absent:

- README §"Repo layout" lines 30-65 lists `app/coming-soon/`, `app/m7/pocs/`, `app/m7/quiz/`, `app/m7/data/`, `app/api/og-reply/`. The actual `app/` tree is just `admin/`, `api/admin/*`, `auth/`, `layout.tsx`, `page.tsx`, `globals.css`, `icon.ico`.
- README §5 (top of intro) links to `/coming-soon`, `/m7/pocs`, `/m7/quiz` as live previews — those URLs 404 in production.
- `components/email-reply-card.tsx:11-14` docstring says "Used by: /m7/pocs Option B (full card with redaction toggle), /api/og-reply (Option C captures this same component to PNG via @vercel/og), /m7/quiz via the exported `<ReplyBody>` sub-component". None of those exist anymore. The component is used by the wall (`components/wall-grid.tsx`) and the admin dashboard (`app/admin/dashboard.tsx`).
- `lib/supabase-public.ts:88-89` docstring says `getWallThreads` is "Used by /demo and (later) by the public wall in M10." The `/demo` route was removed; it's now only the public wall + admin.
- `app/layout.tsx:10` metadata description: `"M7: rendering POC viewer + classifier audit quiz for the positive-replies-wall project."` (See ticket 003 for the SEO-impact angle on this string.)
- `package.json` keeps `@vercel/og` as a runtime dependency, but no code imports it (the OG image route was removed). Cruft.

**Impact**
- **Onboarding cost.** The README is the canonical entry point and almost every section past line 30 is wrong. New engineers waste hours mapping documentation to reality.
- **Live-link rot.** The intro paragraph links visitors to `/coming-soon` and `/m7/pocs`, both of which 404 from prod. Anyone bookmarking those URLs from earlier docs hits a broken link.
- **Bundle waste.** `@vercel/og` ships as a Next.js runtime dependency. Removing the unused dep shrinks installs and removes one CVE-watch surface.
- **Audit signal.** Stale docs are correlated with stale assumptions in code. Reviewing the M10/M11 milestones is harder when the project layout description in README still describes the M7 milestone.

**Evidence**
- README.md:5 — links to `/coming-soon`, `/m7/pocs`, `/m7/quiz`.
- README.md:30-65 — repo layout shows `app/coming-soon/`, `app/m7/`, `app/api/og-reply/`.
- Actual `app/` contents (verified): `admin/`, `api/admin/`, `auth/`, `globals.css`, `icon.ico`, `layout.tsx`, `page.tsx`.
- `components/email-reply-card.tsx:11-14` — docstring `Used by:` block.
- `lib/supabase-public.ts:88-89` — `getWallThreads` docstring.
- `app/layout.tsx:10` — metadata.description.
- `package.json` dependencies include `"@vercel/og": "^0.11.1"`. `grep -r "@vercel/og"` finds zero source-file imports.

**Expected behavior**
README accurately describes the current `app/` layout, dependencies, and live URLs. Docstrings on shared components/libs reference real callers. Unused dependencies are removed.

**Suggested fix**
1. Rewrite README §"Repo layout" against the current tree:
   ```
   ├── app/
   │   ├── page.tsx           Public wall (ISR=60). Reads getPublishedWallThreads.
   │   ├── layout.tsx         Root metadata + Google Sans <link>
   │   ├── globals.css        Tailwind v4 tokens + redaction styles
   │   ├── admin/
   │   │   ├── page.tsx       Server-rendered admin shell
   │   │   └── dashboard.tsx  Client triage UI (filter / preview / mutate)
   │   ├── auth/
   │   │   ├── page.tsx       Sign-in placeholder (visual only — see m10 doc)
   │   │   └── login-form.tsx Client form (no-op submit)
   │   └── api/
   │       └── admin/
   │           ├── publish/route.ts        POST is_published / display_priority
   │           ├── redactions/route.ts     POST + DELETE
   │           ├── highlights/route.ts     POST + DELETE
   │           └── revalidate/route.ts     POST revalidatePath('/')
   ```

2. Drop the `Coming-soon preview`, `POC viewer`, `Audit quiz` links from README:5.

3. Update `components/email-reply-card.tsx:11-14`:
   ```
    * Used by:
    *   - components/wall-grid.tsx — public wall card
    *   - app/admin/dashboard.tsx — admin preview pane
   ```

4. Update `lib/supabase-public.ts:88-89` to "Used by getPublishedWallThreads's pre-M10 callers; retained for ad-hoc scripts. The public wall uses getPublishedWallThreads()."

5. Either restore the OG image route or remove `@vercel/og` from `package.json`. (M11 runbook hints that an OG image was nice-to-have; if it's still on the roadmap, leave the dep with a note in package.json.)

6. Update `app/layout.tsx:10` description to match the public wall (covered separately in ticket 003).

**Acceptance criteria**
- [ ] README §Repo layout matches `find app/ -type f` output.
- [ ] No README link 404s when clicked from the live-deployed README on GitHub.
- [ ] `components/email-reply-card.tsx` docstring lists real call sites.
- [ ] `package.json` either uses `@vercel/og` or doesn't depend on it.
- [ ] `app/layout.tsx` metadata description describes the wall, not M7.
