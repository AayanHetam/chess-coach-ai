import { withSentryConfig } from "@sentry/nextjs";
import { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Removed static export to enable API routes on Vercel
  // output: "export" prevents API routes from working
  trailingSlash: false,
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  // CI (.github/workflows/ci.yml) runs `tsc --noEmit` + ESLint as
  // required checks before merge. Repeating them inside `next build`
  // doubled the Vercel runtime (hung at "Linting and checking validity
  // of types" past 20 min on PR #53). Build-only flags — the quality
  // gate still fires on every PR.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  // Default 60s per page during "Collecting page data" is too tight for
  // analysis.tsx on Vercel's 2-core runner. Local takes 1.5s; Vercel
  // appears to spin longer. Bump to 6 min so we get a real failure
  // signal instead of a 45-min total-build timeout that masks the cause.
  staticPageGenerationTimeout: 360,
  headers: async () => [
    {
      source:
        "/((?!_next/static|_next/image|favicon.*|apple-touch-icon.*|android-chrome.*).*)",
      headers: [
        { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
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
        { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        {
          key: "Cross-Origin-Opener-Policy",
          value: "same-origin-allow-popups",
        },
        {
          key: "Cache-Control",
          value: "public, max-age=31536000, immutable",
        },
        { key: "Age", value: "181921" },
      ],
    },
    {
      source: "/play",
      headers: [
        { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        {
          key: "Cross-Origin-Opener-Policy",
          value: "same-origin-allow-popups",
        },
      ],
    },
    {
      source: "/database",
      headers: [
        { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        {
          key: "Cross-Origin-Opener-Policy",
          value: "same-origin-allow-popups",
        },
      ],
    },
  ],
};

// Sentry's withSentryConfig wrapper has been the prime suspect in every
// 45-min Vercel hang during the cutover PR (#53). Bypass it for this
// branch as a definitive test — if the build now finishes, we know the
// instrumentation is the culprit and can re-introduce it in a follow-up
// with a narrower scope (or after analysis.tsx is split). Source-map
// upload is what gets sacrificed; runtime Sentry error capture is wired
// separately via the Sentry SDK in `src/lib/sentry.ts` and keeps working.
// withSentryConfig args kept commented so the re-enable is trivial:
//   org: process.env.SENTRY_ORG,
//   project: "javascript-nextjs",
//   widenClientFileUpload: false,
//   reactComponentAnnotation: { enabled: false },
//   hideSourceMaps: true,
//   disableLogger: true,
export default nextConfig;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _withSentryConfig = withSentryConfig;

