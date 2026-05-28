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

export default withSentryConfig(nextConfig, {
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/
  org: process.env.SENTRY_ORG,
  project: "javascript-nextjs",
  widenClientFileUpload: true,
  // reactComponentAnnotation chokes on the (now ~5k-line) preview
  // analysis page and hangs Vercel builds indefinitely. Disabling for
  // the cutover; can revisit once analysis.tsx is split into smaller
  // pieces in a follow-up PR.
  reactComponentAnnotation: {
    enabled: false,
  },
  hideSourceMaps: true,
  disableLogger: true,
});

