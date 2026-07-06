/**
 * Legacy game-context builder — moved VERBATIM from
 * src/app/api/enhanced-analysis/route.ts (PR-CI-1, commit 1).
 *
 * WHY THE MOVE (deviation from the "export keyword only" plan): Next.js 15
 * type-checks app-route files against an allowlist of export fields
 * (GET/POST/config/...). Exporting buildGameContext directly from route.ts
 * fails `next build` with:
 *   'Route "src/app/api/enhanced-analysis/route.ts" does not match the
 *    required types of a Next.js Route. "buildGameContext" is not a valid
 *    Route export field.'
 * So the function and its private helpers are moved here unchanged and
 * re-imported by the route. Zero behavior change — the PR-CI-1 snapshot
 * suite in __tests__/ pins the output byte-for-byte.
 *
 * PR-CI-2..n note: this module is the seam the Contract Inversion program
 * refactors (CONTRACT_INVERSION_PLAN.md §7 PR-CI-1); commit 2 of PR-CI-1
 * re-plumbs buildGameContext to render from a typed CoachContract.
 */
import { Chess } from "chess.js";
import { annotatePosition, annotationToPromptContext } from "@/lib/positionAnnotator";
import { detectMotifs } from "@/lib/tactics";
import { queryChessdb } from "@/lib/grounding/chessdb";
import { compileVoterResult } from "@/lib/grounding/voter";
import { queryLc0, shouldCallLc0 } from "@/lib/grounding/lc0";
import { queryMaiaAtRating, shouldCallMaia } from "@/lib/grounding/maia";
import { buildRelationalFacts } from "@/lib/relational/relationalFactsBuilder";
import { detectConcepts } from "@/lib/concept/conceptDetector";
import { getConcept } from "@/lib/concept/conceptTaxonomy";
// Phase-2 GROUNDED TEACHING SPINE (principle 8): pure-synchronous chess.js
// helpers (no async/engine) — safe to call inside buildGameContext's top3 loop.
import { compute_feature_delta } from "@/lib/mastermind/featureDelta";
import { buildThreatTree } from "@/lib/mastermind/threatTree";

export interface PositionEvalInput {
  bestMove?: string;
  moveClassification?: string;
  opening?: string;
  lines: Array<{
    pv: string[];
    cp?: number;
    mate?: number;
    depth: number;
    multiPv: number;
  }>;
}

export interface GameEvalInput {
  positions: PositionEvalInput[];
  accuracy?: { white: number; black: number };
  estimatedElo?: { white: number; black: number };
  settings?: { engine: string; depth: number; multiPv: number; date: string };
}

/**
 * Convert a full PV line (array of UCI moves) to SAN notation by replaying each move.
 */
export function convertPvToSan(fen: string, pvUci: string[]): string[] {
  const result: string[] = [];
  try {
    const g = new Chess(fen);
    for (const uci of pvUci) {
      const from = uci.slice(0, 2);
      const to = uci.slice(2, 4);
      const promotion = uci.length > 4 ? uci.slice(4) : undefined;
      const moveResult = g.move({ from, to, promotion });
      if (!moveResult) break;
      result.push(moveResult.san);
    }
  } catch {
    // Return what we have so far
  }
  return result;
}

/**
 * Format a SAN PV array as a numbered move list: "14. Qe2 Nxe5 15. Nxe5 d6"
 */
function formatPvAsMoveList(pvSan: string[], startMoveNum: number, startsAsWhite: boolean): string {
  const parts: string[] = [];
  let moveNum = startMoveNum;
  let isWhite = startsAsWhite;

  for (const san of pvSan) {
    if (isWhite) {
      parts.push(`${moveNum}. ${san}`);
    } else {
      if (parts.length === 0) {
        parts.push(`${moveNum}... ${san}`);
      } else {
        parts.push(san);
      }
      moveNum++;
    }
    isWhite = !isWhite;
  }
  return parts.join(" ");
}

/**
 * Convert a UCI move string (e.g. "e2e4") to SAN notation using chess.js
 */
export function uciToSan(fen: string, uciMove: string): string {
  try {
    const tempGame = new Chess(fen);
    const from = uciMove.slice(0, 2);
    const to = uciMove.slice(2, 4);
    const promotion = uciMove.length > 4 ? uciMove.slice(4) : undefined;
    const result = tempGame.move({ from, to, promotion });
    return result ? result.san : uciMove;
  } catch {
    return uciMove;
  }
}

/**
 * Find the move index where two PV lines first diverge.
 * Returns 0 if they diverge immediately, or pvSan1.length if they're identical.
 */
function findBranchPoint(pv1: string[], pv2: string[]): number {
  let i = 0;
  while (i < Math.min(pv1.length, pv2.length) && pv1[i] === pv2[i]) i++;
  return i;
}

/**
 * Compute the candidate ranking gap between the best and second-best line.
 * A large gap signals a critical junction where the best move is uniquely powerful.
 */
function computeCandidateGap(lines: PositionEvalInput["lines"]): string {
  if (lines.length < 2) return "Only one candidate line available.";
  const line1 = lines[0];
  const line2 = lines[1];
  const eval1 = line1.mate !== undefined ? (line1.mate > 0 ? 9999 : -9999) : (line1.cp ?? 0);
  const eval2 = line2.mate !== undefined ? (line2.mate > 0 ? 9999 : -9999) : (line2.cp ?? 0);
  const gap = Math.abs(eval1 - eval2);
  const gapStr = (gap / 100).toFixed(2);
  const severity = gap >= 300 ? "CRITICAL JUNCTION" : gap >= 100 ? "IMPORTANT CHOICE" : "CLOSE ALTERNATIVES";
  return `${severity} — gap between #1 and #2 candidate: ${gapStr} pawns`;
}

/**
 * Generate a deterministic one-sentence explanation seed from the full PV.
 * Summarizes which pieces become active, captured, or threatened along the line.
 */
function buildExplanationSeed(fenBefore: string, pvSan: string[], moveNum: number, isWhiteMove: boolean): string {
  if (pvSan.length === 0) return "";
  try {
    const game = new Chess(fenBefore);
    const captures: string[] = [];
    const checks: string[] = [];
    let lastMoveNum = moveNum;
    let isWhite = isWhiteMove;

    for (const san of pvSan.slice(0, Math.min(pvSan.length, 10))) {
      const moveObj = game.move(san);
      if (!moveObj) break;
      const moveLabel = isWhite ? `${lastMoveNum}.` : `${lastMoveNum}...`;
      if (moveObj.captured) {
        const pieceNames: Record<string, string> = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen" };
        captures.push(`${moveLabel} ${san} wins the ${pieceNames[moveObj.captured] || moveObj.captured}`);
      }
      if (game.inCheck()) checks.push(`${moveLabel} ${san} gives check`);
      if (!isWhite) lastMoveNum++;
      isWhite = !isWhite;
    }

    const parts: string[] = [];
    if (captures.length > 0) parts.push(captures.slice(0, 2).join(", then "));
    if (checks.length > 0 && !captures.some(c => checks[0].includes(c.split(" ")[1]))) {
      parts.push(checks[0]);
    }
    if (parts.length === 0) return `The line runs ${pvSan.slice(0, 5).join(" ")} — a positional sequence building long-term advantage.`;
    return `The key idea: ${parts.join("; ")}.`;
  } catch {
    return "";
  }
}

/**
 * Describe what changed between two FEN positions in plain language.
 * Reduces LLM hallucination by grounding it in concrete board-state changes.
 */
function describeMoveChange(fenBefore: string, moveSan: string): string {
  try {
    const g = new Chess(fenBefore);
    const moveObj = g.move(moveSan);
    if (!moveObj) return "";

    const parts: string[] = [];
    const pieceName: Record<string, string> = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
    const color = moveObj.color === "w" ? "White" : "Black";
    const piece = pieceName[moveObj.piece] || moveObj.piece;

    if (moveObj.flags.includes("k")) {
      parts.push(`${color} castled kingside`);
    } else if (moveObj.flags.includes("q")) {
      parts.push(`${color} castled queenside`);
    } else {
      parts.push(`${color} ${piece} moved from ${moveObj.from} to ${moveObj.to}`);
    }

    if (moveObj.captured) {
      const capturedPiece = pieceName[moveObj.captured] || moveObj.captured;
      parts.push(`capturing ${capturedPiece} on ${moveObj.to}`);
    }

    if (moveObj.promotion) {
      const promoPiece = pieceName[moveObj.promotion] || moveObj.promotion;
      parts.push(`promoted to ${promoPiece}`);
    }

    if (g.isCheck()) {
      parts.push("giving check");
    }

    if (g.isCheckmate()) {
      parts.push("CHECKMATE");
    }

    return parts.join(", ");
  } catch {
    return "";
  }
}

/**
 * Optional PGN-header metadata threaded from the client. Mirrors the chess.js
 * `game.header()` shape but typed loose since users import games from
 * everywhere (lichess, chess.com, raw pastes) and the headers vary.
 */
export type GameHeadersInput = {
  white?: string;
  black?: string;
  whiteElo?: string;
  blackElo?: string;
  event?: string;
  date?: string;
  result?: string;
  eco?: string;
  opening?: string;
  timeControl?: string;
};

/**
 * Phase-2 GROUNDED TEACHING SPINE (principle 8). For a single critical
 * position, render the top 1-2 non-empty concept-DELTAS the move changed plus
 * the enumerated opponent checks/captures/threats, so the LLM's "why" is
 * anchored to verified facts rather than synthesized. Pure-synchronous
 * (chess.js only). Returns "" when there is nothing grounded to say — callers
 * append nothing in that case. Callers wrap this in try/catch: both helpers
 * call `new Chess(fen)` and can throw InvalidFenError on edge FENs.
 *
 * Deliberately terse: emit only the dominant deltas + ≤3 threats, never the
 * full PositionFeatureDelta/ThreatNode trees (token-bloat / latency guard).
 */
function buildTeachingSpine(
  fenBefore: string,
  fenAfter: string,
  bestPvUci: string[]
): string {
  const lines: string[] = [];

  // --- Concept DELTA: what the move actually changed ---
  const delta = compute_feature_delta(fenBefore, fenAfter, { pv: bestPvUci });
  if (!delta.isEmptyDelta) {
    const deltaBits: string[] = [];

    // Material swing (the most teachable single fact).
    const matW = delta.materialDelta.white;
    const matB = delta.materialDelta.black;
    if (matW !== 0 || matB !== 0) {
      const net = matB - matW; // >0 means Black gained relative to White
      const side = net > 0 ? "Black" : "White";
      deltaBits.push(
        `material swung ~${Math.abs(net)} point(s) toward ${side}`
      );
    }

    // Pieces left hanging by the move (board-vision failures).
    const hung = delta.hangingPiecesDelta.newlyHanging;
    if (hung.length) {
      deltaBits.push(
        `now hanging: ${hung
          .slice(0, 2)
          .map((h) => `${h.color} ${h.piece} on ${h.square}`)
          .join(", ")}`
      );
    }

    // New threats the move conceded.
    const newThreats = delta.threatsDelta.newThreats;
    if (newThreats.length) {
      deltaBits.push(
        `new threat(s): ${newThreats
          .slice(0, 2)
          .map((t) => t.description)
          .join("; ")}`
      );
    }

    // King-safety degradation.
    const ksW = delta.kingSafetyDelta.white;
    const ksB = delta.kingSafetyDelta.black;
    if (ksW < 0 || ksB < 0) {
      const worse = ksW < ksB ? "White" : "Black";
      deltaBits.push(`${worse}'s king safety dropped`);
    }

    // A piece the move trapped.
    const trapped = delta.pieceActivityDelta.newlyTrapped;
    if (trapped.length) {
      deltaBits.push(
        `newly trapped: ${trapped
          .slice(0, 1)
          .map((p) => `${p.color} ${p.piece} on ${p.square}`)
          .join(", ")}`
      );
    }

    // Top 1-2 dominant sub-deltas only — do not dump everything.
    if (deltaBits.length) {
      lines.push(`CONCEPT DELTA (what the move changed): ${deltaBits.slice(0, 2).join(" | ")}`);
    }
  }

  // --- Opponent threats to COUNT (principle 6, 800-1200 band; principle 8) ---
  const threats = buildThreatTree(fenBefore, 2);
  if (threats.length) {
    const threatBits = threats.slice(0, 3).map((t) => {
      const tag = t.isMate ? "MATE" : t.isCheck ? "check" : `wins ~${Math.round(t.approxMaterialGainCp / 100)}p`;
      return `${t.threatSan} (${tag})`;
    });
    lines.push(`OPPONENT THREATS TO COUNT: ${threatBits.join(", ")}`);
  }

  return lines.join("\n");
}

/**
 * Build a rich move-by-move game context string from the move history + Stockfish evals.
 * This gives the LLM everything it needs to analyze the game.
 */
export async function buildGameContext(
  moveHistory: string[],
  gameEval: GameEvalInput | undefined,
  playerColor: string,
  username?: string,
  userRating?: number,
  gameHeaders?: GameHeadersInput
): Promise<string> {
  const sections: string[] = [];

  // --- Game overview ---
  const totalHalfMoves = moveHistory.length;
  const totalFullMoves = Math.ceil(totalHalfMoves / 2);
  const game = new Chess();
  let replayedPlies = 0;
  for (const m of moveHistory) {
    try { game.move(m); replayedPlies++; } catch { break; }
  }
  // If a SAN failed to replay, `game` (and every FEN/eval derived from it
  // below) reflects only the moves BEFORE the break — silently analyzing the
  // wrong "final" position. Tell the model where the record stops instead of
  // letting it narrate a truncated board as complete (audit §3.6).
  const historyTruncated = replayedPlies < totalHalfMoves;

  let overview = `## GAME OVERVIEW\n`;
  if (historyTruncated) {
    overview += `- ⚠️ NOTE: the move record could not be fully replayed — analysis covers the first ${Math.ceil(replayedPlies / 2)} moves (ply ${replayedPlies} of ${totalHalfMoves}). Do NOT comment on moves after this point or describe this as the final position of a completed game.\n`;
  }
  overview += `- Total moves: ${totalFullMoves} full moves (${totalHalfMoves} half-moves)\n`;
  overview += `- Result: ${game.isCheckmate() ? "Checkmate" : game.isStalemate() ? "Stalemate" : game.isDraw() ? "Draw" : "In progress"}\n`;
  if (username) overview += `- Player: ${username} playing as ${playerColor === "w" ? "White" : "Black"}\n`;
  if (userRating) overview += `- Player rating: ${userRating}\n`;
  if (gameEval?.accuracy) overview += `- Accuracy: White ${gameEval.accuracy.white.toFixed(1)}%, Black ${gameEval.accuracy.black.toFixed(1)}%\n`;
  if (gameEval?.estimatedElo) overview += `- Estimated Elo: White ~${gameEval.estimatedElo.white}, Black ~${gameEval.estimatedElo.black}\n`;
  // PGN headers — only emit lines for fields actually present. Chess.com /
  // lichess imports populate most of these; raw FEN-loaded games populate
  // none. The coach uses them to ground references like "your opponent's
  // rapid rating" or "this Najdorf was played in last year's Tata Steel".
  if (gameHeaders) {
    const h = gameHeaders;
    if (h.white) overview += `- White: ${h.white}${h.whiteElo ? ` (${h.whiteElo})` : ""}\n`;
    if (h.black) overview += `- Black: ${h.black}${h.blackElo ? ` (${h.blackElo})` : ""}\n`;
    if (h.event) overview += `- Event: ${h.event}\n`;
    if (h.date) overview += `- Date: ${h.date}\n`;
    if (h.timeControl) overview += `- Time control: ${h.timeControl}\n`;
    if (h.opening || h.eco) {
      const parts = [h.opening, h.eco ? `ECO ${h.eco}` : null].filter(Boolean);
      overview += `- Opening: ${parts.join(", ")}\n`;
    }
    if (h.result && h.result !== "*") overview += `- PGN result tag: ${h.result}\n`;
  }
  sections.push(overview);

  // --- PGN ---
  const pgn = buildPgnFromMoves(moveHistory);
  sections.push(`## PGN\n${pgn}`);

  // --- Move-by-move with Stockfish evaluations ---
  if (gameEval?.positions && gameEval.positions.length > 0) {
    const moveLines: string[] = [];
    // Position[0] is the starting position (before any moves)
    // Position[i] is the position AFTER half-move i was played
    // So position[0] = start, position[1] = after move 1 white, position[2] = after move 1 black, etc.

    const mistakes: Array<{
      halfMoveIdx: number;
      moveNum: number;
      color: string;
      moveSan: string;
      evalBefore: number;
      evalAfter: number;
      drop: number;
      bestMove: string;
      classification?: string;
      fenBefore: string;
      fenAfter: string;
    }> = [];

    for (let i = 0; i < moveHistory.length; i++) {
      const moveSan = moveHistory[i];
      const moveNum = Math.floor(i / 2) + 1;
      const color = i % 2 === 0 ? "White" : "Black";
      const moveLabel = i % 2 === 0 ? `${moveNum}.` : `${moveNum}...`;

      // Compute FEN before and after this move
      const fenBefore = getFenAtHalfMove(moveHistory, i);
      const fenAfter = getFenAtHalfMove(moveHistory, i + 1);
      const moveDescription = describeMoveChange(fenBefore, moveSan);

      // Eval BEFORE this move = positions[i], eval AFTER = positions[i+1]
      const evalBefore = gameEval.positions[i];
      const evalAfter = gameEval.positions[i + 1];

      let line = `${moveLabel} ${moveSan} (${color})`;

      // Plain-language description of what changed
      if (moveDescription) {
        line += ` | ${moveDescription}`;
      }

      // Before/after FEN for grounding
      line += `\n    FEN before: ${fenBefore}`;
      line += `\n    FEN after:  ${fenAfter}`;

      // Classification
      const classification = evalAfter?.moveClassification;
      if (classification) {
        line += `\n    Classification: ${classification.toUpperCase()}`;
      }

      // Evaluation after
      if (evalAfter?.lines?.[0]) {
        const topLine = evalAfter.lines[0];
        if (topLine.depth === 0) {
          // Client-side timeout sentinel ({cp: 0, depth: 0}) — NOT a real 0.00.
          // Narrating it as an eval fabricates a massive swing in decided games.
          line += `\n    Eval: engine data unavailable for this move (analysis timed out)`;
        } else if (topLine.mate !== undefined) {
          line += `\n    Eval: M${topLine.mate > 0 ? "+" : ""}${topLine.mate}`;
        } else if (topLine.cp !== undefined) {
          const pawns = (topLine.cp / 100).toFixed(2);
          line += `\n    Eval: ${topLine.cp >= 0 ? "+" : ""}${pawns}`;
        }
      }

      // Best move from the position BEFORE this move was played — with full engine line
      if (evalBefore?.bestMove && evalBefore.bestMove !== "N/A") {
        const bestSan = uciToSan(fenBefore, evalBefore.bestMove);
        if (bestSan !== moveSan) {
          const bestLine = evalBefore.lines?.[0];
          if (bestLine?.pv && bestLine.pv.length > 0) {
            const pvSan = convertPvToSan(fenBefore, bestLine.pv);
            const pvEvalStr = bestLine.mate !== undefined
              ? `M${bestLine.mate > 0 ? "+" : ""}${bestLine.mate}`
              : bestLine.cp !== undefined ? `${bestLine.cp >= 0 ? "+" : ""}${(bestLine.cp / 100).toFixed(2)}` : "";
            const fullPvLine = formatPvAsMoveList(pvSan, moveNum, i % 2 === 0);
            line += `\n    Best was: ${bestSan} (${pvEvalStr}, depth ${bestLine.depth}) — Engine line: ${fullPvLine}`;
          } else {
            line += `\n    Best was: ${bestSan}`;
          }
        }
      }

      moveLines.push(line);

      // Detect mistakes (evaluation drops)
      // Skip positions carrying the client timeout sentinel ({cp: 0, depth: 0})
      // — comparing a real eval against a fabricated 0.00 manufactures a fake
      // "blunder" (or hides a real one) in the TOP MISTAKES the coach narrates.
      const beforeIsSentinel = evalBefore?.lines?.[0]?.depth === 0;
      const afterIsSentinel = evalAfter?.lines?.[0]?.depth === 0;
      if (evalBefore?.lines?.[0] && evalAfter?.lines?.[0] && !beforeIsSentinel && !afterIsSentinel) {
        const cpBefore = evalBefore.lines[0].mate !== undefined
          ? (evalBefore.lines[0].mate! > 0 ? 9999 : -9999)
          : (evalBefore.lines[0].cp ?? 0);
        const cpAfter = evalAfter.lines[0].mate !== undefined
          ? (evalAfter.lines[0].mate! > 0 ? 9999 : -9999)
          : (evalAfter.lines[0].cp ?? 0);

        // Calculate eval drop from the player's perspective
        // Positive cp = good for White. For White moves, a drop is cpAfter < cpBefore. For Black, it's cpAfter > cpBefore.
        let drop = 0;
        if (i % 2 === 0) {
          // White's move — a drop for White means cpAfter < cpBefore
          drop = cpBefore - cpAfter;
        } else {
          // Black's move — a drop for Black means cpAfter > cpBefore (position got better for White = worse for Black)
          drop = cpAfter - cpBefore;
        }

        if (drop > 50) { // More than 0.5 pawn drop
          const bestSan = evalBefore.bestMove
            ? uciToSan(fenBefore, evalBefore.bestMove)
            : "N/A";

          mistakes.push({
            halfMoveIdx: i,
            moveNum,
            color,
            moveSan,
            evalBefore: cpBefore,
            evalAfter: cpAfter,
            drop,
            bestMove: bestSan,
            classification: classification || undefined,
            fenBefore,
            fenAfter,
          });
        }
      }
    }

    sections.push(`## MOVE-BY-MOVE ANALYSIS (with Stockfish evaluations)\nAll evals are in pawns from White's perspective (positive = better for White); M+n / M-n = forced mate for White / Black.\n${moveLines.join("\n")}`);

    // --- Top mistakes with full PV lines and candidate moves ---
    // System prompt says ONLY analyse the player's mistakes. The mistakes
    // array contains both colors, so filter to the user's color before
    // ranking. Without this filter, opponent blunders leak into TOP
    // MISTAKES and contradict the player-perspective rule.
    const userColorName = playerColor === "w" ? "White" : "Black";
    const userMistakes = mistakes.filter((m) => m.color === userColorName);
    if (userMistakes.length > 0) {
      userMistakes.sort((a, b) => b.drop - a.drop);
      const topMistakes = userMistakes.slice(0, 10);

      // Stage 6: pre-fetch chessdb results for all top mistakes in parallel
      // Stage 7: pre-fetch Lc0 results in parallel (only when trigger fires)
      // Stage 8: pre-fetch Maia per-rating visibility (only when userRating present)
      const [mistakeChessdbResults, mistakeLc0Results, mistakeMaiaResults] = await Promise.all([
        // Voter at compileVoterResult() below combines chessdb with motifs from
        // m.fenBefore + stockfish eval from evalBefore. Query chessdb on the
        // same pre-mistake FEN so all signals describe the same position.
        Promise.all(topMistakes.map((m) => queryChessdb(m.fenBefore).catch(() => null))),
        Promise.all(topMistakes.map((m) => {
          const evalBefore = gameEval!.positions[m.halfMoveIdx];
          const sfCp = evalBefore?.lines?.[0]?.cp ?? null;
          return shouldCallLc0(sfCp, evalBefore?.lines ?? [])
            ? queryLc0(m.fenBefore).catch(() => null)
            : Promise.resolve(null);
        })),
        Promise.all(topMistakes.map((m) => {
          const evalBefore = gameEval!.positions[m.halfMoveIdx];
          const bestUci = evalBefore?.lines?.[0]?.pv?.[0] ?? null;
          return shouldCallMaia(userRating, bestUci)
            ? queryMaiaAtRating(m.fenBefore, userRating!, bestUci!).catch(() => null)
            : Promise.resolve(null);
        })),
      ]);

      const mistakeLines = topMistakes.map((m, mi) => {
        const severity = m.drop >= 300 ? "BLUNDER" : m.drop >= 150 ? "MISTAKE" : m.drop >= 50 ? "INACCURACY" : "MINOR";
        const evalBeforeStr = Math.abs(m.evalBefore) >= 9000 ? (m.evalBefore > 0 ? "M+" : "M-") : (m.evalBefore / 100).toFixed(2);
        const evalAfterStr = Math.abs(m.evalAfter) >= 9000 ? (m.evalAfter > 0 ? "M+" : "M-") : (m.evalAfter / 100).toFixed(2);
        const changeDesc = describeMoveChange(m.fenBefore, m.moveSan);
        let line = `### Move ${m.moveNum} (${m.color}): ${m.moveSan} [${severity}]`;
        line += `\n  Eval: ${evalBeforeStr} → ${evalAfterStr} (lost ${(m.drop / 100).toFixed(1)} pawns)`;
        if (changeDesc) line += `\n  What happened: ${changeDesc}`;
        line += `\n  FEN before: ${m.fenBefore}`;

        // Include ALL candidate moves with evals and full PV lines from the position BEFORE this move
        const evalBefore = gameEval!.positions[m.halfMoveIdx];
        if (evalBefore?.lines && evalBefore.lines.length > 0) {
          // Stage 6+7+8: multi-source voter with Lc0 neural eval + Maia visibility
          const bestPvLine = evalBefore.lines[0];
          const bestPvSan = bestPvLine?.pv ? convertPvToSan(m.fenBefore, bestPvLine.pv) : [];
          const structuredMotifs = m.moveSan ? detectMotifs(m.fenBefore, m.moveSan) : [];
          const voterResult = compileVoterResult({
            motifs: structuredMotifs,
            chessdbResult: mistakeChessdbResults[mi],
            lc0Result: mistakeLc0Results[mi],
            maiaResult: mistakeMaiaResults[mi],
            bestMoveSan: bestPvSan[0] ?? null,
            stockfishEvalCp: evalBefore.lines[0]?.cp ?? null,
            stockfishBestMoveMate: evalBefore.lines[0]?.mate ?? null,
          });
          line += `\n  ${voterResult.groundingContext}`;

          // Candidate ranking gap
          const gapAnalysis = computeCandidateGap(evalBefore.lines);
          line += `\n  ${gapAnalysis}`;

          // Branch point between best line and played move line
          const playedPvLine = evalBefore.lines.find(l => {
            const first = l.pv?.[0] ? convertPvToSan(m.fenBefore, [l.pv[0]])[0] : undefined;
            return first === m.moveSan;
          });
          if (bestPvSan.length > 0 && playedPvLine?.pv) {
            const playedPvSan = convertPvToSan(m.fenBefore, playedPvLine.pv);
            const branchIdx = findBranchPoint(bestPvSan, playedPvSan);
            if (branchIdx < Math.min(bestPvSan.length, playedPvSan.length)) {
              const sharedLine = branchIdx > 0 ? `after ${bestPvSan.slice(0, branchIdx).join(" ")} — ` : "";
              line += `\n  BRANCH POINT: Lines diverge at move ${branchIdx + 1}. ${sharedLine}Best continues ${bestPvSan[branchIdx] ?? "?"}, played line goes ${playedPvSan[branchIdx] ?? "?"}`;
            }
          }

          line += `\n  CANDIDATE MOVES (from Stockfish, best first):`;
          for (const pvLine of evalBefore.lines) {
            if (!pvLine.pv || pvLine.pv.length === 0) continue;
            // Convert full PV from UCI to SAN
            const pvSan = convertPvToSan(m.fenBefore, pvLine.pv);
            const pvEval = pvLine.mate !== undefined
              ? `M${pvLine.mate > 0 ? "+" : ""}${pvLine.mate}`
              : pvLine.cp !== undefined ? `${pvLine.cp >= 0 ? "+" : ""}${(pvLine.cp / 100).toFixed(2)}` : "?";
            const firstMove = pvSan.length > 0 ? pvSan[0] : pvLine.pv[0];
            const isPlayed = firstMove === m.moveSan;
            const fullLine = formatPvAsMoveList(pvSan, m.moveNum, m.halfMoveIdx % 2 === 0);
            line += `\n    ${isPlayed ? "⮕ PLAYED" : "★ BETTER"}: ${firstMove} (${pvEval}) — Line: ${fullLine} (depth ${pvLine.depth})`;
          }
        }

        // What the best line leads to (explain the plan)
        line += `\n  Best move was: ${m.bestMove}`;

        return line;
      });

      sections.push(`## TOP MISTAKES (sorted by severity — ANALYZE EACH WITH FULL DEPTH)\n${mistakeLines.join("\n\n")}`);
    } else {
      sections.push(`## MISTAKES\nNo significant mistakes detected (all moves within 0.5 pawn of engine best).`);
    }
  } else {
    sections.push(`## NOTE: No Stockfish evaluation data available. The game has not been engine-analyzed yet. Analyze the position and moves based on general chess principles.`);
  }

  // --- Material balance at end ---
  sections.push(`## FINAL POSITION\nFEN: ${game.fen()}\n${getMaterialBalance(game)}`);

  // --- Structured position annotation for the final position ---
  try {
    const finalAnnotation = annotatePosition(game.fen());
    sections.push(annotationToPromptContext(finalAnnotation));
  } catch (e) {
    // Non-critical — skip if annotation fails
  }

  // --- Lever 1: relational facts for final position (anti-hallucination grounding) ---
  try {
    const finalFacts = buildRelationalFacts(game.fen());
    sections.push(
      `## VERIFIED POSITION FACTS — FINAL POSITION (chess.js oracle)\n${finalFacts.summary}`
    );
  } catch {
    // skip if FEN is invalid (e.g. no moves played yet)
  }

  // --- Chess Intelligence Layer: pre-computed structured context for critical positions ---
  // This gives GPT verified tactical tags, explanation seeds, and branch analysis
  // so it explains known truths rather than hallucinating chess ideas.
  if (gameEval?.positions) {
    const sortedMistakes: Array<{ halfMoveIdx: number; moveNum: number; color: string; moveSan: string; drop: number; fenBefore: string }> = [];

    for (let i = 0; i < moveHistory.length; i++) {
      const evalBefore = gameEval.positions[i];
      const evalAfter = gameEval.positions[i + 1];
      if (!evalBefore?.lines?.[0] || !evalAfter?.lines?.[0]) continue;

      const cpBefore = evalBefore.lines[0].mate !== undefined ? (evalBefore.lines[0].mate! > 0 ? 9999 : -9999) : (evalBefore.lines[0].cp ?? 0);
      const cpAfter = evalAfter.lines[0].mate !== undefined ? (evalAfter.lines[0].mate! > 0 ? 9999 : -9999) : (evalAfter.lines[0].cp ?? 0);
      const drop = i % 2 === 0 ? cpBefore - cpAfter : cpAfter - cpBefore;

      if (drop > 50) {
        sortedMistakes.push({
          halfMoveIdx: i,
          moveNum: Math.floor(i / 2) + 1,
          color: i % 2 === 0 ? "White" : "Black",
          moveSan: moveHistory[i],
          drop,
          fenBefore: getFenAtHalfMove(moveHistory, i),
        });
      }
    }

    sortedMistakes.sort((a, b) => b.drop - a.drop);
    const top3 = sortedMistakes.slice(0, 3);

    if (top3.length > 0) {
      const intelligenceLines: string[] = [];
      for (const m of top3) {
        const evalBefore = gameEval.positions[m.halfMoveIdx];
        if (!evalBefore?.lines?.[0]) continue;

        const bestPvSan = convertPvToSan(m.fenBefore, evalBefore.lines[0].pv ?? []);
        const motifs = m.moveSan ? detectMotifs(m.fenBefore, m.moveSan) : [];
        // Stage 6+7+8: all signals describe the same pre-mistake position.
        // Trigger Lc0 when SF is uncertain; trigger Maia when we have a user rating.
        const sfCpIntel = evalBefore.lines[0]?.cp ?? null;
        const bestUciIntel = evalBefore.lines[0]?.pv?.[0] ?? null;
        const [cdbResult, lc0IntelResult, maiaIntelResult] = await Promise.all([
          queryChessdb(m.fenBefore).catch(() => null),
          shouldCallLc0(sfCpIntel, evalBefore.lines) ? queryLc0(m.fenBefore).catch(() => null) : Promise.resolve(null),
          shouldCallMaia(userRating, bestUciIntel)
            ? queryMaiaAtRating(m.fenBefore, userRating!, bestUciIntel!).catch(() => null)
            : Promise.resolve(null),
        ]);
        const voterIntel = compileVoterResult({
          motifs,
          chessdbResult: cdbResult,
          lc0Result: lc0IntelResult,
          maiaResult: maiaIntelResult,
          bestMoveSan: bestPvSan[0] ?? null,
          stockfishEvalCp: sfCpIntel,
          stockfishBestMoveMate: evalBefore.lines[0]?.mate ?? null,
        });
        const gapAnalysis = computeCandidateGap(evalBefore.lines);
        const explanationSeed = buildExplanationSeed(m.fenBefore, bestPvSan, m.moveNum, m.halfMoveIdx % 2 === 0);
        const severity = m.drop >= 300 ? "BLUNDER" : m.drop >= 150 ? "MISTAKE" : "INACCURACY";

        let block = `### CRITICAL POSITION: Move ${m.moveNum} (${m.color} — ${severity})\n`;
        block += `${voterIntel.groundingContext}\n`;
        block += `CANDIDATE RANKING: ${gapAnalysis}\n`;

        // Branch point between best and 2nd candidate
        if (evalBefore.lines.length >= 2 && bestPvSan.length > 0) {
          const pv2San = convertPvToSan(m.fenBefore, evalBefore.lines[1].pv ?? []);
          const branchIdx = findBranchPoint(bestPvSan, pv2San);
          const shared = branchIdx > 0 ? `Shared first ${branchIdx} move(s): ${bestPvSan.slice(0, branchIdx).join(" ")}. ` : "";
          block += `BRANCH POINT: ${shared}Key divergence — best: ${bestPvSan[branchIdx] ?? "?"} vs alternative: ${pv2San[branchIdx] ?? "?"}\n`;
        }

        const conceptBlock = buildConceptLayer(m.fenBefore, bestPvSan);
        if (conceptBlock) {
          block += `PEDAGOGICAL CONCEPTS (teach by name — this is the principle the student missed):\n${conceptBlock}\n`;
        }

        if (explanationSeed) block += `ENGINE IDEA: ${explanationSeed}\n`;

        // Lever 1: relational facts for this critical position (anti-hallucination)
        try {
          const relFacts = buildRelationalFacts(m.fenBefore);
          block += `VERIFIED POSITION FACTS (chess.js oracle — only assert relationships listed here):\n${relFacts.summary}\n`;
        } catch {
          // skip on invalid FEN
        }

        // Phase-2 GROUNDED TEACHING SPINE (principle 8): the concept-DELTA the
        // move changed + the opponent threats to count, grounded next to the
        // Lever-1 facts above. try/catch mirrors the Lever-1 pattern — a bad
        // FEN degrades silently rather than 500-ing the analysis.
        try {
          const fenAfter = getFenAtHalfMove(moveHistory, m.halfMoveIdx + 1);
          const spine = buildTeachingSpine(
            m.fenBefore,
            fenAfter,
            evalBefore.lines[0].pv ?? []
          );
          if (spine) {
            block += `GROUNDED TEACHING SPINE (what the move changed + threats to count):\n${spine}\n`;
          }
        } catch {
          // skip on invalid FEN / unexpected chess.js throw
        }

        intelligenceLines.push(block);
      }

      if (intelligenceLines.length > 0) {
        sections.push(`## CHESS INTELLIGENCE LAYER\n(Pre-computed verified analysis — use this to ground your explanations)\n\n${intelligenceLines.join("\n")}`);
      }
    }
  }

  return sections.join("\n\n");
}

/**
 * Get the FEN at a specific half-move index by replaying moves up to that point.
 */
export function getFenAtHalfMove(moveHistory: string[], halfMoveIdx: number): string {
  const game = new Chess();
  for (let i = 0; i < halfMoveIdx; i++) {
    try { game.move(moveHistory[i]); } catch { break; }
  }
  return game.fen();
}

/**
 * Build a PGN string from move history
 */
export function buildPgnFromMoves(moveHistory: string[]): string {
  const parts: string[] = [];
  for (let i = 0; i < moveHistory.length; i++) {
    if (i % 2 === 0) {
      parts.push(`${Math.floor(i / 2) + 1}.`);
    }
    parts.push(moveHistory[i]);
  }
  return parts.join(" ");
}

export function getMaterialBalance(game: Chess): string {
  const pieces = {
    w: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
    b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
  };
  const board = game.board();
  for (const row of board) {
    for (const square of row) {
      if (square) {
        pieces[square.color][square.type]++;
      }
    }
  }
  const values: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
  let whiteScore = 0, blackScore = 0;
  for (const [piece, value] of Object.entries(values)) {
    whiteScore += pieces.w[piece as keyof typeof pieces.w] * value;
    blackScore += pieces.b[piece as keyof typeof pieces.b] * value;
  }
  const diff = whiteScore - blackScore;
  const balance = diff === 0 ? "Equal material" : diff > 0 ? `White +${diff} material` : `Black +${Math.abs(diff)} material`;
  return `Material: ${balance}`;
}

/**
 * Convert a PV of SAN moves to UCI (from, to, promotion concatenated) starting
 * from the given FEN. Returns the array up to the first failure.
 */
export function sanPvToUci(fen: string, sanPv: string[]): string[] {
  const uci: string[] = [];
  const chess = new Chess(fen);
  for (const san of sanPv) {
    const mv = chess.move(san);
    if (!mv) break;
    uci.push(`${mv.from}${mv.to}${mv.promotion ?? ""}`);
  }
  return uci;
}

/**
 * Pedagogical Concept Layer — name the principle, not the mechanics.
 *
 * Runs the same detectConcepts used by retrieval so the chip label and the
 * prose vocabulary agree. Returns an empty string when no concept fires; the
 * caller then omits the block entirely (Claude falls back to motif tags).
 */
function buildConceptLayer(fenBefore: string, bestPvSan: string[]): string {
  const uci = sanPvToUci(fenBefore, bestPvSan);
  if (uci.length === 0) return "";
  const hits = detectConcepts({ fen: fenBefore, solutionUci: uci });
  if (hits.length === 0) return "";
  const lines: string[] = [];
  for (const h of hits.slice(0, 3)) {
    const c = getConcept(h.conceptId);
    if (!c) continue;
    lines.push(
      `- ${c.name} (${c.tier}, confidence ${h.confidence.toFixed(2)})\n    Definition: ${c.definition}\n    Evidence: ${h.evidence}`
    );
  }
  return lines.join("\n");
}
