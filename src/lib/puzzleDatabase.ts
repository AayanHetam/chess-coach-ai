import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { ChessPuzzle } from "./chessPuzzlesService";
import type { DifficultyBand } from "@/types/puzzles";

// Re-export for consumers that already import from here
export type { DifficultyBand } from "@/types/puzzles";

/**
 * Local puzzle database service (server-side only)
 * Queries pre-built static JSON files segregated by theme and difficulty band.
 * Replaces the previous Python/HuggingFace runtime dependency.
 */

export interface PuzzleQuery {
  themes?: string[];
  difficulty?: DifficultyBand | DifficultyBand[];
  limit?: number;
  shuffle?: boolean;
  minRating?: number;
  maxRating?: number;
}

export interface PuzzleDatabaseIndex {
  totalPuzzles: number;
  themes: Record<string, { total: number; bands: Record<string, number> }>;
  difficultyBands: Record<string, number[]>;
  generatedAt: string;
}

// Resolve the puzzle data directory relative to project root
const PUZZLES_DIR = join(process.cwd(), "src", "data", "puzzles");

// Load and cache the index
let _dbIndex: PuzzleDatabaseIndex | null = null;
function getIndex(): PuzzleDatabaseIndex {
  if (_dbIndex) return _dbIndex;
  const indexPath = join(PUZZLES_DIR, "index.json");
  const raw = readFileSync(indexPath, "utf-8");
  _dbIndex = JSON.parse(raw) as PuzzleDatabaseIndex;
  return _dbIndex;
}

// In-memory cache for loaded puzzle files
const puzzleCache: Record<string, ChessPuzzle[]> = {};

/**
 * Load a puzzle JSON file for a given theme and difficulty band.
 * Uses fs.readFileSync with in-memory caching (server-side only).
 */
function loadPuzzleFile(
  theme: string,
  band: DifficultyBand
): ChessPuzzle[] {
  const cacheKey = `${theme}/${band}`;

  if (puzzleCache[cacheKey]) {
    return puzzleCache[cacheKey];
  }

  try {
    const filePath = join(PUZZLES_DIR, theme, `${band}.json`);
    if (!existsSync(filePath)) return [];

    const raw = readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw) as Record<string, unknown>[];
    const puzzles: ChessPuzzle[] = data.map((p) => ({
      id: p.id as string,
      fen: p.fen as string,
      moves: p.moves as string[],
      rating: p.rating as number,
      themes: p.themes as string[],
      solution: p.moves as string[],
    }));

    puzzleCache[cacheKey] = puzzles;
    return puzzles;
  } catch {
    // File doesn't exist or is invalid for this theme/band combo
    return [];
  }
}

/**
 * Shuffle an array in place (Fisher-Yates)
 */
function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Query puzzles from the local database.
 *
 * @param query - Filter criteria (themes, difficulty, rating range, etc.)
 * @returns Array of matching ChessPuzzle objects
 */
export async function queryPuzzles(query: PuzzleQuery): Promise<ChessPuzzle[]> {
  const idx = getIndex();
  const {
    themes,
    difficulty,
    limit = 20,
    shuffle = true,
    minRating,
    maxRating,
  } = query;

  // Determine which themes to load
  const targetThemes: string[] = themes?.length
    ? themes.filter((t) => idx.themes[t])
    : Object.keys(idx.themes);

  // Determine which bands to load
  let targetBands: DifficultyBand[];
  if (difficulty) {
    targetBands = Array.isArray(difficulty) ? difficulty : [difficulty];
  } else {
    targetBands = Object.keys(idx.difficultyBands) as DifficultyBand[];
  }

  // Load all matching puzzle files
  const results: ChessPuzzle[][] = [];
  for (const theme of targetThemes) {
    const themeInfo = idx.themes[theme];
    if (!themeInfo) continue;

    for (const band of targetBands) {
      if (themeInfo.bands[band] && themeInfo.bands[band] > 0) {
        results.push(loadPuzzleFile(theme, band));
      }
    }
  }

  let allPuzzles = results.flat();

  // Deduplicate by puzzle ID (puzzles can appear under multiple themes)
  const seen = new Set<string>();
  allPuzzles = allPuzzles.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });

  // Apply rating range filters
  if (minRating !== undefined) {
    allPuzzles = allPuzzles.filter((p) => p.rating >= minRating);
  }
  if (maxRating !== undefined) {
    allPuzzles = allPuzzles.filter((p) => p.rating <= maxRating);
  }

  // Shuffle or sort
  if (shuffle) {
    allPuzzles = shuffleArray(allPuzzles);
  } else {
    allPuzzles.sort((a, b) => a.rating - b.rating);
  }

  // Apply limit
  return allPuzzles.slice(0, limit);
}

/**
 * Get puzzles by tactical theme(s) — drop-in replacement for the old getPuzzlesByTheme.
 */
export async function getPuzzlesByThemeLocal(
  themes: string[],
  limit: number = 20,
  difficulty?: DifficultyBand | DifficultyBand[]
): Promise<ChessPuzzle[]> {
  return queryPuzzles({ themes, limit, difficulty, shuffle: true });
}

/**
 * Find puzzles similar to a given position based on matching themes.
 */
export async function findSimilarPuzzles(
  themes: string[],
  targetRating?: number,
  limit: number = 5
): Promise<ChessPuzzle[]> {
  const ratingRange = 300;
  return queryPuzzles({
    themes,
    limit,
    shuffle: true,
    minRating: targetRating ? targetRating - ratingRange : undefined,
    maxRating: targetRating ? targetRating + ratingRange : undefined,
  });
}

/**
 * Get the database index metadata.
 */
export function getDatabaseIndex(): PuzzleDatabaseIndex {
  return getIndex();
}

/**
 * Get all available theme names in the database.
 */
export function getAvailableThemes(): string[] {
  return Object.keys(getIndex().themes);
}

/**
 * Get puzzle count for a specific theme, optionally filtered by difficulty.
 */
export function getPuzzleCount(
  theme?: string,
  difficulty?: DifficultyBand
): number {
  const idx = getIndex();
  if (!theme) {
    return idx.totalPuzzles;
  }

  const themeInfo = idx.themes[theme];
  if (!themeInfo) return 0;

  if (difficulty) {
    return themeInfo.bands[difficulty] || 0;
  }

  return themeInfo.total;
}

/**
 * Map a rating number to a difficulty band name.
 */
export function ratingToDifficulty(rating: number): DifficultyBand {
  if (rating <= 1200) return "beginner";
  if (rating <= 1600) return "intermediate";
  if (rating <= 2000) return "advanced";
  return "expert";
}
