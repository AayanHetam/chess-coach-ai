import { init } from "@sentry/nextjs";

/**
 * Server-side Sentry init, in its own module ON PURPOSE.
 *
 * When this lived inline in `instrumentation.ts` behind an early
 * `if (NEXT_RUNTIME !== "nodejs") return`, the bundler still pulled
 * @sentry/nextjs into the EDGE instrumentation bundle — 912 KB of it — and the
 * `og/free-ai-chess-coach` edge function went from under the 1 MB plan limit to
 * 1.04 MB. The build succeeded and the DEPLOY failed, which is the worst shape
 * for a failure: CI green, nothing shipped.
 *
 * Isolating it here lets `instrumentation.ts` reach it through a dynamic import
 * guarded directly on `NEXT_RUNTIME === "nodejs"`, the form Next statically
 * replaces per runtime, so the edge build never pulls the module in at all.
 * Verified by checking the edge bundle, not by assuming.
 */
export function initServerSentry(): void {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.VERCEL_ENV ?? "production",
    // Never auto-attach cookies, headers or IPs: server events would otherwise
    // carry the session cookie and the upstream API credentials on the request.
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
    debug: false,
  });
}
