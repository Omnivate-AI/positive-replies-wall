import type { Metadata } from "next";
import "./globals.css";

// Google Sans isn't in the next/font/google catalog (it's a Google brand font);
// loaded via @import in globals.css instead.

export const metadata: Metadata = {
  title: {
    default: "Positive Replies — Omnivate",
    template: "%s — Omnivate",
  },
  description:
    "Verbatim positive replies to Omnivate's cold outbound, pulled live from our SDR inboxes. Names redacted, praise unedited.",
  metadataBase: new URL("https://positive-replies-wall.vercel.app"),
  openGraph: {
    title: "Positive Replies — Omnivate",
    description: "What real B2B prospects said when we cold-emailed them.",
    type: "website",
    url: "/",
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Google Sans — Google's brand font, loaded directly from the
            stylesheet endpoint (it isn't in the next/font/google catalog).
            ESLint's @next/next/no-page-custom-font rule flags <link> fonts
            outside pages/_document.js — that's a Pages-Router rule and is a
            false positive in the App Router, where adding to the root layout's
            <head> is the correct pattern. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css?family=Google+Sans:400,500,600,700&display=swap"
          rel="stylesheet"
        />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Google+Sans+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-bg text-fg antialiased">
        {children}
      </body>
    </html>
  );
}
