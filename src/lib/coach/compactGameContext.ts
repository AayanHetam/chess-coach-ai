/**
 * Compact game context for the fast (Haiku) follow-up path.
 *
 * Moved out of `app/api/enhanced-analysis/route.ts` by the Group C fix
 * (SILENT_SUBSTITUTION_HANDOFF §3). It lived in the route file, which meant it
 * could not be unit-tested: Next.js App Router route modules may only export
 * the known Route fields, so exporting a helper from one fails the production
 * build ("buildCompactGameContext is not a valid Route export field") even
 * though tsc and vitest are both perfectly happy. Pure function, no route
 * state — it belongs here.
 */
import {
  buildPgnFromMoves,
  uciToSan,
  type GameEvalInput,
} from "@/lib/contract/legacyGameContext";
import { fensAlongGame } from "@/lib/contract/chessFormat";
import { buildCurrentPositionFacts } from "@/lib/mastermind/positionFacts";
import { isComparableDepthPair, requestedDepth } from "@/lib/contract/evalDepth";
import { getLineWinPercentage } from "@/lib/engine/helpers/winPercentage";

/** A move that lost half a pawn or more by the engine's count. */
export interface WorstMove {
  /** Half-moves before it: the game's move at moveHistory[index]. */
  index: number;
  moveNum: number;
  color: "White" | "Black";
  moveSan: string;
  cpBefore: number;
  cpAfter: number;
  drop: number;
  bestSan?: string;
  /** Mate scores, spelled "M+3" where the stored list writes "M+". Read-time lists only. */
  mateBefore?: number;
  mateAfter?: number;
}

/** The heading of the player's worst-moves section, as the stored context writes it. */
export const TOP_MISTAKES_HEADING = "TOP MISTAKES (worst eval drops first, max 12)";

const formatCp = (cp: number, mate?: number): string => {
  // C6: null mate would print the literal string "Mnull".
  if (typeof mate === "number") return `M${mate > 0 ? "+" : ""}${mate}`;
  if (Math.abs(cp) >= 9000) return cp > 0 ? "M+" : "M-";
  return `${cp >= 0 ? "+" : ""}${(cp / 100).toFixed(2)}`;
};

/**
 * Every half-move as the compact context reads it: its narrative sentence,
 * and the drop when it lost half a pawn or more, for either side. One walk
 * along the game for the boards (fensAlongGame), where each ply used to
 * replay the game from the start.
 */
function readPlies(
  moveHistory: string[],
  gameEval: GameEvalInput | undefined
): { sentence: string; mistake: WorstMove | null }[] {
  const out: { sentence: string; mistake: WorstMove | null }[] = [];
  const fens = fensAlongGame(moveHistory);
  const declaredDepth = requestedDepth(gameEval);
  for (let i = 0; i < moveHistory.length; i++) {
    const moveSan = moveHistory[i];
    const moveNum = Math.floor(i / 2) + 1;
    const isWhite = i % 2 === 0;
    const colorWord = isWhite ? "White" : "Black";

    const evalBefore = gameEval?.positions?.[i];
    const evalAfter = gameEval?.positions?.[i + 1];

    // Stockfish's preferred move from the position before this one was played
    let bestSan: string | undefined;
    if (evalBefore?.bestMove && evalBefore.bestMove !== "N/A") {
      const fenBefore = fens[i];
      const candidate = uciToSan(fenBefore, evalBefore.bestMove);
      if (candidate && candidate !== moveSan) bestSan = candidate;
    }

    // Eval drop from the mover's perspective
    // Client timeout sentinels ({cp: 0, depth: 0}) are not real evals — skip
    // swing computation entirely so a stalled position can't narrate as a
    // fabricated blunder (or mask a real one) on the Haiku follow-up path.
    const compactSentinel =
      evalBefore?.lines?.[0]?.depth === 0 || evalAfter?.lines?.[0]?.depth === 0;
    // T8: the same refusal, for the quieter case. A position the engine had
    // to retry comes back 4 plies shallower and merges in looking exactly like
    // its neighbours, so the subtraction below would read the SEARCH's
    // disagreement with itself as the player's mistake. `moveClassification`
    // is computed from the same pairwise comparison client-side, so it is
    // suppressed alongside the drop rather than left to speak for it.
    const depthMismatch =
      !compactSentinel &&
      !isComparableDepthPair(evalBefore, evalAfter, declaredDepth);
    let drop = 0;
    let cpBefore: number | null = null;
    let cpAfter: number | null = null;
    if (evalBefore?.lines?.[0] && evalAfter?.lines?.[0] && !compactSentinel && !depthMismatch) {
      // C6: see selectInsights.flattenEval — null must not flatten to -9999.
      cpBefore = typeof evalBefore.lines[0].mate === "number"
        ? (evalBefore.lines[0].mate! > 0 ? 9999 : -9999)
        : (evalBefore.lines[0].cp ?? 0);
      cpAfter = typeof evalAfter.lines[0].mate === "number"
        ? (evalAfter.lines[0].mate! > 0 ? 9999 : -9999)
        : (evalAfter.lines[0].cp ?? 0);
      drop = isWhite ? (cpBefore - cpAfter) : (cpAfter - cpBefore);
    }

    // Pick a single label: severity for >50cp drops, otherwise the engine's
    // moveClassification field (book/good/excellent/etc.) when present.
    let label = "";
    if (drop >= 300) label = "BLUNDER";
    else if (drop >= 150) label = "MISTAKE";
    else if (drop >= 50) label = "INACCURACY";
    // C2 (SILENT_SUBSTITUTION_HANDOFF): `compactSentinel` forces `drop = 0`,
    // which means the three severity branches above can never match and control
    // ALWAYS lands here for a timed-out ply — so the guard that was meant to
    // stop a stalled position narrating as a fabricated blunder was in fact
    // guaranteeing it kept its client-supplied label. Suppress the label too.
    else if (!compactSentinel && !depthMismatch && evalAfter?.moveClassification) label = evalAfter.moveClassification;

    // Build the sentence
    let sentence = `Move ${moveNum} (${colorWord}): ${moveSan}`;
    if (label) sentence += ` — ${label}`;

    if (drop >= 50 && cpBefore !== null && cpAfter !== null) {
      // For mistakes, narrate the eval swing
      const beforeStr = formatCp(cpBefore, evalBefore?.lines?.[0]?.mate);
      const afterStr = formatCp(cpAfter, evalAfter?.lines?.[0]?.mate);
      sentence += `; eval ${beforeStr} → ${afterStr} (lost ${(drop / 100).toFixed(1)} pawns)`;
    } else if (evalAfter?.lines?.[0] && evalAfter.lines[0].depth !== 0) {
      // For routine moves, just the resulting eval (skip timeout sentinels —
      // a fabricated "eval +0.00" is worse than saying nothing)
      const afterStr = formatCp(evalAfter.lines[0].cp ?? 0, evalAfter.lines[0].mate);
      sentence += `${label ? ";" : " —"} eval ${afterStr}`;
    }

    if (bestSan) {
      sentence += `. Stockfish preferred ${bestSan}.`;
    } else {
      sentence += ".";
    }

    out.push({
      sentence,
      mistake:
        drop >= 50 && cpBefore !== null && cpAfter !== null
          ? { index: i, moveNum, color: colorWord, moveSan, cpBefore, cpAfter, drop, bestSan }
          : null,
    });
  }
  return out;
}

/**
 * One side's worst moves, worst first (ties in game order), at most 12.
 * Empty without an evaluation or when the side lost less than half a pawn
 * on every move.
 */
function topWorstMoves(
  plies: { mistake: WorstMove | null }[],
  color: "w" | "b"
): WorstMove[] {
  const name = color === "w" ? "White" : "Black";
  return plies
    .map((p) => p.mistake)
    .filter((m): m is WorstMove => m !== null && m.color === name)
    .sort((a, b) => b.drop - a.drop)
    .slice(0, 12);
}

function renderWorstMoves(top: WorstMove[], heading: string): string {
  const mistakeLines = top.map((m) => {
    const severity = m.drop >= 300 ? "BLUNDER" : m.drop >= 150 ? "MISTAKE" : "INACCURACY";
    const before = formatCp(m.cpBefore, m.mateBefore);
    const after = formatCp(m.cpAfter, m.mateAfter);
    const lost = (m.drop / 100).toFixed(1);
    const best = m.bestSan ? `; Stockfish preferred ${m.bestSan}` : "";
    return `- Move ${m.moveNum} (${m.color}): ${m.moveSan} [${severity}] — eval ${before} → ${after} (lost ${lost} pawns)${best}`;
  });
  return `## ${heading}\n${mistakeLines.join("\n")}`;
}

/** One side's costliest moves, read at serve time (sideMoments). */
export interface SideMoments {
  /** Costliest first by the mover's winning chances, at most 12. */
  moments: (WorstMove & { winDrop: number })[];
  /** The side's moves the engine scored at comparable depth on both sides. */
  scored: number;
  /** The side's moves in the game, up to the first one that could not be replayed. */
  played: number;
}

/**
 * One side's costliest moves, for a follow-up turn about that side
 * (questionPerspective.ts). Read at serve time from the stored game and its
 * evaluation, so it can be stricter than the stored player's list, which
 * stays byte for byte: a line with no score is no reading (selectInsights'
 * flattenEval) where the stored list reads 0, mates keep their distance,
 * the walk stops at the first move it could not replay (a game set up from
 * a position has none), a move made with the game already decided (the
 * mover under 10% or over 90% by the engine's winning chances) is left
 * out, and the rest are ranked by the winning chances lost, so walking into
 * mate from +9 is never the side's key moment.
 */
export function sideMoments(
  moveHistory: string[],
  gameEval: GameEvalInput | undefined,
  color: "w" | "b"
): SideMoments {
  const result: SideMoments = { moments: [], scored: 0, played: 0 };
  if (!moveHistory || moveHistory.length === 0) return result;
  const fens = fensAlongGame(moveHistory);
  const declaredDepth = requestedDepth(gameEval);
  type Line = { cp?: number | null; mate?: number | null; depth?: number };
  const flat = (l: Line): number | null =>
    typeof l.mate === "number"
      ? l.mate > 0
        ? 9999
        : -9999
      : typeof l.cp === "number"
        ? l.cp
        : null;
  const whiteWin = (l: Line): number | null => {
    try {
      return typeof l.mate === "number"
        ? getLineWinPercentage({ mate: l.mate } as never)
        : typeof l.cp === "number"
          ? getLineWinPercentage({ cp: l.cp } as never)
          : null;
    } catch {
      return null;
    }
  };
  for (let i = 0; i < moveHistory.length; i++) {
    if (fens[i + 1] === fens[i]) break;
    const isWhite = i % 2 === 0;
    if ((isWhite ? "w" : "b") !== color) continue;
    result.played += 1;
    const posBefore = gameEval?.positions?.[i];
    const posAfter = gameEval?.positions?.[i + 1];
    const before = posBefore?.lines?.[0] as Line | undefined;
    const after = posAfter?.lines?.[0] as Line | undefined;
    if (!before || !after || before.depth === 0 || after.depth === 0) continue;
    if (!isComparableDepthPair(posBefore, posAfter, declaredDepth)) continue;
    const cpBefore = flat(before);
    const cpAfter = flat(after);
    const wBefore = whiteWin(before);
    const wAfter = whiteWin(after);
    if (
      cpBefore === null ||
      cpAfter === null ||
      wBefore === null ||
      wAfter === null
    )
      continue;
    result.scored += 1;
    const drop = isWhite ? cpBefore - cpAfter : cpAfter - cpBefore;
    if (drop < 50) continue;
    const winBefore = isWhite ? wBefore : 100 - wBefore;
    const winAfter = isWhite ? wAfter : 100 - wAfter;
    if (winBefore < 10 || winAfter > 90) continue;
    let bestSan: string | undefined;
    if (posBefore?.bestMove && posBefore.bestMove !== "N/A") {
      const candidate = uciToSan(fens[i], posBefore.bestMove);
      if (candidate && candidate !== moveHistory[i]) bestSan = candidate;
    }
    result.moments.push({
      index: i,
      moveNum: Math.floor(i / 2) + 1,
      color: isWhite ? "White" : "Black",
      moveSan: moveHistory[i],
      cpBefore,
      cpAfter,
      drop,
      bestSan,
      ...(typeof before.mate === "number" ? { mateBefore: before.mate } : {}),
      ...(typeof after.mate === "number" ? { mateAfter: after.mate } : {}),
      winDrop: winBefore - winAfter,
    });
  }
  result.moments.sort((a, b) => b.winDrop - a.winDrop || a.index - b.index);
  result.moments = result.moments.slice(0, 12);
  return result;
}

/** A side's moments as a worst-moves section under the caller's heading; null when there are none. */
export function sideMomentsSection(
  moments: SideMoments,
  heading: string
): string | null {
  return moments.moments.length > 0
    ? renderWorstMoves(moments.moments, heading)
    : null;
}

/**
 * Compact game context used on follow-up chat turns.
 *
 * Cheaper than `buildGameContext` (no per-move FEN, no full PV trees, no motifs)
 * but rich enough that the LLM can ground answers like "why was move 6 a
 * mistake?" or "what was my first error?" in real moves and evals.
 *
 * Each half-move gets one prose sentence so the LLM can quote pre-narrated
 * facts rather than synthesize them — the synthesis step is where hallucination
 * crept in (e.g., inventing "13. Bh7+" when there was no move list at all).
 *
 * Sections:
 *   - MOVES PLAYED (PGN)
 *   - MOVE-BY-MOVE NARRATIVE  (one sentence per half-move)
 *   - TOP MISTAKES            (eval drops >= 0.5 pawns, sorted, capped)
 */
export function buildCompactGameContext(
  moveHistory: string[],
  gameEval: GameEvalInput | undefined,
  playerColor: string
): string {
  if (!moveHistory || moveHistory.length === 0) return "";

  const sections: string[] = [];

  sections.push(`## MOVES PLAYED (PGN)\n${buildPgnFromMoves(moveHistory)}`);

  const plies = readPlies(moveHistory, gameEval);
  const evalSentences = plies.map((p) => p.sentence);

  sections.push(`## MOVE-BY-MOVE NARRATIVE\n(One sentence per half-move. Eval is in pawns from White's perspective. Quote these sentences directly when asked about specific moves — do not paraphrase or invent.)\n${evalSentences.join("\n")}`);

  // Mirror buildGameContext: filter to the user's color so opponent blunders
  // don't leak into TOP MISTAKES and contradict the player-perspective rule.
  const userMistakes = topWorstMoves(plies, playerColor === "w" ? "w" : "b");
  if (userMistakes.length > 0) {
    sections.push(renderWorstMoves(userMistakes, TOP_MISTAKES_HEADING));
  }

  sections.push(`Player is ${playerColor === "w" ? "White" : "Black"}.`);

  // Position-fact grounding (2026-06-13): prepend the CURRENT POSITION board so
  // the fast (Haiku) follow-up tier reads the board instead of reconstructing it
  // from the PGN — measured +1.5 factual accuracy. See positionFacts.ts /
  // POSITION_FACT_GROUNDING_PLAN.md.
  const positionFacts = buildCurrentPositionFacts(moveHistory, gameEval);
  if (positionFacts) sections.unshift(positionFacts);

  return sections.join("\n\n");
}
