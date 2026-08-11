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
  getFenAtHalfMove,
  uciToSan,
  type GameEvalInput,
} from "@/lib/contract/legacyGameContext";
import { buildCurrentPositionFacts } from "@/lib/mastermind/positionFacts";

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

  const evalSentences: string[] = [];
  type Mistake = {
    moveNum: number;
    color: string;
    moveSan: string;
    cpBefore: number;
    cpAfter: number;
    drop: number;
    bestSan?: string;
  };
  const mistakes: Mistake[] = [];

  const formatCp = (cp: number, mate?: number): string => {
    // C6: null mate would print the literal string "Mnull".
    if (typeof mate === "number") return `M${mate > 0 ? "+" : ""}${mate}`;
    if (Math.abs(cp) >= 9000) return cp > 0 ? "M+" : "M-";
    return `${cp >= 0 ? "+" : ""}${(cp / 100).toFixed(2)}`;
  };

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
      const fenBefore = getFenAtHalfMove(moveHistory, i);
      const candidate = uciToSan(fenBefore, evalBefore.bestMove);
      if (candidate && candidate !== moveSan) bestSan = candidate;
    }

    // Eval drop from the player's perspective
    // Client timeout sentinels ({cp: 0, depth: 0}) are not real evals — skip
    // swing computation entirely so a stalled position can't narrate as a
    // fabricated blunder (or mask a real one) on the Haiku follow-up path.
    const compactSentinel =
      evalBefore?.lines?.[0]?.depth === 0 || evalAfter?.lines?.[0]?.depth === 0;
    let drop = 0;
    let cpBefore: number | null = null;
    let cpAfter: number | null = null;
    if (evalBefore?.lines?.[0] && evalAfter?.lines?.[0] && !compactSentinel) {
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
    else if (!compactSentinel && evalAfter?.moveClassification) label = evalAfter.moveClassification;

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

    evalSentences.push(sentence);

    if (drop >= 50 && cpBefore !== null && cpAfter !== null) {
      mistakes.push({
        moveNum,
        color: colorWord,
        moveSan,
        cpBefore,
        cpAfter,
        drop,
        bestSan,
      });
    }
  }

  sections.push(`## MOVE-BY-MOVE NARRATIVE\n(One sentence per half-move. Eval is in pawns from White's perspective. Quote these sentences directly when asked about specific moves — do not paraphrase or invent.)\n${evalSentences.join("\n")}`);

  // Mirror buildGameContext: filter to the user's color so opponent blunders
  // don't leak into TOP MISTAKES and contradict the player-perspective rule.
  const userColorName = playerColor === "w" ? "White" : "Black";
  const userMistakes = mistakes.filter((m) => m.color === userColorName);
  if (userMistakes.length > 0) {
    userMistakes.sort((a, b) => b.drop - a.drop);
    const top = userMistakes.slice(0, 12);
    const mistakeLines = top.map((m) => {
      const severity = m.drop >= 300 ? "BLUNDER" : m.drop >= 150 ? "MISTAKE" : "INACCURACY";
      const before = formatCp(m.cpBefore);
      const after = formatCp(m.cpAfter);
      const lost = (m.drop / 100).toFixed(1);
      const best = m.bestSan ? `; Stockfish preferred ${m.bestSan}` : "";
      return `- Move ${m.moveNum} (${m.color}): ${m.moveSan} [${severity}] — eval ${before} → ${after} (lost ${lost} pawns)${best}`;
    });
    sections.push(`## TOP MISTAKES (worst eval drops first, max 12)\n${mistakeLines.join("\n")}`);
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
