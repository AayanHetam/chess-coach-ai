import * as Sentry from "@sentry/nextjs";

if (
  process.env.NEXT_PUBLIC_SENTRY_DSN &&
  document.location.hostname !== "localhost"
) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: "production",
    // Stop the SDK from auto-attaching cookies, request headers, or the
    // client IP to events. Without this every captured exception carries
    // the cm_session cookie + the Anthropic / Firebase request signatures
    // visible to the browser, which is more identifying than anything we
    // actually need for triage.
    sendDefaultPii: false,
    integrations: [
      Sentry.replayIntegration({
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
