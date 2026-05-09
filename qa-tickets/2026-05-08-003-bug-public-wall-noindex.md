### [Bug] Root layout sets `robots: { index: false, follow: false }` on the public production wall

**Severity:** High
**Priority:** P1
**Status:** Closed
**Area:** `app/layout.tsx`

**Resolution:** Root layout metadata rewritten — site-wide `robots: noindex, nofollow` removed. Title now uses the App Router template form (`default` + `template`). Description rewritten to describe the live wall, not the M7 POC viewer. Added `metadataBase`, OpenGraph (title, description, type, url), and Twitter card so the wall unfurls cleanly when shared. The two surfaces that *should* stay noindexed — `/admin` and `/auth` — got their own page-level `metadata` exports declaring `robots: { index: false, follow: false }`. OpenGraph image generation deferred (not in scope for this batch).

**Problem**
`app/layout.tsx:11` sets:

```ts
export const metadata: Metadata = {
  title: "Positive Replies Wall — Omnivate",
  description: "M7: rendering POC viewer + classifier audit quiz for the positive-replies-wall project.",
  robots: { index: false, follow: false },
};
```

The `robots: { index: false, follow: false }` block emits `<meta name="robots" content="noindex, nofollow">` site-wide. Because root-layout metadata is inherited by every route that doesn't override it, the public landing wall at `/` — the entire point of this project, per `brief.md` and the README header ("public landing page that displays Omnivate's best positive cold-outbound replies") — is currently telling Google, Bing, and every other crawler not to index or follow it.

The description string is also stale, predating M7 ("rendering POC viewer + classifier audit quiz") rather than describing the live wall.

**Impact**
- **The wall cannot rank or appear in search.** Anyone searching for "Omnivate cold email reply" or following a backlink referenced from omnivate.ai marketing won't find this page in organic results.
- **Wasted social proof.** The whole purpose of the wall (per brief.md §0 — "social proof for prospective clients and our sales team") presumes it can be linked, shared, indexed, and discovered. `noindex, nofollow` defeats every one of those.
- **Stale description leaks internal jargon.** The `<meta name="description">` rendered into every page reads "M7: rendering POC viewer + classifier audit quiz" — visible in any search-result preview (when a crawler indexes anyway despite the noindex hint, e.g. social-card unfurls), in browser bookmarks, and in social-share previews.

This is almost certainly a holdover from M7-M8 when the wall was a private POC — the comment context in `app/page.tsx:1-13` confirms the page graduated to a real public landing surface in M10 (revamped 2026-05-07). The metadata in `app/layout.tsx` was not updated to match.

**Evidence**
- `app/layout.tsx:7-12` — current metadata block.
- `README.md:1-12` — "A public landing page" + live URL `https://positive-replies-wall.vercel.app/`.
- `brief.md` (project goal) — landing page meant for prospect-facing social proof.
- `docs/m10-admin-and-public-wall.md:1-30` — the wall is the production surface; explicitly NOT a POC.
- The /admin route, on the other hand, IS something we'd want noindexed — but root-layout metadata is the wrong granularity.

**Expected behavior**
- The public surfaces (`/`) are indexable, with title and description that read well in a Google snippet and a Twitter/LinkedIn unfurl.
- The admin surfaces (`/admin`, `/auth`) are explicitly `noindex, nofollow`.
- Consider also adding OpenGraph and Twitter card metadata for sharing.

**Suggested fix**
1. In `app/layout.tsx`, drop the global `robots` block. Update the description:

   ```ts
   export const metadata: Metadata = {
     title: {
       default: "Positive Replies — Omnivate",
       template: "%s — Omnivate",
     },
     description: "Verbatim positive replies to Omnivate's cold outbound, pulled live from our SDR inboxes. Names redacted, praise unedited.",
     metadataBase: new URL("https://positive-replies-wall.vercel.app"),
     openGraph: {
       title: "Positive Replies — Omnivate",
       description: "What real B2B prospects said when we cold-emailed them.",
       type: "website",
       url: "/",
     },
     twitter: { card: "summary_large_image" },
   };
   ```

2. Add a separate `metadata` export to `app/admin/page.tsx` and `app/auth/page.tsx`:

   ```ts
   export const metadata: Metadata = {
     robots: { index: false, follow: false },
     title: "Admin",
   };
   ```

3. (Optional, follow-up.) Add an `app/opengraph-image.tsx` so social shares of `/` generate a proper card.

**Acceptance criteria**
- [ ] `curl https://positive-replies-wall.vercel.app/` returns HTML whose `<head>` has no `<meta name="robots" content="noindex…">`.
- [ ] The `<head>` for `/admin` and `/auth` still includes `<meta name="robots" content="noindex, nofollow">`.
- [ ] The public-page description references the wall, not the M7 POC viewer.
- [ ] OpenGraph tags are present so the wall unfurls cleanly when linked from Slack / Twitter / LinkedIn.
