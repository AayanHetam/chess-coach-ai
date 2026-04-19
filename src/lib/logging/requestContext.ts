import { AsyncLocalStorage } from "async_hooks";

interface RequestContext {
  requestId: string;
  startTime: number;
}

const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Run a function within a request context.
 * The requestId flows through the entire async call chain automatically.
 */
export function withRequestContext<T>(
  requestId: string,
  fn: () => T | Promise<T>
): T | Promise<T> {
  return asyncLocalStorage.run(
    { requestId, startTime: Date.now() },
    fn
  );
}

/** Get the current request ID (or "no-request" if outside a request context) */
export function getRequestId(): string {
  return asyncLocalStorage.getStore()?.requestId ?? "no-request";
}

/** Get the elapsed time since the request started (ms) */
export function getRequestElapsed(): number {
  const store = asyncLocalStorage.getStore();
  return store ? Date.now() - store.startTime : 0;
}

/**
 * Extract a request ID from a Next.js request.
 * Uses Vercel's x-vercel-id header in production, falls back to crypto.randomUUID().
 */
export function extractRequestId(headers: Headers): string {
  return (
    headers.get("x-vercel-id") ||
    headers.get("x-request-id") ||
    crypto.randomUUID()
  );
}
