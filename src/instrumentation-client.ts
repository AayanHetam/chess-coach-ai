// Named imports, not `import * as Sentry`: under src/ this file is linted, and
// the `import/namespace` rule cannot resolve members through the namespace of
// @sentry/nextjs's type surface — it fails the build on `Sentry.init`. This
// file previously lived outside src/ where nothing linted it.
import { init, replayIntegration } from "@sentry/nextjs";

/**
 * Browser-side Sentry init.
 *
 * WHY THIS FILE EXISTS AT ALL. The settings below used to live in
 * `sentry.client.config.ts`, which is bundled only by the `withSentryConfig`
 * webpack plugin — and that plugin is configured in `next.config.ts`, which
 * Next never reads (`next.config.js` resolves first and wins). So the init was
 * never injected into any bundle, and Sentry has never run in production:
 * two independent failures, a missing DSN and an init that could not load.
 *
 * `instrumentation-client.ts` is loaded by Next itself on Next 15, with no
 * plugin involved. That makes browser error capture independent of which
 * config file wins, which is the property worth having here.
 *
 * The guards are unchanged and deliberate: no DSN means no init (so a fork or
 * a preview without the env var is silent rather than broken), and localhost
 * is excluded so development noise never reaches the project.
 */
if (
  process.env.NEXT_PUBLIC_SENTRY_DSN &&
  document.location.hostname !== "localhost"
) {
  init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: "production",
    // Stop the SDK from auto-attaching cookies, request headers, or the
    // client IP to events. Without this every captured exception carries
    // the cm_session cookie + the Anthropic / Firebase request signatures
    // visible to the browser, which is more identifying than anything we
    // actually need for triage.
    sendDefaultPii: false,
    integrations: [
      replayIntegration({
        // Session replays fire at 100% on errors (see below). Without
        // masking the replay would capture the visible chat, the user's
        // typed messages, ProfileDialog inputs (email + the moments
        // around password entry), and any PGN rendered on screen. Mask
        // text + inputs by default; the chess board pieces are PNG/SVG
        // so blocking media isn't needed for debugging continuity.
        maskAllText: true,
        maskAllInputs: true,
        blockAllMedia: false,
      }),
    ],
    tracesSampleRate: 1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    debug: false,
    initialScope: {
      extra: {
        hardwareConcurrency: navigator.hardwareConcurrency,
        deviceMemory:
          "deviceMemory" in navigator &&
          typeof navigator.deviceMemory === "number"
            ? navigator.deviceMemory
            : "unknown",
      },
    },
    ignoreErrors: [
      "AbortError: The user aborted a request.",
      "Failed to fetch",
      "Fetch is aborted",
      "The operation was aborted.",
      "AbortError: AbortError",
    ],
  });
}
