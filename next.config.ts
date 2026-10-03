import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  cacheOnNavigation: false,
  reloadOnOnline: false,
  // Install only a tiny, public offline shell and app icons. Chunks and large
  // illustrations are cached on demand, never all downloaded during install.
  globPublicPatterns: ["offline.html", "icons/*.png"],
  exclude: [/.*/],

  // Disable service worker generation during local development.
  // It will be enabled during production builds.
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,

  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default withSerwist(nextConfig);
