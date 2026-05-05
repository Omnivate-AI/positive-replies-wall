import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Strict mode is on by default in app router; keep explicit for clarity.
  reactStrictMode: true,
  // Allow loading images from any path under /public/m7/* (the M4 exemplar
  // screenshots used by the POC viewer).
  images: {
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
