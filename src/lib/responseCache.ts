/**
 * Response Cache — LRU cache for AI coaching responses.
 * Keyed by FEN + skill level + query hash to avoid redundant API calls
 * for identical or very similar queries.
 */

import { createHash } from "crypto";

interface CacheEntry {
  response: string;
  timestamp: number;
  validationScore: number;
  hitCount: number;
}

const MAX_CACHE_SIZE = 200;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// In-memory LRU cache (server-side, persists across requests in the same process)
const cache = new Map<string, CacheEntry>();

/**
 * Generate a cache key from the query parameters.
 * Combines FEN, skill level, and a hash of the user message.
 */
export function generateCacheKey(
  fen: string,
  skillLevel: string,
  userMessage: string
): string {
  const messageHash = createHash("md5")
    .update(userMessage.toLowerCase().trim())
    .digest("hex")
    .slice(0, 12);

  // Normalize FEN by removing move counters (halfmove clock + fullmove number)
  // so the same position at different move numbers still matches
  const fenParts = fen.split(" ");
  const normalizedFen = fenParts.slice(0, 4).join(" ");

  return `${normalizedFen}|${skillLevel}|${messageHash}`;
}

/**
 * Look up a cached response.
 * Returns the cached response if found and not expired, null otherwise.
 */
export function getCachedResponse(cacheKey: string): string | null {
  const entry = cache.get(cacheKey);
  if (!entry) return null;

  // Check TTL
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(cacheKey);
    return null;
  }

  // Only serve high-quality cached responses
  if (entry.validationScore < 0.8) {
    cache.delete(cacheKey);
    return null;
  }

  // Update hit count and move to end (LRU behavior)
  entry.hitCount++;
  cache.delete(cacheKey);
  cache.set(cacheKey, entry);

  console.log(`📦 Cache HIT for key: ${cacheKey.slice(0, 50)}... (hits: ${entry.hitCount})`);
  return entry.response;
}

/**
 * Store a response in the cache.
 * Only caches responses with a validation score >= 0.8.
 */
export function setCachedResponse(
  cacheKey: string,
  response: string,
  validationScore: number
): void {
  // Don't cache low-quality responses
  if (validationScore < 0.8) {
    console.log(`📦 Cache SKIP — validation score too low: ${validationScore.toFixed(2)}`);
    return;
  }

  // Evict oldest entries if at capacity (LRU)
  if (cache.size >= MAX_CACHE_SIZE) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) {
      cache.delete(oldestKey);
    }
  }

  cache.set(cacheKey, {
    response,
    timestamp: Date.now(),
    validationScore,
    hitCount: 0,
  });

  console.log(`📦 Cache SET for key: ${cacheKey.slice(0, 50)}... (size: ${cache.size})`);
}

/**
 * Get cache statistics for monitoring.
 */
export function getCacheStats(): {
  size: number;
  maxSize: number;
  oldestEntryAge: number | null;
} {
  let oldestAge: number | null = null;
  const entries = Array.from(cache.values());
  for (let i = 0; i < entries.length; i++) {
    const age = Date.now() - entries[i].timestamp;
    if (oldestAge === null || age > oldestAge) {
      oldestAge = age;
    }
  }

  return {
    size: cache.size,
    maxSize: MAX_CACHE_SIZE,
    oldestEntryAge: oldestAge,
  };
}

/**
 * Clear the entire cache.
 */
export function clearCache(): void {
  cache.clear();
  console.log("📦 Cache CLEARED");
}
