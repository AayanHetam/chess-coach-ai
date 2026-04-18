import * as Sentry from "@sentry/nextjs";
import { getRequestId } from "./requestContext";

/**
 * Enhanced Sentry error reporter that preserves the same `logErrorToSentry()` API
 * but adds structured breadcrumbs from the logger.
 *
 * Drop-in replacement for the existing src/lib/sentry.ts when ready.
 */

export const isSentryEnabled = () =>
  !!process.env.NEXT_PUBLIC_SENTRY_DSN && Sentry.isInitialized();

/**
 * Add a Sentry breadcrumb from a structured log entry.
 * Call this from the logger on info/warn entries so that when an error fires,
 * the Sentry error detail page shows the trail of events leading up to it.
 */
export function addLogBreadcrumb(
  level: "info" | "warn" | "debug",
  message: string,
  data?: Record<string, unknown>
) {
  if (!isSentryEnabled()) return;

  Sentry.addBreadcrumb({
    category: "log",
    message,
    level: level === "warn" ? "warning" : level,
    data: {
      ...data,
      requestId: getRequestId(),
    },
  });
}

/**
 * Report an error to Sentry with request context and optional structured data.
 */
export function logErrorToSentry(
  error: unknown,
  context?: Record<string, unknown>
) {
  if (isSentryEnabled()) {
    Sentry.captureException(error, {
      extra: {
        ...context,
        requestId: getRequestId(),
      },
    });
  } else {
    console.error(error);
  }
}
