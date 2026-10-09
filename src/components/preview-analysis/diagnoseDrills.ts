/**
 * The drill set under a graded answer to the diagnosing question (pathway
 * 4.7): what the link offers, and the feed's top-up when the game has
 * fewer than three puzzles of the cause.
 *
 * The set goes to /puzzles through the practice queue, the path
 * `launchPuzzleSet` takes, until pathway 5.3 brings it onto the board.
 */
import { toPuzzleContexts } from "@/lib/analysis/puzzleHandoff";
import {
  DRILL_SET_SIZE,
  causeFeedThemes,
  drillLinkLabel,
  drillSetFor,
  type GameDrill,
} from "@/lib/diagnose/drillSet";
import type { DiagnoseCause } from "@/lib/diagnose/gradeAnswer";
import type { PuzzleContext } from "@/lib/validation/puzzleChatSchemas";

/** What the link under a graded reply offers: the game's own puzzles of the cause. */
export interface DrillOffer {
  cause: DiagnoseCause;
  /** The move the question was asked about, left out of the set. */
  excludePly: number;
  label: string;
  /** The game's puzzles, at most DRILL_SET_SIZE, in game order. */
  puzzles: PuzzleContext[];
}

/** The offer for the cause, from the game's drills, without the move asked about. */
export function drillOffer(
  drills: readonly GameDrill[],
  cause: DiagnoseCause,
  excludePly: number
): DrillOffer {
  const { fromGame } = drillSetFor(drills, cause, { excludePly });
  return {
    cause,
    excludePly,
    label: drillLinkLabel(fromGame.length),
    puzzles: fromGame.map((d) => d.puzzle),
  };
}

/** How many the feed must add to make a set. */
export function topUpCount(offer: DrillOffer): number {
  return Math.max(0, DRILL_SET_SIZE - offer.puzzles.length);
}

/** A puzzle as /api/puzzle-feed returns it. */
interface FeedRow {
  id?: unknown;
  fen?: unknown;
  solution?: unknown;
  rating?: unknown;
  themes?: unknown;
}

const clampRating = (r: number) => Math.min(3000, Math.max(400, Math.round(r)));

/**
 * Up to `n` puzzles of the cause's themes from the static feed, within 200
 * of the reader's rating, none of `excludeIds`. Empty on any failure.
 */
export async function fetchCauseTopUp(
  cause: DiagnoseCause,
  rating: number,
  n: number,
  excludeIds: string[]
): Promise<PuzzleContext[]> {
  if (n <= 0) return [];
  try {
    const r = Number.isFinite(rating) ? rating : 1500;
    const res = await fetch("/api/puzzle-feed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        themes: causeFeedThemes(cause),
        ratingMin: clampRating(r - 200),
        ratingMax: clampRating(r + 200),
        excludeIds: excludeIds.slice(0, 200),
        limit: n,
        randomize: true,
      }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { puzzles?: unknown };
    const rows = Array.isArray(data.puzzles) ? (data.puzzles as FeedRow[]) : [];
    const mapped = toPuzzleContexts(
      rows.map((p) => ({
        puzzleId: typeof p.id === "string" ? p.id : "",
        fen: typeof p.fen === "string" ? p.fen : "",
        moves: Array.isArray(p.solution) ? p.solution.join(" ") : "",
        rating: typeof p.rating === "number" ? p.rating : undefined,
        themes: Array.isArray(p.themes)
          ? p.themes.filter((t): t is string => typeof t === "string")
          : [],
      }))
    );
    return mapped.filter((p) => !excludeIds.includes(p.id)).slice(0, n);
  } catch {
    return [];
  }
}
