/**
 * Module-scoped LRU cache for the puzzle-hint pipeline.
 *
 * Vercel serverless functions get cold-started routinely, so this cache
 * is "warm container only" — no durability promised. That's fine: a cold
 * start costs ~5s of Sonnet, not user-visible loss. If hit ratios start
 * to matter (most-popular puzzle + most-popular wrong move getting hit
 * by many users in the same container's lifetime), this trivially swaps
 * for a Redis adapter.
 *
 * Key: (puzzleId, stage, userAttemptSan, promptVersion). The version is
 * part of the key so a prompt bump invalidates the cache automatically.
 *
 * Capacity: 256 entries (each entry is ~2KB of JSON, so worst-case ~512KB
 * resident in the function's heap).
 */

import type {
  HintStage,
  PuzzleHintResponse,
} from "@/lib/validation/puzzleHintSchemas";

const CACHE_CAPACITY = 256;

interface CacheEntry {
  key: string;
  value: PuzzleHintResponse;
  /** Insertion order tracker for the LRU eviction. */
  hits: number;
}

// Map preserves insertion order in JS, which we use for FIFO-ish eviction.
// On every read, we delete + re-insert the entry to move it to "most
// recent" — that gives us true LRU semantics with no extra bookkeeping.
const CACHE = new Map<string, CacheEntry>();

export interface HintCacheKey {
  puzzleId: string;
  stage: HintStage;
  userAttemptSan: string | null;
  promptVersion: string;
}

function buildKey(k: HintCacheKey): string {
  return `${k.puzzleId}|${k.stage}|${k.userAttemptSan ?? "_"}|${k.promptVersion}`;
}

export function getCachedHint(k: HintCacheKey): PuzzleHintResponse | null {
  const key = buildKey(k);
  const entry = CACHE.get(key);
  if (!entry) return null;
  // LRU bump.
  CACHE.delete(key);
  entry.hits += 1;
  CACHE.set(key, entry);
  return entry.value;
}

export function setCachedHint(
  k: HintCacheKey,
  value: PuzzleHintResponse,
): void {
  const key = buildKey(k);
  if (CACHE.has(key)) CACHE.delete(key);
  CACHE.set(key, { key, value, hits: 0 });
  // Evict the least-recently-used entry (which is the first in iteration
  // order, by Map's insertion-order contract).
  while (CACHE.size > CACHE_CAPACITY) {
    const oldest = CACHE.keys().next().value;
    if (!oldest) break;
    CACHE.delete(oldest);
  }
}

/** Test-only helper to flush the cache between unit tests. */
export function _flushHintCache(): void {
  CACHE.clear();
}

/** Test-only helper to inspect cache state. */
export function _hintCacheSize(): number {
  return CACHE.size;
}
