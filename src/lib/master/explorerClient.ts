/**
 * The browser's side of /api/opening-explorer.
 *
 * One cache for every caller (the Masters panel, the "Most common" arrow), so
 * a position is asked for once per page load however many times the board
 * returns to it, and so a position the panel prefetched is already here when
 * the user gets to it. Keyed by the position, not the FEN string: move
 * counters do not change the answer.
 *
 * Failures are not cached. A retry has to be able to succeed.
 */

export type MasterSource = "tree" | "curated" | "lichess" | "chessdb";

export interface ApiMove {
  uci: string;
  san?: string;
  count?: number;
  white?: number;
  draws?: number;
  black?: number;
  eval?: number;
  rank?: number;
  winrate?: number;
}

/** Provenance for the generated tree, surfaced in the panel footer. */
export interface MasterCorpusMeta {
  games: number;
  positions: number;
  maxPlies: number;
  minGames: number;
  source: string;
  generatedAt: string;
}

export interface ApiData {
  moves: ApiMove[];
  /** Games that reached the position. Shares divide by this, never by the rows. */
  total?: number;
  opening?: { eco: string | null; name: string };
  source?: MasterSource;
  /** False when the source has no game statistics at all. Absent = true. */
  hasGameCounts?: boolean;
  indexedPositions?: number;
  corpus?: MasterCorpusMeta;
}

/** Rows asked for. The tree holds at most 20 at any position. */
export const ROWS_REQUESTED = 20;

const MAX_ANSWERS = 400;

const answers = new Map<string, ApiData>();
const inFlight = new Map<string, Promise<ApiData>>();

function positionKey(fen: string): string {
  return fen.split(" ").slice(0, 4).join(" ");
}

function remember(key: string, data: ApiData): void {
  if (answers.size >= MAX_ANSWERS) {
    const oldest = answers.keys().next().value;
    if (oldest !== undefined) answers.delete(oldest);
  }
  answers.set(key, data);
}

/** The answer for this position if it has already arrived. Synchronous. */
export function peekExplorer(fen: string): ApiData | undefined {
  return answers.get(positionKey(fen));
}

/**
 * The answer for this position: from the cache, from a request already in
 * flight, or from a new one. Rejects on a non-2xx or a network failure.
 */
export function fetchExplorer(fen: string): Promise<ApiData> {
  const key = positionKey(fen);
  const hit = answers.get(key);
  if (hit) return Promise.resolve(hit);
  const pending = inFlight.get(key);
  if (pending) return pending;

  const request = (async () => {
    const url = `/api/opening-explorer?fen=${encodeURIComponent(fen)}&moves=${ROWS_REQUESTED}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as ApiData;
    remember(key, data);
    return data;
  })().finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, request);
  return request;
}

/** Ask for a position the user is likely to reach next; nothing to report. */
export function prefetchExplorer(fen: string): void {
  fetchExplorer(fen).catch(() => {
    /* a prefetch that fails has cost nothing; the real request will retry */
  });
}

/** Test seam. */
export function resetExplorerCacheForTests(): void {
  answers.clear();
  inFlight.clear();
}
