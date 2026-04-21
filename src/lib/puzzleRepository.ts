import neo4j from "neo4j-driver";
import { executeRead, isNeo4jConfigured } from "./neo4j";
import type { ChessPuzzle } from "./chessPuzzlesService";
import type { DifficultyBand } from "@/types/puzzles";

/**
 * Neo4j-backed puzzle repository (server-side only).
 *
 * Queries the ~200k-puzzle Lichess graph loaded into Aura. The Puzzle node
 * carries {puzzleId, fen, moves (space-separated UCI), rating, popularity,
 * nbPlays}. Themes are normalized to kebab-case IDs (e.g. "knight-fork").
 *
 * Callers: /api/chess-puzzles-dataset, /api/courses/*, server-side course
 * builders. Client callers must go through the API route.
 */

export interface PuzzleQuery {
  themes?: string[];
  difficulty?: DifficultyBand | DifficultyBand[];
  limit?: number;
  minRating?: number;
  maxRating?: number;
  excludeIds?: string[];
  /** If true, any matching theme is OK; otherwise all themes must match. */
  anyTheme?: boolean;
}

// Difficulty band → rating window (mirrors the old puzzleDatabase mapping)
const BAND_RANGES: Record<DifficultyBand, [number, number]> = {
  beginner: [0, 1200],
  intermediate: [1201, 1600],
  advanced: [1601, 2000],
  expert: [2001, 4000],
};

/**
 * Normalize a theme string to the kebab-case ID used as `:Theme.id` in Neo4j.
 * Accepts camelCase ("knightFork"), spaced ("Knight Fork"), snake_case, and
 * already-kebab forms.
 */
export function normalizeThemeId(theme: string): string {
  return theme
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

function bandsToRatingWindow(
  difficulty: DifficultyBand | DifficultyBand[] | undefined
): { min: number; max: number } | null {
  if (!difficulty) return null;
  const bands = Array.isArray(difficulty) ? difficulty : [difficulty];
  if (bands.length === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const b of bands) {
    const range = BAND_RANGES[b];
    if (!range) continue;
    if (range[0] < min) min = range[0];
    if (range[1] > max) max = range[1];
  }
  if (!isFinite(min) || !isFinite(max)) return null;
  return { min, max };
}

interface Neo4jPuzzleRecord {
  puzzleId: string;
  fen: string;
  moves: string;
  rating: number;
  themes: string[];
  popularity?: number;
  nbPlays?: number;
}

function toChessPuzzle(r: Neo4jPuzzleRecord): ChessPuzzle {
  const moves = typeof r.moves === "string" ? r.moves.trim().split(/\s+/) : [];
  return {
    id: r.puzzleId,
    fen: r.fen,
    moves,
    rating: r.rating,
    themes: r.themes ?? [],
    solution: moves,
  };
}

/**
 * Primary puzzle query. Returns puzzles matching `themes` (any, not all),
 * within the optional rating/difficulty window, excluding `excludeIds`, and
 * randomized (server-side `rand()` ordering). If `themes` is omitted, returns
 * random puzzles across the whole corpus.
 */
export async function queryPuzzles(
  query: PuzzleQuery
): Promise<ChessPuzzle[]> {
  if (!isNeo4jConfigured()) {
    throw new Error("Neo4j is not configured");
  }

  const {
    themes,
    difficulty,
    limit = 20,
    minRating,
    maxRating,
    excludeIds = [],
  } = query;

  const ratingWindow = bandsToRatingWindow(difficulty);
  const finalMin = minRating ?? ratingWindow?.min ?? 0;
  const finalMax = maxRating ?? ratingWindow?.max ?? 4000;

  const normalizedThemes =
    themes && themes.length > 0 ? themes.map(normalizeThemeId) : null;

  const params: Record<string, unknown> = {
    excludeIds,
    minRating: neo4j.int(Math.floor(finalMin)),
    maxRating: neo4j.int(Math.floor(finalMax)),
    limit: neo4j.int(limit),
  };

  let cypher: string;
  if (normalizedThemes && normalizedThemes.length > 0) {
    params.themes = normalizedThemes;
    cypher = `
      MATCH (p:Puzzle)-[:HAS_THEME]->(t:Theme)
      WHERE (t.id IN $themes OR t.name IN $themes)
        AND p.rating >= $minRating
        AND p.rating <= $maxRating
        AND NOT p.puzzleId IN $excludeIds
      WITH DISTINCT p
      RETURN p.puzzleId  AS puzzleId,
             p.fen       AS fen,
             p.moves     AS moves,
             p.rating    AS rating,
             [(p)-[:HAS_THEME]->(th:Theme) | coalesce(th.id, th.name)] AS themes,
             coalesce(p.popularity, 0) AS popularity,
             coalesce(p.nbPlays, 0)    AS nbPlays
      ORDER BY rand()
      LIMIT $limit
    `;
  } else {
    cypher = `
      MATCH (p:Puzzle)
      WHERE p.rating >= $minRating
        AND p.rating <= $maxRating
        AND NOT p.puzzleId IN $excludeIds
      RETURN p.puzzleId  AS puzzleId,
             p.fen       AS fen,
             p.moves     AS moves,
             p.rating    AS rating,
             [(p)-[:HAS_THEME]->(th:Theme) | coalesce(th.id, th.name)] AS themes,
             coalesce(p.popularity, 0) AS popularity,
             coalesce(p.nbPlays, 0)    AS nbPlays
      ORDER BY rand()
      LIMIT $limit
    `;
  }

  const records = await executeRead<Neo4jPuzzleRecord>(cypher, params);
  return records.map(toChessPuzzle);
}

/**
 * Find puzzles similar to the anchor themes, centered on targetRating ± 300.
 */
export async function findSimilarPuzzles(
  themes: string[],
  targetRating?: number,
  limit = 5,
  excludeIds: string[] = []
): Promise<ChessPuzzle[]> {
  const window = 300;
  return queryPuzzles({
    themes,
    limit,
    excludeIds,
    minRating: targetRating ? Math.max(0, targetRating - window) : undefined,
    maxRating: targetRating ? targetRating + window : undefined,
  });
}

/**
 * Deterministic "daily puzzle" — stable across a calendar day for all users.
 * Uses a seeded pick from a shuffled pool.
 */
export async function getDailyPuzzle(): Promise<ChessPuzzle | null> {
  const pool = await queryPuzzles({ limit: 500 });
  if (pool.length === 0) return null;
  const today = new Date().toISOString().slice(0, 10);
  const seed = today.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return pool[seed % pool.length];
}

// Cache the theme list — it's small and changes rarely
let _themeListCache: { themes: string[]; fetchedAt: number } | null = null;
const THEME_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * List all theme IDs in the corpus. Cached for 5 minutes.
 */
export async function getAvailableThemes(): Promise<string[]> {
  if (
    _themeListCache &&
    Date.now() - _themeListCache.fetchedAt < THEME_CACHE_TTL_MS
  ) {
    return _themeListCache.themes;
  }
  const records = await executeRead<{ id: string; name: string }>(`
    MATCH (t:Theme)
    RETURN coalesce(t.id, t.name) AS id, t.name AS name
    ORDER BY id
  `);
  const themes = records.map((r) => r.id).filter(Boolean);
  _themeListCache = { themes, fetchedAt: Date.now() };
  return themes;
}

/**
 * Corpus statistics — total puzzle count + theme list with per-theme counts.
 * Used by /api/chess-puzzles-dataset?command=stats.
 */
export async function getCorpusStats(): Promise<{
  totalPuzzles: number;
  themes: { id: string; name: string; count: number }[];
}> {
  const [totalRec] = await executeRead<{ total: number }>(
    `MATCH (p:Puzzle) RETURN count(p) AS total`
  );
  const total = totalRec?.total ?? 0;

  const themeRecs = await executeRead<{
    id: string;
    name: string;
    count: number;
  }>(`
    MATCH (t:Theme)<-[:HAS_THEME]-(p:Puzzle)
    RETURN coalesce(t.id, t.name) AS id,
           t.name AS name,
           count(p) AS count
    ORDER BY count DESC
  `);

  return {
    totalPuzzles: total,
    themes: themeRecs.map((r) => ({
      id: r.id,
      name: r.name,
      count: r.count,
    })),
  };
}

/**
 * Map a raw rating → difficulty band, mirroring the old puzzleDatabase helper.
 */
export function ratingToDifficulty(rating: number): DifficultyBand {
  if (rating <= 1200) return "beginner";
  if (rating <= 1600) return "intermediate";
  if (rating <= 2000) return "advanced";
  return "expert";
}
