/**
 * Short-lived cache for BILLED health probes.
 *
 * `/api/health/llm` and `/api/health/anthropic` each make a real (if tiny)
 * Anthropic/OpenAI call on every request, and both are unauthenticated with no
 * rate limit. That is fine for a human checking once; it is not fine as a
 * public endpoint, where anyone who finds the URL can loop it and bill the
 * account — and hit provider rate limits that then affect real users.
 *
 * Deliberately a cache and not an auth check: an uptime monitor polls these
 * from outside, and adding a shared secret would silently break that monitor
 * until someone remembered to add the header. A cache fixes the abuse vector
 * with no configuration anywhere.
 *
 * Two behaviours, both load-bearing:
 *
 *  - **TTL**: repeat callers inside the window get the stored verdict instead
 *    of a new billed call. A monitor polling on a longer interval than the TTL
 *    still gets a genuinely fresh probe every time, so monitoring keeps
 *    working exactly as before.
 *  - **Single-flight**: concurrent callers share ONE in-flight probe rather
 *    than each starting their own. Without this a burst arriving inside the
 *    same millisecond all miss the cache together and every one of them bills.
 *
 * Failures are cached too. During a provider outage the useful behaviour is to
 * stop hammering an API that is already struggling; a monitor polling on a
 * longer interval than the TTL still sees the recovery on its next poll.
 *
 * State is module-level, so it is per warm serverless instance — the same
 * scope as every other cache in this codebase. It bounds the worst case to one
 * probe per instance per window, which is the point.
 */

interface Entry {
  value: unknown;
  atMs: number;
}

const entries = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

export interface ProbeResult<T> {
  value: T;
  /** True when this came from the cache — surfaced in the response so a human
   *  debugging an outage is never shown a stale verdict as if it were live. */
  cached: boolean;
  /** Age of the value in ms. 0 for a fresh probe. */
  ageMs: number;
}

/** Default window. Short enough that a 1-5 minute monitor always probes for
 *  real; long enough that a tight loop bills once instead of thousands. */
export const PROBE_TTL_MS = 60_000;

export async function cachedProbe<T>(
  key: string,
  fn: () => Promise<T>,
  ttlMs: number = PROBE_TTL_MS,
  now: () => number = Date.now,
): Promise<ProbeResult<T>> {
  const hit = entries.get(key);
  if (hit) {
    const ageMs = now() - hit.atMs;
    if (ageMs < ttlMs) {
      return { value: hit.value as T, cached: true, ageMs };
    }
  }

  // Single-flight: a concurrent burst shares one probe.
  const existing = inflight.get(key);
  if (existing) {
    return { value: (await existing) as T, cached: true, ageMs: 0 };
  }

  const p = (async () => {
    const value = await fn();
    entries.set(key, { value, atMs: now() });
    return value;
  })();
  inflight.set(key, p);
  try {
    const value = (await p) as T;
    return { value, cached: false, ageMs: 0 };
  } finally {
    inflight.delete(key);
  }
}

/** Test-only: drop all cached probes. */
export function __resetProbeCache(): void {
  entries.clear();
  inflight.clear();
}
