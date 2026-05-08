### [Risk] No Content-Security-Policy, no rate limiting, no security headers

**Severity:** High
**Priority:** P1
**Status:** Open
**Area:** `next.config.ts`, `app/api/admin/*`, deployment config

**Problem**
The deployed site has none of the standard security hardening:

1. **No Content-Security-Policy header.** Inspecting the live site shows no `Content-Security-Policy`, no `X-Content-Type-Options`, no `Referrer-Policy`, no `Permissions-Policy`. `next.config.ts` does not declare `headers()` and Vercel's defaults provide only a minimal subset.
2. **No rate limiting on the admin API or the public wall.** Anyone can hammer `POST /api/admin/publish` (which writes via service-role) thousands of times per second. Same for `POST /api/admin/revalidate`, which calls Next's `revalidatePath('/')` — an attacker can pin the revalidation worker to its limit and effectively DOS the cache.
3. **No bot/abuse protection on the public wall.**
4. **Inline `<style>` and inline event handlers don't appear today,** but without a CSP they're allowed when introduced — the security posture is "trust whoever writes code." The frontend-engineer SKILL §18 (Security → CSP) requires "Content Security Policy defined; no `unsafe-inline` for scripts."

The combination of (1) no auth on `/api/admin/*` (ticket 001) plus (2) no rate limiting on those endpoints means a single attacker workstation can flip every thread's `is_published` flag in seconds.

**Impact**
- **XSS exposure.** Without a CSP, a stored-content XSS (e.g. via a future bug in how reply bodies are rendered — they currently go through `applyRedactions` which produces React text nodes, but a future change could `dangerouslySetInnerHTML`) becomes browser-executable. With CSP `default-src 'self'`, the same XSS is at least limited.
- **Cache-flood DOS.** `POST /api/admin/revalidate` is open and unauthenticated. A loop of thousands of these can:
  - Force constant ISR cache invalidation on Vercel (cost + cold paths).
  - Saturate the Supabase read budget if revalidation triggers a fresh `getPublishedWallThreads()` (~6 queries each).
- **Admin spray-and-tamper.** Combined with ticket 001, an attacker can scan thread IDs (1..N) and toggle `is_published` on every one of them in a single curl loop.
- **Audit gap.** No request logs identify the spammer because there's no rate-limit middleware between the public internet and the handler.

**Evidence**
- `next.config.ts:1-13` — entire config; no `headers()` function, no `redirects()`, no `rewrites()`. Only `reactStrictMode: true` and `images.formats`.
- `app/api/admin/*/route.ts` (all four files) — no rate-limit code, no token bucket, no Vercel Edge guard.
- The site uses Vercel default platform headers (HSTS, basic) but nothing app-specific.
- Frontend-engineer SKILL §18: "CSP defined; no `unsafe-inline` for scripts."
- The risk is amplified by the ISR `revalidate=60` strategy and the `revalidatePath` hot path on every admin mutation.

**Expected behavior**
At minimum:

1. A baseline CSP header on every response: `default-src 'self'; img-src 'self' data: https://images.unsplash.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self' https://*.supabase.co; frame-ancestors 'none';` plus `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
2. Per-IP rate limiting on `/api/admin/*` (sliding window — 30 req / minute is plenty for an admin and instantly visible to an attacker). Use `@vercel/firewall` rules or Upstash Ratelimit + middleware; either is well-supported on Vercel.
3. A bot/abuse line of defense on `/api/admin/revalidate` — at minimum, accept only POST from authenticated callers (ticket 001 fixes this) and rate-limit to 1/sec.

**Suggested fix**
1. Define a `headers()` function in `next.config.ts`:
   ```ts
   async headers() {
     const csp = [
       "default-src 'self'",
       "img-src 'self' data: https://images.unsplash.com",
       "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
       "font-src 'self' https://fonts.gstatic.com",
       "script-src 'self'",
       "connect-src 'self' https://*.supabase.co https://openrouter.ai",
       "frame-ancestors 'none'",
       "base-uri 'self'",
       "form-action 'self'",
     ].join("; ");
     return [{
       source: "/(.*)",
       headers: [
         { key: "Content-Security-Policy", value: csp },
         { key: "X-Content-Type-Options", value: "nosniff" },
         { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
         { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
         { key: "X-Frame-Options", value: "DENY" },
       ],
     }];
   }
   ```
   Tune the `style-src` and `img-src` once Tailwind v4 inline-style use is verified — the current setup may need `'unsafe-inline'` for CSS-in-JS / Tailwind arbitrary values.

2. Add a lightweight rate limiter via Vercel KV / Upstash on `/api/admin/*`:
   ```ts
   // lib/rate-limit.ts (sketch)
   import { Ratelimit } from "@upstash/ratelimit";
   import { Redis } from "@upstash/redis";
   export const adminLimiter = new Ratelimit({
     redis: Redis.fromEnv(),
     limiter: Ratelimit.slidingWindow(30, "1 m"),
   });
   ```
   Apply at the top of each admin handler with `request.headers.get("x-forwarded-for")` as the key.

3. As an alternative if Upstash isn't already in the stack, use the simpler `@vercel/firewall` IP-rule UI to set `/api/admin/*` to 30 req/min from the dashboard — zero code change.

4. Verify with `curl -I https://positive-repies-wall.vercel.app/` that the new headers ship.

**Acceptance criteria**
- [ ] Response headers on `/` include `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options: DENY`.
- [ ] CSP is reportable (use `report-uri` or `report-to`) for at least the first week so violations surface before they break things.
- [ ] `POST /api/admin/publish` from a single IP, 100 times in a minute, returns 429 on the 31st request.
- [ ] `POST /api/admin/revalidate` is rate-limited and authenticated.
- [ ] Existing tests + the public wall continue to load with no CSP violations in the browser console.
