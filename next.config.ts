import type { NextConfig } from "next";

/** Baseline CSP for the public wall + admin. Tuned for the actual surface:
 *   - Tailwind v4 emits inline <style> tags during hydration, so style-src
 *     needs 'unsafe-inline'. Script-side has no inline counterpart.
 *   - next/image fetches from Unsplash via the configured remotePatterns.
 *   - Supabase fetch happens at request time from server components; the
 *     anon endpoint is on *.supabase.co.
 *   - OpenRouter is server-only (Trigger.dev tasks); no browser connect
 *     needed, so it's intentionally absent from connect-src.
 *   - frame-ancestors blocks clickjacking on /admin (and everywhere else).
 */
const CSP = [
  "default-src 'self'",
  "img-src 'self' data: https://images.unsplash.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "script-src 'self'",
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
