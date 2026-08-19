/**
 * Per-IP courtesy throttle, shared across unauthenticated routes.
 *
 * Extracted from the inline limiter that /api/ratings/preview grew, so the
 * open, cost-bearing endpoints (puzzle-hint's Anthropic proxy, the public
 * explorer relays) can share one implementation instead of copy-pasting it.
 *
 * Scope and honesty: this is a per-warm-instance, in-memory limiter. On
 * serverless it is best-effort — a burst spread across cold containers each
 * gets its own budget, and it resets on redeploy. It is a courtesy throttle
 * that caps trivial single-source abuse (a script hammering one route to burn
 * the Anthropic bill), NOT a security control. A real limiter needs a shared
 * store (Upstash/Redis); that is the deferred Phase 3 rate-limiting work and
 * is tracked separately.
 */

export interface RateLimitConfig {
  /** Sliding window length in milliseconds. */
  windowMs: number;
  /** Max requests allowed per IP within the window. */
  max: number;
}

const buckets = new Map<string, Map<string, number[]>>();

function bucketFor(name: string): Map<string, number[]> {
  let b = buckets.get(name);
  if (!b) {
    b = new Map();
    buckets.set(name, b);
  }
  return b;
}

/**
 * Best-effort client IP from proxy headers. Falls back to "unknown", which
 * means all header-less callers share one bucket — acceptable for a courtesy
 * throttle.
 */
export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  return (
    fwd?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Records a hit for `ip` under the named `bucket` and returns true if the
 * caller has exceeded `config.max` within `config.windowMs`.
 */
export function rateLimited(
  bucket: string,
  ip: string,
  config: RateLimitConfig,
  now: number = Date.now()
): boolean {
  const hits = bucketFor(bucket);
  const recent = (hits.get(ip) ?? []).filter(
    (t) => now - t < config.windowMs
  );
  if (recent.length >= config.max) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  // Opportunistic sweep so a long-lived instance doesn't grow one entry per
  // visitor forever.
  if (hits.size > 5000) {
    for (const k of Array.from(hits.keys())) {
      const v = hits.get(k) ?? [];
      if (v.every((t) => now - t > config.windowMs)) hits.delete(k);
    }
  }
  return false;
}
