import { withSentryConfig } from "@sentry/nextjs";
import withBundleAnalyzerInit from "@next/bundle-analyzer";
import { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

// Wraps the config when ANALYZE=true is set. No-op otherwise.
// Generates a `.next/analyze/` HTML report after `npm run analyze`.
const withBundleAnalyzer = withBundleAnalyzerInit({
  enabled: process.env.ANALYZE === "true",
  openAnalyzer: false,
});

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
    // Same reason for the Wikibooks theory corpus (1 MB): the loader reads it
    // with fs so webpack leaves it alone, which also means the tracer cannot
    // see the dependency and the file would simply be absent at runtime.
    "/api/opening-theory": ["./src/data/wikibooks-theory.json"],
    // Note: /api/puzzle-feed's CSV now lives at /public/data/ and is
    // served by Vercel's static handler. The loader reads it via fs from
    // public/ when colocated and falls back to HTTPS fetch from the
    // deployment URL otherwise. No tracing include needed.
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

// withBundleAnalyzer wraps a NextConfig — apply it before withSentryConfig
// so the analyzer sees the final (post-Sentry) webpack config.
const wrappedConfig = (phase: string): NextConfig =>
  withBundleAnalyzer(nextConfig(phase));

export default withSentryConfig(wrappedConfig, {
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
