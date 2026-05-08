import type { NextConfig } from "next";

/** Dev mode needs two extra allowances vs production:
 *
 *   - **`script-src 'unsafe-eval'`.** React's development build uses
 *     `eval()` for callstack reconstruction in the error overlay and a
 *     few other debug features. Production never uses eval — see
 *     https://react.dev for the dev-only contract.
 *   - **`style-src 'unsafe-inline'`.** Next.js's dev overlay (the floating
 *     button with the runtime-error count, the issue panel, the build
 *     activity indicator) injects inline `<style>` tags. Without
 *     `'unsafe-inline'` those are blocked and the overlay renders as
 *     unstyled text fragments ("0", "1", "issue") instead of the floating
 *     UI. Production ships zero inline styles (Tailwind v4 emits an
 *     external stylesheet — verified against `.next/server/app/`).
 *
 * Production CSP is unchanged from Batch 9 + the verification fix:
 * `script-src 'self' 'unsafe-inline'` (needed for Next.js's RSC/Flight
 * hydration scripts; nonce-based CSP doesn't compose cleanly with ISR's
 * shared prerendered HTML — tracked for the auth-integration milestone),
 * `style-src 'self' https://fonts.googleapis.com` (no inline allowance —
 * verified unnecessary).
 */
const isDev = process.env.NODE_ENV === "development";

const CSP = [
  "default-src 'self'",
  "img-src 'self' data: https://images.unsplash.com",
  isDev
    ? "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com"
    : "style-src 'self' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'",
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
