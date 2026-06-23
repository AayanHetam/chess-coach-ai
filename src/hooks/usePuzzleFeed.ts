"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PuzzleContext } from "@/lib/validation/puzzleChatSchemas";

/**
 * Client-side puzzle queue backed by /api/puzzle-feed.
 *
 * Behavior:
 *   - On mount (and whenever filters change), fetches a batch of N puzzles.
 *   - Exposes `currentPuzzle` + `advance()` + `seenIds`.
 *   - When the queue runs low (≤2 remaining), prefetches the next batch
 *     with `excludeIds` covering everything seen so we never repeat
 *     within a session.
 *   - Filter changes reset both the queue and the seen-ids set — the
 *     user wants a fresh stream when they pick a new theme.
 *
 * Returns puzzles in the PuzzleContext shape the coach + page consume
 * directly (no extra mapping needed).
 */

export interface PuzzleFeedFilters {
  themes?: string[];
  ratingMin?: number;
  ratingMax?: number;
}

interface UsePuzzleFeedReturn {
  currentPuzzle: PuzzleContext | null;
  /** The next queued puzzles (after the current one) — used to preview a
   *  "drill more like this" set without consuming the queue. */
  upcoming: PuzzleContext[];
  /** Total in the corpus matching the active filters (before exclude). */
  totalAvailable: number | null;
  /** Position within the current batch (1-indexed). */
  positionInBatch: number;
  /** Size of the current batch. */
  batchSize: number;
  /** True during initial load OR refill. */
  loading: boolean;
  /** Populated when both the queue is empty AND the fetch failed. */
  error: string | null;
  /** Move to next puzzle. No-op when queue is empty. */
  advance: () => void;
  /** Bring an already-queued puzzle (by id) to the front so it becomes the
   *  current puzzle. No-op if the id isn't in the queue. Used by the drill
   *  menu to "open" a previewed puzzle on the main board. */
  jumpTo: (id: string) => void;
  /** Apply new filters (resets queue + seen-ids). */
  setFilters: (next: PuzzleFeedFilters) => void;
  /** Current active filters. */
  filters: PuzzleFeedFilters;
  /** Force a fresh batch with the current filters. */
  refresh: () => void;
}

const BATCH_SIZE = 20;
const REFILL_THRESHOLD = 2;
const MAX_EXCLUDE = 200;

interface FeedResponse {
  puzzles: Array<{
    id: string;
    fen: string;
    solution: string[];
    rating: number;
    themes: string[];
  }>;
  totalAvailable: number;
}

export function usePuzzleFeed(
  initialFilters: PuzzleFeedFilters = {},
): UsePuzzleFeedReturn {
  const [filters, setFiltersState] = useState<PuzzleFeedFilters>(initialFilters);
  const [queue, setQueue] = useState<PuzzleContext[]>([]);
  const [seenIds, setSeenIds] = useState<string[]>([]);
  const [totalAvailable, setTotalAvailable] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [batchSize, setBatchSize] = useState(0);
  const [positionInBatch, setPositionInBatch] = useState(0);

  // Stable ref so an in-flight fetch can detect "filters changed mid-flight,
  // drop my results."
  const filterKeyRef = useRef<string>(JSON.stringify(initialFilters));

  // Stable ref for the seen-ids list so the refill effect doesn't need
  // seenIds as a dep (which would re-fire on every solve).
  const seenIdsRef = useRef<string[]>([]);
  useEffect(() => {
    seenIdsRef.current = seenIds;
  }, [seenIds]);

  const fetchBatch = useCallback(
    async (
      currentFilters: PuzzleFeedFilters,
      excludeIds: string[],
      isInitial: boolean,
    ) => {
      const myKey = JSON.stringify(currentFilters);
      if (isInitial) {
        setLoading(true);
        setError(null);
      }
      try {
        const resp = await fetch("/api/puzzle-feed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...currentFilters,
            // Cap exclude list — server caps at 200 too.
            excludeIds: excludeIds.slice(-MAX_EXCLUDE),
            limit: BATCH_SIZE,
            randomize: true,
          }),
        });
        if (!resp.ok) {
          throw new Error(`puzzle-feed HTTP ${resp.status}`);
        }
        const data = (await resp.json()) as FeedResponse;
        // Drop results if filters changed while in flight.
        if (filterKeyRef.current !== myKey) return;
        const mapped: PuzzleContext[] = data.puzzles.map((p) => ({
          id: p.id,
          fen: p.fen,
          solution: p.solution,
          rating: p.rating,
          themes: p.themes,
        }));
        setTotalAvailable(data.totalAvailable);
        if (isInitial) {
          setQueue(mapped);
          setBatchSize(mapped.length);
          setPositionInBatch(mapped.length > 0 ? 1 : 0);
        } else {
          // Refill: append, don't reset position.
          setQueue((prev) => [...prev, ...mapped]);
        }
      } catch (err) {
        if (filterKeyRef.current !== myKey) return;
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      } finally {
        if (filterKeyRef.current === myKey && isInitial) {
          setLoading(false);
        }
      }
    },
    [],
  );

  // Initial load + reload on filter change.
  useEffect(() => {
    const key = JSON.stringify(filters);
    filterKeyRef.current = key;
    setQueue([]);
    setSeenIds([]);
    seenIdsRef.current = [];
    setPositionInBatch(0);
    setBatchSize(0);
    setTotalAvailable(null);
    fetchBatch(filters, [], true);
  }, [filters, fetchBatch]);

  // Refill when the queue gets low. Triggered by queue-length changes.
  useEffect(() => {
    if (loading) return;
    if (queue.length > REFILL_THRESHOLD) return;
    if (queue.length === 0 && batchSize > 0) {
      // Exhausted — try to refill with seen-ids as excludes.
      // If totalAvailable === seenIds.length, we've truly run out and
      // refilling won't help — but try once anyway to surface the empty
      // state cleanly.
    }
    fetchBatch(filters, seenIdsRef.current, false);
    // We deliberately depend on queue.length only — adding seenIds would
    // cause a refill loop after every solve.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue.length]);

  const currentPuzzle = queue.length > 0 ? queue[0] : null;
  // Peek the next puzzles without consuming them (capped so the drill menu
  // only ever previews a small set).
  const upcoming = useMemo(() => queue.slice(1, 4), [queue]);

  const jumpTo = useCallback((id: string) => {
    setQueue((prev) => {
      const idx = prev.findIndex((p) => p.id === id);
      if (idx <= 0) return prev; // not found, or already current
      // Mark the puzzles we skip over as seen so they don't reappear, then
      // reorder so the picked puzzle is current with the rest trailing it.
      const picked = prev[idx];
      const before = prev.slice(0, idx);
      const after = prev.slice(idx + 1);
      setSeenIds((s) => {
        const next = [...s];
        for (const p of before) if (!next.includes(p.id)) next.push(p.id);
        return next.length > MAX_EXCLUDE ? next.slice(-MAX_EXCLUDE) : next;
      });
      return [picked, ...after];
    });
  }, []);

  const advance = useCallback(() => {
    setQueue((prev) => {
      if (prev.length === 0) return prev;
      const consumed = prev[0];
      setSeenIds((s) => {
        if (s.includes(consumed.id)) return s;
        const next = [...s, consumed.id];
        return next.length > MAX_EXCLUDE ? next.slice(-MAX_EXCLUDE) : next;
      });
      const rest = prev.slice(1);
      setPositionInBatch((p) => p + 1);
      return rest;
    });
  }, []);

  const setFilters = useCallback((next: PuzzleFeedFilters) => {
    setFiltersState(next);
  }, []);

  const refresh = useCallback(() => {
    // Re-fire the initial-load path by bumping the filter key without
    // changing the filters themselves.
    setFiltersState((prev) => ({ ...prev }));
  }, []);

  return useMemo(
    () => ({
      currentPuzzle,
      upcoming,
      totalAvailable,
      positionInBatch,
      batchSize,
      loading,
      error,
      advance,
      jumpTo,
      setFilters,
      filters,
      refresh,
    }),
    [
      currentPuzzle,
      upcoming,
      totalAvailable,
      positionInBatch,
      batchSize,
      loading,
      error,
      advance,
      jumpTo,
      setFilters,
      filters,
      refresh,
    ],
  );
}
