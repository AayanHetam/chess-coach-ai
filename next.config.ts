import { withSentryConfig } from "@sentry/nextjs";
import { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

const nextConfig = (phase: string): NextConfig => ({
  // Removed static export to enable API routes on Vercel
  // output: "export" prevents API routes from working
  trailingSlash: false,
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  // master-tree.json (17.6 MB) is loaded via fs.readFileSync in
  // src/data/master-openings.ts to keep webpack from bundling it into
  // every server output (the static import was hanging Vercel builds
  // indefinitely). This config tells Next.js's file tracer to still
  // ship the JSON alongside the routes that need it at runtime.
  outputFileTracingIncludes: {
    "/api/opening-explorer": ["./src/data/master-tree.json"],
  },
  headers: async () => [
          {
            source: "/((?!_next/static|_next/image|favicon.*|apple-touch-icon.*|android-chrome.*).*)",
            headers: [
              {
                key: "Cross-Origin-Embedder-Policy",
                value: "require-corp",
              },
              {
                key: "Cross-Origin-Opener-Policy",
                value: "same-origin-allow-popups",
              },
            ],
          },
          {
            source: "/apple-touch-icon.png",
            headers: [
              {
                key: "Cache-Control",
                value: "public, max-age=31536000, immutable",
              },
            ],
          },
          {
            source: "/favicon.ico",
            headers: [
              {
                key: "Cache-Control",
                value: "public, max-age=31536000, immutable",
              },
            ],
          },
          {
            source: "/(favicon-.*\\.png|android-chrome-.*\\.png)",
            headers: [
              {
                key: "Cache-Control",
                value: "public, max-age=31536000, immutable",
              },
            ],
          },
          {
            source: "/engines/:blob*",
            headers: [
              {
                key: "Cross-Origin-Embedder-Policy",
                value: "require-corp",
              },
              {
                key: "Cross-Origin-Opener-Policy",
                value: "same-origin-allow-popups",
              },
              {
                key: "Cache-Control",
                value: "public, max-age=31536000, immutable",
              },
              {
                key: "Age",
                value: "181921",
              },
            ],
          },
          {
            source: "/play",
            headers: [
              {
                key: "Cross-Origin-Embedder-Policy",
                value: "require-corp",
              },
              {
                key: "Cross-Origin-Opener-Policy",
                value: "same-origin-allow-popups",
              },
            ],
          },
          {
            source: "/database",
            headers: [
              {
                key: "Cross-Origin-Embedder-Policy",
                value: "require-corp",
              },
              {
                key: "Cross-Origin-Opener-Policy",
                value: "same-origin-allow-popups",
              },
            ],
          },
        ],
});

export default withSentryConfig(nextConfig, {
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/
  org: process.env.SENTRY_ORG,
  project: "javascript-nextjs",
  widenClientFileUpload: true,
  reactComponentAnnotation: {
    enabled: true,
  },
  hideSourceMaps: true,
  disableLogger: true,
});
