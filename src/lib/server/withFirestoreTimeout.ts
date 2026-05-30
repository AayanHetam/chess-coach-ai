/**
 * Race a Firestore (or any) admin-SDK read/write against a hard
 * timeout, throwing a clear error if it doesn't return in time.
 *
 * Why this exists: the Firebase Admin SDK has no built-in per-call
 * deadline. When the server is under heavy load or the network blips,
 * a single `.get()` can hang for the platform's full function timeout
 * (10s hobby / 60s pro on Vercel). That parks the upstream caller —
 * an auth flow, a /api/auth/me hit, a session check — until the
 * platform finally kills the function. With this wrapper, a healthy
 * Firestore is still microseconds-fast and the worst case becomes
 * predictable: throw FirestoreTimeoutError, let the caller decide.
 *
 * Default timeout 3s — Firestore admin reads in healthy mode finish
 * in <100ms, so 3s is well above the 99.9th percentile while still
 * bounding a stall to something noticeable in logs.
 */

export class FirestoreTimeoutError extends Error {
  constructor(public readonly op: string, public readonly timeoutMs: number) {
    super(`Firestore operation timed out after ${timeoutMs}ms: ${op}`);
    this.name = "FirestoreTimeoutError";
  }
}

export async function withFirestoreTimeout<T>(
  promise: Promise<T>,
  op: string,
  timeoutMs = 3_000,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new FirestoreTimeoutError(op, timeoutMs));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
