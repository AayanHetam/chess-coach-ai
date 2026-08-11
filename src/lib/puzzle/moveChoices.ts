import { Chess } from "chess.js";

/**
 * Candidate moves for multiple-choice answer mode.
 *
 * The correct answer is the puzzle's solution move; the distractors are other
 * legal moves from the same position. That is sound for this corpus: a Lichess
 * puzzle is *defined* by a unique solving line, so every alternative is
 * inferior by construction. We do not ask an engine — and emphatically do not
 * ask a model — to invent plausible wrong moves, because a "distractor" that
 * happens to also be winning would teach the wrong lesson, and chess
 * correctness is non-negotiable here.
 *
 * Ordering is deterministic per position (see `seededShuffle`). That matters
 * more than it sounds: a non-deterministic shuffle would reorder the options
 * on every React re-render, so the answer would visibly jump around under the
 * user's finger. Same FEN in, same order out, always.
 */

export interface MoveChoice {
  /** SAN as chess.js renders it, e.g. "Qxd8+". Display + comparison key. */
  san: string;
  /** UCI, e.g. "h4d8". What the caller replays. */
  uci: string;
  isSolution: boolean;
}

/** FNV-1a. Small, dependency-free, and stable across runs and machines. */
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32 — deterministic PRNG seeded from the position. */
function seededShuffle<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // Fisher-Yates.
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Rank a distractor by how tempting it is, descending.
 *
 * Plausible wrong answers are the whole point — four options where three are
 * obviously silly is not a test of anything. Checks and captures are what a
 * improving player's eye jumps to, so they make the question worth asking.
 */
function temptation(san: string): number {
  let score = 0;
  if (san.includes("+")) score += 3;
  if (san.includes("x")) score += 2;
  // A piece move reads as more "candidate-like" than a quiet pawn push.
  if (/^[KQRBN]/.test(san)) score += 1;
  return score;
}

function toUci(m: { from: string; to: string; promotion?: string }): string {
  return `${m.from}${m.to}${m.promotion ?? ""}`;
}

/**
 * Build the choice list for a position.
 *
 * @param fen          Position the user is answering from (the student's
 *                     starting position, not the puzzle's anchor FEN).
 * @param solutionUci  The correct move in UCI.
 * @param count        Total options including the answer. Defaults to 4.
 * @returns Shuffled options, or `[]` when the position or solution is
 *          unusable — callers must treat empty as "choice mode unavailable"
 *          and fall back to the board rather than rendering a broken question.
 */
export function buildMoveChoices(
  fen: string,
  solutionUci: string,
  count = 4,
): MoveChoice[] {
  let game: Chess;
  try {
    game = new Chess(fen);
  } catch {
    return [];
  }

  const legal = game.moves({ verbose: true }) as Array<{
    from: string;
    to: string;
    promotion?: string;
    san: string;
  }>;
  if (legal.length === 0) return [];

  const solution = legal.find((m) => toUci(m) === solutionUci);
  // The solution must be legal here. If it isn't, the caller has the wrong
  // position and a multiple-choice question would have no right answer —
  // fail closed rather than silently offering four wrong options.
  if (!solution) return [];

  const distractors = legal
    .filter((m) => toUci(m) !== solutionUci)
    .sort((a, b) => {
      const d = temptation(b.san) - temptation(a.san);
      // SAN tiebreak keeps the pick stable when scores tie, so the same
      // position always yields the same option set.
      return d !== 0 ? d : a.san.localeCompare(b.san);
    })
    .slice(0, Math.max(0, count - 1));

  const options: MoveChoice[] = [
    { san: solution.san, uci: toUci(solution), isSolution: true },
    ...distractors.map((m) => ({
      san: m.san,
      uci: toUci(m),
      isSolution: false,
    })),
  ];

  return seededShuffle(options, hashString(fen));
}
