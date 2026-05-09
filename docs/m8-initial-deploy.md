# M8 — Initial landing page deploy

A first public page on Vercel that reads live counts from Supabase and ticks them up on every refresh. Per the brief, this is the demoable proof that the pipeline is doing real work end-to-end before the M9 wall ships.

## TL;DR

- Live: https://positive-replies-wall.vercel.app/coming-soon
- Server-rendered counts (no client-side caching). Classify a reply in Supabase, refresh the page, the number ticks up.
- Vercel ↔ GitHub auto-deploy wired: every push to `Omnivate-AI/positive-replies-wall` `main` triggers a production build.
- Repo flipped to public (Vercel Hobby plan can't link an org-owned private repo without Pro).
- Homepage is now a 3-card hub: **Compare renderings** (M7) · **Take the quiz** (M6 #4 / M7) · **Preview the wall** (M8 — `/coming-soon`).

## What's on /coming-soon

A premium hero, single-screen, light-mode only:

- "Coming soon" pill with a live ping dot
- Big headline: *"Positive Replies, coming soon"*
- One-paragraph description of what the wall is
- Two stat cards, animated count-up on hydration:
  - **Publish-worthy replies** — `COUNT(prw_classifications) WHERE is_high_quality AND prompt_version = '<latest>'`
  - **Total replies ingested** — `COUNT(prw_replies)`
- Footer link to the audit quiz at `/m7/quiz`
- Subtle radial-gradient accent in the background, no images

The page is a Server Component with `export const dynamic = "force-dynamic"`, so Next.js opts out of every request cache and runs the Supabase query on every page load. The counts the visitor sees are the counts in the DB at request time — there's no ISR / SWR layer.

## Data path

```
Browser
  └─> /coming-soon (Server Component, force-dynamic)
        └─> getReplyStats() in lib/supabase-public.ts
              ├─> COUNT(*) FROM prw_replies                  → totalReplies
              ├─> SELECT prompt_version FROM prw_classifications
              │   ORDER BY prompt_version DESC LIMIT 1       → promptVersion (auto-detect latest)
              └─> COUNT(*) FROM prw_classifications
                  WHERE is_high_quality AND prompt_version = ? → highQualityCount
```

The "auto-detect latest prompt_version" matters: when M9 promotes to v1.3, the wall and this preview both show the v1.3 numbers without a code change. v1.0 / v1.1 / v1.2 stay queryable for diff analysis (UNIQUE constraint on `(reply_id, prompt_version)`), but they're not what gets counted.

## Files added in M8

| Path | Role |
|---|---|
| `app/coming-soon/page.tsx` | Server Component, `dynamic = "force-dynamic"`. Renders the hero shell + stat cards. Imports `getReplyStats()` server-side, hands the values to `<CountReveal>` as props |
| `app/coming-soon/count-reveal.tsx` | Client Component — animates the two stat cards in (framer-motion fade/slide) and counts the numbers up with an ease-out cubic via `requestAnimationFrame` |
| `lib/supabase-public.ts` | Server-side Supabase client using the **anon (publishable) key**. Read-only by convention. `getReplyStats()` is the only export. Lives at `lib/` (not `trigger/lib/`) so Next.js Server Components don't pull in the `ws` polyfill / service-role concerns from the Trigger.dev path |
| `app/page.tsx` | Updated — homepage is now a 3-column responsive grid. Added a third card **"Preview the wall"** with a live-ping pill linking to `/coming-soon` |
| `tsconfig.json` | Added `lib/**/*.ts(x)` to `include` so the new `lib/` directory gets type-checked |
| `README.md` | First repo-level README. Stack, repo layout, local dev, deploy, milestone status table, conventions |

## Why a separate `lib/supabase-public.ts`

We already had `trigger/lib/supabase.ts` for the Trigger.dev tasks — that one uses the **service-role** key and includes a `ws` polyfill so Trigger.dev's serverless runtime can talk to Supabase. Reusing it from Next.js would be wrong on two axes:

1. **Wrong key surface.** Next.js Server Components run inside a Vercel runtime that's reachable from the public internet. Putting a service-role key in there is a one-line config mistake away from leaking it to the browser. The anon key is RLS-gated and explicitly safe to expose.
2. **Wrong runtime assumptions.** The `ws` polyfill is harmless but unnecessary in Next.js — and the Trigger.dev path imports things like the secret-key context that don't exist on Vercel.

So: **`trigger/lib/supabase.ts` writes (service-role)** · **`lib/supabase-public.ts` reads (anon)**. Two clients, two keys, two purposes.

## Vercel setup

Two pieces had to be configured on Vercel:

### 1. Production env vars

```
SUPABASE_URL=https://uivgowblojtyiobhgjlv.supabase.co
SUPABASE_ANON_KEY=eyJ...
```

Set via `vercel env add ... production --scope emmanuel-2239s-projects`. Production-only for now (no preview branches yet — the preview env scope can be added later when M9/M10 introduces feature branches that need their own data).

### 2. GitHub auto-deploy

Vercel project is now connected to `Omnivate-AI/positive-replies-wall` via `vercel git connect`. Every push to `main` triggers a production deploy.

**Hobby-plan caveat.** Vercel's Hobby tier doesn't support linking a private repo owned by a GitHub *organization* — only personal-account private repos and public repos. We made `Omnivate-AI/positive-replies-wall` public for this milestone. The repo doesn't contain secrets (`.env` is gitignored, all keys live in Vercel env / `.env`), so this is a safe trade. If we later want it private without paying for Vercel Pro, the options are:
- Move the repo to Emmanuel's personal GitHub account
- Or wire a manual "deploy on push" via GitHub Actions + a Vercel deploy hook URL (no Vercel-side Git connection, no inline preview comments, but it works on Hobby)

For M8 the public-repo path is fine — there's nothing in the code that we wouldn't put in a public sample.

## Acceptance against the brief

The M8 brief asked for two things — both satisfied:

| Brief acceptance | Status | Where |
|---|---|---|
| 1. A coming-soon page on Vercel with a live count from Supabase | ✅ | https://positive-replies-wall.vercel.app/coming-soon |
| 2. Vercel deploy hooked up to a GitHub branch so pushes redeploy automatically | ✅ | `vercel git connect` to `Omnivate-AI/positive-replies-wall` |

The "subroute on omnivate.ai" pointer the brief mentions is a DNS / domain pass that Omar will do separately when he wants to share the URL externally. The Vercel-side custom-domain config takes a CNAME record and a re-deploy; nothing about the M8 build needs to change for it.

## Demo path (for the Loom)

1. Open https://positive-replies-wall.vercel.app — three cards. Click "Preview the wall."
2. The /coming-soon page loads. Numbers tick up: `<HQ count> / <total ingested>`.
3. In Supabase studio (or `npm run classify:local`), classify another reply at `prompt_version='v1.2'` with `is_high_quality=true`.
4. Refresh /coming-soon. The HQ count is +1.
5. Show the homepage's third card again — that's the entry point Omar will share.
6. End on the milestone table in the README — M8 is the last green box; M9 ("Email rendering component") is what the wall is built around next, and the `EmailReplyCard` from M7 is already production-ready for it.

## What's next (M9)

M9 is the email-rendering component for the wall itself. Most of it is already done by M7's `components/email-reply-card.tsx`:

- Card layout, redaction, timestamp formatting, From/to inline labels — all in M7
- The wall reads `prw_classifications.cleaned_reply_text` (set in M5/M6) — no extra extraction work
- Default redaction set (prospect first/last/email/company) is the M4 / M7 policy
- Sort by `reply_received_at_iso DESC`, no truncation

What M9 adds on top:

- Wall-shape layout (mosaic grid, masonry-ish, vs. M7's stacked POCs)
- Pagination or infinite scroll (TBD — depends on count growth past 100)
- Optional pinning via the M10 admin tool (display priority override)
- The page-level data fetch: `SELECT prw_replies JOIN prw_classifications ON reply_id WHERE is_high_quality AND prompt_version = '<latest>' ORDER BY reply_received_at_iso DESC`

M8 is the rehearsal. M9 is the show.
