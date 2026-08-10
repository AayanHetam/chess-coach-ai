/**
 * Response Cache — LRU cache for AI coaching responses.
 * Keyed by FEN + skill level + query hash to avoid redundant API calls
 * for identical or very similar queries.
 */

import { createHash } from "crypto";
import { PROMPT_VERSION } from "@/lib/prompts/coachChatPrompt";
import { VERBALIZER_PROMPT_VERSION } from "@/lib/prompts/verbalizerPrompt";

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
 * Combines FEN, skill level, a hash of the user message, and a hash of the
 * caller's coach-persona signature (personality + coachTone + playingStyle
 * + studyGoals + favoriteOpenings).
 *
 * The persona hash is the load-bearing addition. Without it, two users on
 * the same FEN asking the same question would share a cached response
 * authored under whichever persona warmed the cache first — meaning a
 * "strict masti" user could receive a reply authored under "friendly
 * positional," and the responses sometimes quote the requesting user's
 * username, so this also had a thin cross-user privacy edge.
 *
 * `personaSignature` is optional so this function stays a drop-in for any
 * caller that hasn't migrated yet; an undefined value collapses to the
 * empty-string bucket, which means legacy/anonymous callers still share a
 * single cache bucket per (fen, skillLevel, message).
 */
export function generateCacheKey(
  fen: string,
  skillLevel: string,
  userMessage: string,
  personaSignature?: string,
  moveHistory?: string[]
): string {
  const messageHash = createHash("md5")
    .update(userMessage.toLowerCase().trim())
    .digest("hex")
    .slice(0, 12);

  const personaHash = createHash("md5")
    .update(personaSignature ?? "")
    .digest("hex")
    .slice(0, 12);

  // Move history is part of the key: game reviews narrate the MOVES, not
  // just the final position. Keying on final FEN alone meant two different
  // games transposing into the same position (with the same question)
  // shared a cached response narrating the FIRST game's moves — a
  // wrong-answer-served bug, not just a stale one. Absent history (pure
  // position analysis) collapses to the empty bucket, preserving old keys.
  const movesHash = createHash("md5")
    .update((moveHistory ?? []).join(","))
    .digest("hex")
    .slice(0, 12);

  // Normalize FEN by removing move counters (halfmove clock + fullmove number)
  // so the same position at different move numbers still matches
  const fenParts = fen.split(" ");
  const normalizedFen = fenParts.slice(0, 4).join(" ");

  // Prefix with PROMPT_VERSION so a prompt revision (Phase 2 = "3.0") makes
  // older cache entries unreachable instead of serving stale stub-prompt
  // analyses to clients on the new prompt.
  return `v${PROMPT_VERSION}|${normalizedFen}|${skillLevel}|${messageHash}|p${personaHash}|m${movesHash}`;
}

/**
 * Contract-mode cache marker (PR-CI-4, plan §3 + risk #6): EVERY key the
 * verbalizer-4.0 path reads or writes carries this prefix, so dual-mode
 * serving can never cross-serve — legacy 3.6 keys are untouched (warm
 * rollback) and a contract response can never satisfy a legacy lookup or
 * vice versa. Unit-tested at every generateCacheKey call site
 * (contractCacheKey.test.ts).
 */
export const CONTRACT_CACHE_PREFIX = `c${VERBALIZER_PROMPT_VERSION}|`;

/**
 * The ONLY key builder the contract serving path may use. Same inputs as
 * generateCacheKey (identical bucketing semantics) with the contract-mode
 * marker prepended.
 */
export function generateContractCacheKey(
  fen: string,
  skillLevel: string,
  userMessage: string,
  personaSignature?: string,
  moveHistory?: string[]
): string {
  return `${CONTRACT_CACHE_PREFIX}${generateCacheKey(fen, skillLevel, userMessage, personaSignature, moveHistory)}`;
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
