### [Bug] Site-wide use of raw `<img>` instead of `next/image` (perf + CWV regression)

**Severity:** High
**Priority:** P1
**Status:** Open
**Area:** `app/page.tsx`, `app/admin/dashboard.tsx`, `app/auth/page.tsx`, `app/layout.tsx`

**Problem**
Every image on every public surface is rendered as a raw `<img>` with `eslint-disable-next-line @next/next/no-img-element` to suppress the lint warning. There are eight occurrences across four files. The hero on the public wall is the worst offender: a 2000-pixel-wide remote Unsplash JPEG loaded as `<img src=… opacity-20 absolute inset-0 h-full w-full object-cover>` with no `width`/`height`/`sizes`/`priority` and no AVIF/WebP negotiation.

The font-loading strategy similarly bypasses `next/font`: Google Sans is pulled from `fonts.googleapis.com/css?family=Google+Sans:…` via `<link rel="stylesheet">` in the root layout. This blocks render until the stylesheet downloads and produces a CSS request, a font request, and an opportunity for FOIT/FOUT, none of which `next/font` would create.

**Impact**
- **LCP regression on the public wall.** The hero Unsplash image at `app/page.tsx:26-27` is the LCP candidate (large above-the-fold element, sized to viewport). Loaded as `<img>` it gets:
  - No `priority` preload (next/image's "first paint" hint).
  - No browser-side AVIF/WebP negotiation despite `next.config.ts:9` setting `formats: ["image/avif", "image/webp"]` (that config applies to next/image only).
  - No responsive `srcset`/`sizes`, so a phone gets the full 2000px JPEG at ~400KB instead of a 800px ~120KB variant.
  - Blocks LCP timing because the browser doesn't know the dimensions; layout shifts when it loads (CLS hit).
  Frontend-engineer SKILL §7 (Images & media) and §11 (Core Web Vitals) directly target this: LCP < 2.5s, CLS < 0.1. With the raw-image hero it's almost certainly missing both on a cold mobile load.
- **Avoidable bandwidth.** The wall rerenders this image on every visit. At ~400KB × the visitor count, this is the single biggest payload on the page.
- **Font CLS.** `<link>` to Google Fonts in `<head>` doesn't reserve metric overrides like `next/font` does. A short FOUT is acceptable, but combined with the hero image, both CWV signals compound.
- **Lint signal silenced.** Eight `eslint-disable-next-line` comments mean the lint signal that would normally catch this on every PR is muted. New code can keep adding `<img>` tags without anyone noticing.

**Evidence**
- `app/page.tsx:43-50` — logo `<img>` in topbar (eslint-disable).
- `app/page.tsx:82-88` — hero Unsplash backdrop `<img>` (eslint-disable). This is the LCP element.
- `app/page.tsx:176-183` — footer logo `<img>`.
- `app/admin/dashboard.tsx:392-399` — admin sidebar logo `<img>`.
- `app/auth/page.tsx:35-42` — auth header logo `<img>`.
- `app/auth/page.tsx:103-108` — auth full-bleed Unsplash backdrop.
- `app/layout.tsx:14-36` — Google Sans + Google Sans Mono loaded via `<link>`. Comment at line 17-23 acknowledges this and disables the lint warning by hand.
- `next.config.ts:8-10` — `images: { formats: ["image/avif", "image/webp"] }` is configured but unused by raw `<img>`.
- `frontend-engineer/SKILL.md` §7 (lines 109-115): "`next/image` with explicit `width` and `height`. Never `<img>` for app images. AVIF/WebP. JPEG only as fallback. `priority` only on the LCP image."

**Expected behavior**
- The hero image uses `next/image` with `priority`, `fill`, `sizes`, and a `quality` setting. Consider downloading the chosen Unsplash photo into `public/` to remove a third-party request entirely (Unsplash domains also need `images.remotePatterns` to be added explicitly; right now they aren't, so any fix that keeps remote loads must also wire that).
- All logo `<img>` tags become `<Image>` with explicit dimensions matching their CSS box.
- Google Sans loads via a self-hosted variable font + `next/font` if a Google Sans license file is available, OR via `<link>` with `display=swap` and a strict `font-display` strategy so it remains non-blocking. The current setup is the latter, but the comment on `app/layout.tsx:17-23` should be updated to reflect what was actually decided.
- The `eslint-disable-next-line @next/next/no-img-element` comments are removed once images are migrated.

**Suggested fix**
1. Decide between self-hosting the Unsplash hero (cheaper + reliable) or keeping remote (then add `next.config.ts` `images.remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }]`).

2. Replace `app/page.tsx` hero (lines 82-88) with:
   ```tsx
   import Image from "next/image";
   …
   <Image
     src={HERO_IMAGE}
     alt=""
     fill
     priority
     sizes="100vw"
     quality={75}
     className="object-cover opacity-20"
   />
   ```

3. Replace each logo `<img>` (page.tsx topbar/footer, admin dashboard, auth header) with `<Image src="/logo.png" width={32} height={32} alt="…" />`. The logo is at `public/logo.png` (verified) so no remotePatterns work needed.

4. Replace the auth full-bleed Unsplash backdrop similarly to the wall hero.

5. Once migrated, drop the `eslint-disable-next-line @next/next/no-img-element` comments. Re-run `npm run lint` to confirm clean.

6. (Optional, but recommended for the LCP hero.) Provide an explicit `width` and `height` matching the photo's intrinsic aspect ratio so the next/image runtime can compute layout without the `fill` strategy, OR keep `fill` but make sure the parent reserves space (the `<section>` wrapping it should — currently it does via padding, but verify there's no CLS post-fix).

**Acceptance criteria**
- [ ] Lighthouse on `/` mobile shows Performance ≥ 90, LCP < 2.5s, CLS < 0.1.
- [ ] All logo and hero images go through `next/image`.
- [ ] No `eslint-disable @next/next/no-img-element` comments remain in `app/`.
- [ ] The hero image is served as AVIF or WebP to a modern browser (verify in DevTools Network tab — Content-Type should be `image/avif` or `image/webp`).
- [ ] `next.config.ts` either has `remotePatterns` for `images.unsplash.com` or the photo is self-hosted under `/public`.
