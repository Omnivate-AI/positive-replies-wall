import type { NextConfig } from "next";

/** Baseline CSP for the public wall + admin. Tuned against the actual
 * Next.js 16 build output:
 *
 *   - **`script-src 'self' 'unsafe-inline'`.** Next.js 16 emits ~12 inline
 *     `<script>` tags per server-rendered page for the RSC/Flight
 *     hydration payload (`self.__next_f.push(...)`). A nonce-based CSP
 *     would be stricter, but it requires a `middleware.ts` that
 *     generates a per-request nonce — and per-request nonces don't
 *     work cleanly with ISR'd pages like `/` (the prerendered HTML is
 *     shared across requests, so a nonce can't match). For now,
 *     `'unsafe-inline'` is acceptable: this app renders no
 *     user-controlled HTML (all body content goes through React text
 *     nodes; no `dangerouslySetInnerHTML` anywhere), so the script-side
 *     XSS surface is small. Tracked as a follow-up: tighten to nonces
 *     when the main-app integration introduces auth + middleware.
 *
 *   - **`style-src 'self' https://fonts.googleapis.com`.** Tailwind v4's
 *     CSS is emitted as an external `<link rel="stylesheet">`, not
 *     inline `<style>` tags (verified against `.next/server/app/`
 *     output). `'unsafe-inline'` is therefore unnecessary on the
 *     style-side and has been removed.
 *
 *   - **`img-src` includes `images.unsplash.com`** because the wall hero
 *     and the auth aside fetch from there via `next/image`.
 *
 *   - **`connect-src 'self' https://*.supabase.co`.** OpenRouter is
 *     server-only (Trigger.dev), never browser, so it's intentionally
 *     absent.
 *
 *   - **`frame-ancestors 'none'`** blocks clickjacking everywhere,
 *     including `/admin`.
 */
const CSP = [
  "default-src 'self'",
  "img-src 'self' data: https://images.unsplash.com",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self' https://*.supabase.co",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  { key: "X-Frame-Options", value: "DENY" },
];

const nextConfig: NextConfig = {
  // Strict mode is on by default in app router; keep explicit for clarity.
  reactStrictMode: true,
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
