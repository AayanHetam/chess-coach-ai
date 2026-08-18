import type { PuzzleContext } from "@/lib/validation/puzzleChatSchemas";

/**
 * Handing a set of puzzles from /analysis to /puzzles.
 *
 * The two pages draw from different stores: /analysis asks Neo4j for puzzles
 * similar to the mistake in front of you (`/api/similar-puzzles`), while
 * /puzzles streams its own static corpus. The bridge is
 * `puzzlePracticeQueueAtom` — a localStorage-backed atom that /puzzles already
 * snapshots on mount for the "practice missed" flow — so a generated set can
 * be dropped in and picked up across the navigation without a server round
 * trip or a new table.
 *
 * The set is ALSO kept on the chat message that produced it, so the same
 * puzzles can be relaunched from the transcript later. The atom is consumed
 * and cleared by /puzzles; the message is the durable copy.
 */

/** A puzzle row as `/api/similar-puzzles` returns it. */
export interface SimilarPuzzleRow {
  puzzleId: string;
  fen: string;
  /** Space-separated UCI. Lichess convention: move 0 is the opponent's
   *  setup move, move 1 is the solver's first move. */
  moves: string;
  rating?: number;
  themes?: string[];
}

/** A generated set, as stored on the coach message that produced it. */
export interface PuzzleSet {
  /** Stable id so a relaunch from the transcript is traceable. */
  id: string;
  /** The theme the set was built around, in the app's vocabulary. */
  theme: string;
  /** Human-readable theme name for the card. */
  displayName: string;
  /** The position the set was generated from, so it can be regenerated. */
  sourceFen: string;
  /** Ply in the game this came from, for "back to the mistake". */
  sourcePly: number;
  puzzles: PuzzleContext[];
  createdAt: number;
}

/**
 * Convert one API row into the shape /puzzles consumes.
 *
 * Returns null rather than a half-built puzzle: a row with no solution moves
 * would render an unsolvable board, and a puzzle you cannot solve is worse
 * than one that was never offered.
 */
export function toPuzzleContext(row: SimilarPuzzleRow): PuzzleContext | null {
  if (!row?.puzzleId || !row.fen) return null;
  const solution = (row.moves ?? "").split(/\s+/).filter(Boolean);
  // Needs the opponent setup move AND at least one solver move.
  if (solution.length < 2) return null;
  const rating =
    typeof row.rating === "number" && row.rating >= 400 && row.rating <= 3000
      ? Math.round(row.rating)
      : undefined;
  return {
    id: row.puzzleId,
    fen: row.fen,
    solution,
    ...(rating !== undefined ? { rating } : {}),
    themes: Array.isArray(row.themes) ? row.themes.slice(0, 20) : [],
  };
}

/** Map a batch, dropping unusable rows. */
export function toPuzzleContexts(rows: SimilarPuzzleRow[]): PuzzleContext[] {
  const out: PuzzleContext[] = [];
  const seen = new Set<string>();
  for (const row of rows ?? []) {
    const p = toPuzzleContext(row);
    // Duplicate ids would make /puzzles' one-grade-per-id guard drop the
    // second copy silently, so the set would be shorter than it claims.
    if (p && !seen.has(p.id)) {
      seen.add(p.id);
      out.push(p);
    }
  }
  return out;
}

/**
 * Which theme to build a practice set around, given what the page knows.
 *
 * Order matters: the tactical motifs detected at the actual mistake are the
 * most specific signal, then whatever concept the coach named in its last
 * insight, then the caller's explicit request. Returns null when there is
 * nothing to go on — the command then has to ask rather than guess, because
 * a set built on a guessed theme trains the wrong pattern.
 */
export function pickPracticeTheme(sources: {
  /** Motifs detected at the current mistake, most specific first. */
  mistakeMotifs?: string[];
  /** Concept keys the coach has named in this conversation, newest first. */
  coachConcepts?: string[];
  /** An explicit theme the user typed after the command. */
  explicit?: string;
}): string | null {
  const explicit = sources.explicit?.trim();
  if (explicit) return explicit;
  const motif = sources.mistakeMotifs?.find((m) => m && m.trim().length > 0);
  if (motif) return motif.trim();
  const concept = sources.coachConcepts?.find((c) => c && c.trim().length > 0);
  if (concept) return concept.trim();
  return null;
}

/**
 * Themes the puzzle store has no entry for.
 *
 * Measured against the live corpus 2026-08-13: every other key in
 * TACTICAL_THEMES returns topically-correct puzzles (the API normalises
 * camelCase to the store's kebab-case), but these two return nothing. Asking
 * for them yields an empty set, so the command should say so up front instead
 * of running a query that cannot succeed.
 */
export const UNAVAILABLE_THEMES = new Set(["xRayAttack", "x-ray-attack"]);

/** Keys the store spells differently from the app's vocabulary. */
const THEME_ALIASES: Record<string, string> = {
  // Measured: `mateIn2` returns 0, `mate-in-2` returns a full set.
  mateIn2: "mate-in-2",
  mateIn3: "mate-in-3",
  mateIn4: "mate-in-4",
};

/** Translate an app theme key into one the puzzle store answers to. */
export function toStoreTheme(theme: string): string {
  return THEME_ALIASES[theme] ?? theme;
}

/** True when a set can be built for this theme at all. */
export function isThemeAvailable(theme: string): boolean {
  return !UNAVAILABLE_THEMES.has(theme);
}

/** Short, stable id for a generated set. */
export function makeSetId(theme: string, ply: number, now: number): string {
  return `${theme}-${ply}-${now.toString(36)}`;
}
