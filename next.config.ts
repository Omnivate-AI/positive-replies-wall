import type { NextConfig } from "next";

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
};

export default nextConfig;
