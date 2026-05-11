import { Chess } from "chess.js";

const LICHESS_TABLEBASE_URL = "https://tablebase.lichess.ovh/standard";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_NON_KING_PIECES = 7;
const FETCH_TIMEOUT_MS = 5000;

export type TablebaseCategory =
  | "win"
  | "loss"
  | "draw"
  | "cursed-win"
  | "blessed-loss"
  | "maybe-win"
  | "maybe-loss"
  | "unknown";

export interface TablebaseMove {
  uci: string;
  san?: string;
  category: TablebaseCategory;
  dtm: number | null;
  dtz: number | null;
  zeroing?: boolean;
  checkmate?: boolean;
  stalemate?: boolean;
}

export interface TablebaseResult {
  category: TablebaseCategory;
  dtm: number | null;
  dtz: number | null;
  checkmate: boolean;
  stalemate: boolean;
  insufficientMaterial: boolean;
  moves: TablebaseMove[];
}

interface CacheEntry {
  result: TablebaseResult | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export function countNonKingPieces(fen: string): number {
  const game = new Chess(fen);
  let count = 0;
  for (const row of game.board()) {
    for (const sq of row) {
      if (sq && sq.type !== "k") count++;
    }
  }
  return count;
}

export function isTablebaseEligible(fen: string): boolean {
  try {
    return countNonKingPieces(fen) <= MAX_NON_KING_PIECES;
  } catch {
    return false;
  }
}

/**
 * Test hook to inject a fetch implementation. Production uses globalThis.fetch.
 */
let fetchImpl: typeof fetch = (input, init) => fetch(input, init);
export function __setFetchForTesting(impl: typeof fetch): void {
  fetchImpl = impl;
}
export function __resetFetchForTesting(): void {
  fetchImpl = (input, init) => fetch(input, init);
}
export function __clearTablebaseCache(): void {
  cache.clear();
}

/**
 * Thin proxy to Lichess tablebase. Returns null on rate limit, network error,
 * position rejected, or position has >7 non-king pieces. Cached for 24h.
 *
 * Failure handling per FAILURE_MODES §10c-10d: skip silently on degraded
 * responses rather than throwing, so the prompt-context builder can omit
 * the tablebase block cleanly. Never retries inline (latency budget).
 */
export async function fetch_lichess_tablebase(fen: string): Promise<TablebaseResult | null> {
  if (!isTablebaseEligible(fen)) return null;

  const cached = cache.get(fen);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const url = `${LICHESS_TABLEBASE_URL}?fen=${encodeURIComponent(fen)}`;
    const res = await fetchImpl(url, { signal: controller.signal });
    if (!res.ok) {
      cache.set(fen, { result: null, expiresAt: Date.now() + CACHE_TTL_MS });
      return null;
    }
    const body = (await res.json()) as RawTablebaseResponse;
    const result = normalizeResponse(body);
    cache.set(fen, { result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

interface RawTablebaseResponse {
  category?: string;
  dtm?: number | null;
  dtz?: number | null;
  checkmate?: boolean;
  stalemate?: boolean;
  insufficient_material?: boolean;
  moves?: Array<{
    uci?: string;
    san?: string;
    category?: string;
    dtm?: number | null;
    dtz?: number | null;
    zeroing?: boolean;
    checkmate?: boolean;
    stalemate?: boolean;
  }>;
}

function normalizeCategory(c: string | undefined): TablebaseCategory {
  const known: TablebaseCategory[] = [
    "win",
    "loss",
    "draw",
    "cursed-win",
    "blessed-loss",
    "maybe-win",
    "maybe-loss",
    "unknown",
  ];
  if (!c) return "unknown";
  return (known as string[]).includes(c) ? (c as TablebaseCategory) : "unknown";
}

function normalizeResponse(raw: RawTablebaseResponse): TablebaseResult {
  return {
    category: normalizeCategory(raw.category),
    dtm: raw.dtm ?? null,
    dtz: raw.dtz ?? null,
    checkmate: raw.checkmate ?? false,
    stalemate: raw.stalemate ?? false,
    insufficientMaterial: raw.insufficient_material ?? false,
    moves: (raw.moves ?? []).map((m) => ({
      uci: m.uci ?? "",
      san: m.san,
      category: normalizeCategory(m.category),
      dtm: m.dtm ?? null,
      dtz: m.dtz ?? null,
      zeroing: m.zeroing,
      checkmate: m.checkmate,
      stalemate: m.stalemate,
    })),
  };
}
