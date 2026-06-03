import fs from "node:fs";
import path from "node:path";

/**
 * Static-CSV-backed puzzle feed. Loads the bundled Lichess puzzle DB on
 * first call and serves filtered/random subsets without touching Neo4j.
 *
 * Why this exists (not just use /api/chess-puzzles-dataset):
 *   - The Neo4j-backed endpoint returns 503 when env vars aren't set
 *     (`⚠️ Neo4j not configured locally` per CLAUDE.md runtime-readiness),
 *     which is the default in dev.
 *   - /preview/puzzles needs a puzzle pool that "just works" — no Neo4j,
 *     no env vars, no preloading scripts. This module reads the CSV
 *     bundled with the deployment.
 *   - The Neo4j path is still preferred when configured; this is the
 *     fallback / preview-tier source.
 *
 * Vercel deploy contract (CRITICAL — per project_vercel_static_import_size_limit
 * memory): the CSV is loaded via fs.readFileSync, NOT via `import ... from
 * "...csv"`. Direct static imports of files >5MB cause Vercel's chunk-
 * serialization phase to hang indefinitely (cost us 6h on PR #53). The CSV
 * ships to the serverless function via `outputFileTracingIncludes` in
 * next.config.ts; this module reads it from `process.cwd()` at runtime.
 *
 * Performance: ~18MB file, ~100k rows. First call parses in ~1-2s on a
 * cold serverless container. Subsequent calls within the container's
 * lifetime hit the module-scoped cache in <1ms. The parse cost is
 * acceptable because the route is called sparingly (puzzle batches of
 * 10-50 at a time).
 *
 * Scaling to the full ~4.4M Lichess puzzle dump: replace the CSV file
 * (same path, same schema), bump `PUZZLE_CSV_FILENAME`, optionally split
 * into shards. No API contract change needed.
 */

const PUZZLE_CSV_FILENAME = "lichess_puzzles_100k.csv";

export interface FeedPuzzle {
  id: string;
  fen: string;
  /** UCI move list. solution[0] is the opponent's setup move per Lichess
   *  convention; solution[1+] is the solver. */
  solution: string[];
  rating: number;
  ratingDeviation: number;
  popularity: number;
  nbPlays: number;
  themes: string[];
  gameUrl?: string;
  openingTags?: string[];
}

export interface PuzzleFilters {
  /** OR filter — a puzzle matches if any of its themes is in this list. */
  themes?: string[];
  /** Inclusive rating band. Default: 400-3000 (entire range). */
  ratingMin?: number;
  ratingMax?: number;
  /** Puzzle IDs the caller has already seen; excluded from results. */
  excludeIds?: string[];
  /** Cap on results. Default: 10. Max: 50. */
  limit?: number;
  /** True (default) → randomized order. False → CSV order (deterministic). */
  randomize?: boolean;
}

interface CorpusIndex {
  puzzles: FeedPuzzle[];
  /** Theme → indices into `puzzles` for fast OR-filter intersection. */
  byTheme: Map<string, number[]>;
  /** Distinct themes with their puzzle counts (for the theme picker UI). */
  themeStats: Array<{ theme: string; count: number }>;
}

let CACHE: CorpusIndex | null = null;
let LOAD_PROMISE: Promise<CorpusIndex> | null = null;

/** Resolve the absolute path to the CSV bundled with the deploy. */
function resolveCsvPath(): string {
  // process.cwd() is the project root in Next.js serverless functions
  // (when outputFileTracingIncludes is set so the file ships).
  return path.join(process.cwd(), "data", PUZZLE_CSV_FILENAME);
}

/**
 * Minimal CSV parser tuned to the Lichess puzzle DB schema.
 *
 * The Lichess CSV columns are all simple strings without embedded commas
 * or quotes — themes use spaces as separators within the cell, not
 * commas — so we don't need a full RFC 4180 parser. Hand-rolling the
 * split saves ~50MB of memory allocation vs. csv-parse on the full file.
 *
 * If the schema ever changes to include quoted fields with commas, swap
 * this for csv-parse (already in deps).
 */
function parseLichessCsv(text: string): FeedPuzzle[] {
  const lines = text.split("\n");
  const puzzles: FeedPuzzle[] = [];
  // First line is the header — skip.
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const parts = line.split(",");
    // Schema: PuzzleId, FEN, Moves, Rating, RatingDeviation, Popularity,
    // NbPlays, Themes, GameUrl, OpeningTags
    if (parts.length < 8) continue;
    const id = parts[0];
    const fen = parts[1];
    const moves = parts[2];
    const rating = parseInt(parts[3], 10);
    const ratingDeviation = parseInt(parts[4], 10);
    const popularity = parseInt(parts[5], 10);
    const nbPlays = parseInt(parts[6], 10);
    const themesRaw = parts[7];
    const gameUrl = parts[8] || undefined;
    const openingTagsRaw = parts[9] || "";
    if (!id || !fen || !moves || !Number.isFinite(rating)) continue;
    const solution = moves.split(" ").filter(Boolean);
    const themes = themesRaw.split(" ").filter(Boolean);
    const openingTags = openingTagsRaw
      ? openingTagsRaw.split(" ").filter(Boolean)
      : undefined;
    puzzles.push({
      id,
      fen,
      solution,
      rating,
      ratingDeviation: Number.isFinite(ratingDeviation) ? ratingDeviation : 0,
      popularity: Number.isFinite(popularity) ? popularity : 0,
      nbPlays: Number.isFinite(nbPlays) ? nbPlays : 0,
      themes,
      gameUrl,
      openingTags,
    });
  }
  return puzzles;
}

/** Build the theme → indices index from a parsed puzzle list. */
function buildIndex(puzzles: FeedPuzzle[]): CorpusIndex {
  const byTheme = new Map<string, number[]>();
  for (let i = 0; i < puzzles.length; i++) {
    for (const t of puzzles[i].themes) {
      const list = byTheme.get(t);
      if (list) list.push(i);
      else byTheme.set(t, [i]);
    }
  }
  const themeStats = Array.from(byTheme.entries())
    .map(([theme, indices]) => ({ theme, count: indices.length }))
    .sort((a, b) => b.count - a.count);
  return { puzzles, byTheme, themeStats };
}

/**
 * Get the parsed + indexed puzzle corpus. First call loads + parses (~1-2s);
 * subsequent calls hit the cache. Concurrent first calls share the same
 * promise so we don't parse twice.
 */
export async function getPuzzleCorpus(): Promise<CorpusIndex> {
  if (CACHE) return CACHE;
  if (LOAD_PROMISE) return LOAD_PROMISE;
  LOAD_PROMISE = (async () => {
    const csvPath = resolveCsvPath();
    let text: string;
    try {
      text = await fs.promises.readFile(csvPath, "utf-8");
    } catch (err) {
      LOAD_PROMISE = null;
      throw new Error(
        `Puzzle CSV missing at ${csvPath} — check outputFileTracingIncludes in next.config. (${
          err instanceof Error ? err.message : String(err)
        })`,
      );
    }
    const puzzles = parseLichessCsv(text);
    const index = buildIndex(puzzles);
    CACHE = index;
    LOAD_PROMISE = null;
    return index;
  })();
  return LOAD_PROMISE;
}

/**
 * Query the corpus with filters. Returns up to `filters.limit` puzzles
 * matching the criteria, optionally randomized.
 *
 * The OR-theme filter intersects the per-theme indices (small) instead
 * of scanning the full 100k puzzles list. For unfiltered queries we
 * sample randomly from the full list.
 */
export async function queryPuzzleFeed(
  filters: PuzzleFilters = {},
): Promise<{ puzzles: FeedPuzzle[]; totalAvailable: number }> {
  const {
    themes,
    ratingMin = 400,
    ratingMax = 3000,
    excludeIds,
    limit = 10,
    randomize = true,
  } = filters;
  const cappedLimit = Math.max(1, Math.min(50, limit));
  const excludeSet = excludeIds && excludeIds.length > 0
    ? new Set(excludeIds)
    : null;

  const { puzzles, byTheme } = await getPuzzleCorpus();

  // Build the candidate index set.
  let candidateIndices: number[];
  if (themes && themes.length > 0) {
    const seen = new Set<number>();
    for (const t of themes) {
      const list = byTheme.get(t);
      if (!list) continue;
      for (const idx of list) seen.add(idx);
    }
    candidateIndices = Array.from(seen);
  } else {
    candidateIndices = puzzles.map((_, i) => i);
  }

  // Apply rating + exclude filters.
  const filteredIndices: number[] = [];
  for (const i of candidateIndices) {
    const p = puzzles[i];
    if (p.rating < ratingMin || p.rating > ratingMax) continue;
    if (excludeSet && excludeSet.has(p.id)) continue;
    filteredIndices.push(i);
  }

  // Select (randomized or first N).
  let selected: number[];
  if (randomize) {
    // Reservoir-ish: shuffle the candidate slice (cheap for our sizes).
    // Fisher-Yates on the indices, then take first `cappedLimit`.
    const a = filteredIndices.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    selected = a.slice(0, cappedLimit);
  } else {
    selected = filteredIndices.slice(0, cappedLimit);
  }

  return {
    puzzles: selected.map((i) => puzzles[i]),
    totalAvailable: filteredIndices.length,
  };
}

/**
 * Theme catalogue for the UI's theme picker. Sorted by descending count
 * so the most-populated themes surface first.
 */
export async function getThemeCatalogue(): Promise<
  Array<{ theme: string; count: number }>
> {
  const { themeStats } = await getPuzzleCorpus();
  return themeStats;
}

/** Lightweight stats for status/diagnostic surfaces. */
export async function getCorpusSummary(): Promise<{
  totalPuzzles: number;
  themeCount: number;
  ratingRange: { min: number; max: number };
}> {
  const { puzzles, themeStats } = await getPuzzleCorpus();
  let min = Infinity;
  let max = -Infinity;
  for (const p of puzzles) {
    if (p.rating < min) min = p.rating;
    if (p.rating > max) max = p.rating;
  }
  return {
    totalPuzzles: puzzles.length,
    themeCount: themeStats.length,
    ratingRange: {
      min: Number.isFinite(min) ? min : 0,
      max: Number.isFinite(max) ? max : 0,
    },
  };
}
