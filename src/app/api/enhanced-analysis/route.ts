import { NextRequest, NextResponse } from "next/server";
import { Chess } from "chess.js";
import { validateAIResponse } from "@/lib/aiResponseValidator";
import { annotatePosition, annotationToPromptContext } from "@/lib/positionAnnotator";
import { selectExamples, formatExamplesForPrompt } from "@/data/goldStandardExamples";
import { generateCacheKey, getCachedResponse, setCachedResponse } from "@/lib/responseCache";
import {
  generateContextId,
  storeAnalysisContext,
} from "@/lib/analysisContextCache";
import { enhancedAnalysisSchema, validateRequest } from "@/lib/validation/schemas";
import { logger, withRequestContext, extractRequestId } from "@/lib/logging";
import { callLLM, LLMError } from "@/lib/llmProvider";
import { getReinforcements } from "@/lib/concept/conceptRetrieval";
import { detectConcepts } from "@/lib/concept/conceptDetector";
import { getConcept } from "@/lib/concept/conceptTaxonomy";
import { requireAuth } from "@/lib/auth/requireAuth";

const log = logger.child({ module: "enhanced-analysis" });

interface PositionEvalInput {
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

interface GameEvalInput {
  positions: PositionEvalInput[];
  accuracy?: { white: number; black: number };
  estimatedElo?: { white: number; black: number };
  settings?: { engine: string; depth: number; multiPv: number; date: string };
}

/**
 * Convert a full PV line (array of UCI moves) to SAN notation by replaying each move.
 */
function convertPvToSan(fen: string, pvUci: string[]): string[] {
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
function uciToSan(fen: string, uciMove: string): string {
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
 * Algorithmically detect tactical motifs from a move and its engine PV.
 * Returns verified string tags — so GPT explains a known motif rather than guessing.
 */
function detectTacticalMotifs(fenBefore: string, moveSan: string, pvSan: string[]): string[] {
  const motifs: string[] = [];
  const pieceValues: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  const pieceNames: Record<string, string> = { p: "Pawn", n: "Knight", b: "Bishop", r: "Rook", q: "Queen", k: "King" };

  try {
    const gameBefore = new Chess(fenBefore);
    const moveObj = gameBefore.move(moveSan);
    if (!moveObj) return motifs;

    const gameAfter = new Chess(gameBefore.fen());
    const ourColor = moveObj.color;
    const opponentColor = ourColor === "w" ? "b" : "w";

    // 1. Sacrifice — moving piece is worth more than captured piece
    if (moveObj.captured) {
      const movingVal = pieceValues[moveObj.piece] ?? 0;
      const capturedVal = pieceValues[moveObj.captured] ?? 0;
      if (movingVal > capturedVal) {
        motifs.push(`SACRIFICE (${pieceNames[moveObj.piece]} for ${pieceNames[moveObj.captured]})`);
      }
    }

    // 2. Check — detect if it's a discovered check by checking if the moved piece itself attacks the king
    if (gameAfter.inCheck()) {
      const kingSquare = gameAfter.board().flat().find(sq => sq && sq.type === "k" && sq.color === opponentColor)?.square;
      let isDiscovered = false;
      if (kingSquare) {
        try {
          // Swap turn in FEN so we can query our piece's moves from its landing square
          const fenParts = gameAfter.fen().split(" ");
          fenParts[1] = ourColor;
          const tempGame = new Chess(fenParts.join(" "));
          const canReachKing = tempGame.moves({ square: moveObj.to as any, verbose: true } as any)
            .some((m: any) => m.to === kingSquare);
          isDiscovered = !canReachKing;
        } catch { /* fallback to plain CHECK */ }
      }
      motifs.push(isDiscovered ? "DISCOVERED CHECK" : "CHECK");
    }

    // 3. Fork / Double Attack — 2+ opponent pieces attacked after the move
    const opponentPieces: string[] = [];
    for (const row of gameAfter.board()) {
      for (const sq of row) {
        if (sq && sq.color === opponentColor && sq.type !== "k") {
          opponentPieces.push(sq.square);
        }
      }
    }
    const attackedOpponentPieces = opponentPieces.filter(sq => gameAfter.isAttacked(sq as any, ourColor));
    if (attackedOpponentPieces.length >= 2) {
      motifs.push(`FORK / DOUBLE ATTACK (${attackedOpponentPieces.length} pieces under threat)`);
    }

    // 4. Promotion threat in PV
    if (pvSan.some(san => san.includes("=Q") || san.includes("=R"))) {
      motifs.push("PROMOTION THREAT");
    }

    // 5. Forced line — opponent has very few responses after first PV move
    if (pvSan.length >= 2) {
      const gameAfterFirst = new Chess(gameAfter.fen());
      const opponentMoves = gameAfterFirst.moves().length;
      if (opponentMoves <= 3) {
        motifs.push(`FORCED LINE (opponent has ${opponentMoves} response${opponentMoves === 1 ? "" : "s"})`);
      }
    }

    // 6. Quiet move — no capture, no check, but high eval gain (often the hardest to explain)
    if (!moveObj.captured && !gameAfter.inCheck() && motifs.length === 0) {
      motifs.push("QUIET MOVE (positional — requires deep calculation to validate)");
    }
  } catch {
    // Non-critical — return what we have
  }

  return motifs;
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
 * Build a rich move-by-move game context string from the move history + Stockfish evals.
 * This gives the LLM everything it needs to analyze the game.
 */
function buildGameContext(
  moveHistory: string[],
  gameEval: GameEvalInput | undefined,
  playerColor: string,
  username?: string,
  userRating?: number
): string {
  const sections: string[] = [];

  // --- Game overview ---
  const totalHalfMoves = moveHistory.length;
  const totalFullMoves = Math.ceil(totalHalfMoves / 2);
  const game = new Chess();
  for (const m of moveHistory) {
    try { game.move(m); } catch { break; }
  }

  let overview = `## GAME OVERVIEW\n`;
  overview += `- Total moves: ${totalFullMoves} full moves (${totalHalfMoves} half-moves)\n`;
  overview += `- Result: ${game.isCheckmate() ? "Checkmate" : game.isStalemate() ? "Stalemate" : game.isDraw() ? "Draw" : "In progress"}\n`;
  if (username) overview += `- Player: ${username} playing as ${playerColor === "w" ? "White" : "Black"}\n`;
  if (userRating) overview += `- Player rating: ${userRating}\n`;
  if (gameEval?.accuracy) overview += `- Accuracy: White ${gameEval.accuracy.white.toFixed(1)}%, Black ${gameEval.accuracy.black.toFixed(1)}%\n`;
  if (gameEval?.estimatedElo) overview += `- Estimated Elo: White ~${gameEval.estimatedElo.white}, Black ~${gameEval.estimatedElo.black}\n`;
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
        if (topLine.mate !== undefined) {
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
      if (evalBefore?.lines?.[0] && evalAfter?.lines?.[0]) {
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

    sections.push(`## MOVE-BY-MOVE ANALYSIS (with Stockfish evaluations)\n${moveLines.join("\n")}`);

    // --- Top mistakes with full PV lines and candidate moves ---
    if (mistakes.length > 0) {
      mistakes.sort((a, b) => b.drop - a.drop);
      const topMistakes = mistakes.slice(0, 10);
      const mistakeLines = topMistakes.map((m) => {
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
          // Detect verified tactical motifs for the best move
          const bestPvLine = evalBefore.lines[0];
          const bestPvSan = bestPvLine?.pv ? convertPvToSan(m.fenBefore, bestPvLine.pv) : [];
          const motifs = detectTacticalMotifs(m.fenBefore, bestPvSan[0] ?? m.bestMove, bestPvSan);
          if (motifs.length > 0) {
            line += `\n  VERIFIED TACTICAL MOTIFS: ${motifs.join(" | ")}`;
          }

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
        const motifs = detectTacticalMotifs(m.fenBefore, bestPvSan[0] ?? m.moveSan, bestPvSan);
        const gapAnalysis = computeCandidateGap(evalBefore.lines);
        const explanationSeed = buildExplanationSeed(m.fenBefore, bestPvSan, m.moveNum, m.halfMoveIdx % 2 === 0);
        const severity = m.drop >= 300 ? "BLUNDER" : m.drop >= 150 ? "MISTAKE" : "INACCURACY";

        let block = `### CRITICAL POSITION: Move ${m.moveNum} (${m.color} — ${severity})\n`;
        block += `VERIFIED MOTIFS: ${motifs.length > 0 ? motifs.join(" | ") : "None detected (positional)"}\n`;
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
function getFenAtHalfMove(moveHistory: string[], halfMoveIdx: number): string {
  const game = new Chess();
  for (let i = 0; i < halfMoveIdx; i++) {
    try { game.move(moveHistory[i]); } catch { break; }
  }
  return game.fen();
}

/**
 * Build a PGN string from move history
 */
function buildPgnFromMoves(moveHistory: string[]): string {
  const parts: string[] = [];
  for (let i = 0; i < moveHistory.length; i++) {
    if (i % 2 === 0) {
      parts.push(`${Math.floor(i / 2) + 1}.`);
    }
    parts.push(moveHistory[i]);
  }
  return parts.join(" ");
}

function getMaterialBalance(game: Chess): string {
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
 * Generate puzzle recommendations for detected mistakes in the game.
 * Returns an array of mistake contexts with their matching puzzles.
 */
interface ReinforcementForCoach {
  concepts: string[];
  fallbackUsed: "concept" | "theme" | "none";
  puzzles: Array<{
    puzzleId: string;
    fen: string;
    moves: string;
    rating: number;
    concepts: Array<{ id: string; confidence: number }>;
  }>;
}

/**
 * Convert a PV of SAN moves to UCI (from, to, promotion concatenated) starting
 * from the given FEN. Returns the array up to the first failure.
 */
function sanPvToUci(fen: string, sanPv: string[]): string[] {
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

async function buildReinforcements(
  fenBefore: string,
  bestMoveSan: string,
  bestPvSan: string[],
  userRating: number
): Promise<ReinforcementForCoach | undefined> {
  try {
    const pv = bestPvSan.length > 0 ? bestPvSan : [bestMoveSan];
    const uci = sanPvToUci(fenBefore, pv);
    if (uci.length === 0) return undefined;
    const result = await getReinforcements({
      anchorFen: fenBefore,
      anchorSolutionUci: uci,
      themes: [],
      userElo: userRating,
      limit: 3,
    });
    return {
      concepts: result.anchorConcepts,
      fallbackUsed: result.fallbackUsed,
      puzzles: result.puzzles.map((p: any) => ({
        puzzleId: p.puzzleId,
        fen: p.fen,
        moves: p.moves,
        rating: p.rating,
        concepts: p.concepts ?? [],
      })),
    };
  } catch (err) {
    log.warn("Reinforcement retrieval failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}

async function generatePuzzleRecommendations(
  moveHistory: string[] | undefined,
  gameEval: any,
  userRating: number = 1500
): Promise<Array<{
  moveNumber: number;
  movePlayed: string;
  correctMove: string;
  fen: string;
  evalBefore: number;
  evalAfter: number;
  mistakeSeverity: "blunder" | "mistake" | "inaccuracy";
  tacticalMotifs: string[];
  puzzles: any[];
  explanation: string;
  reinforcements?: ReinforcementForCoach;
}>> {
  if (!moveHistory || !gameEval?.positions) {
    return [];
  }

  const recommendations = [];

  // Detect significant mistakes (drop > 150 centipawns)
  for (let i = 0; i < moveHistory.length; i++) {
    const evalBefore = gameEval.positions[i];
    const evalAfter = gameEval.positions[i + 1];
    if (!evalBefore?.lines?.[0] || !evalAfter?.lines?.[0]) continue;

    const cpBefore = evalBefore.lines[0].mate !== undefined
      ? (evalBefore.lines[0].mate! > 0 ? 9999 : -9999)
      : (evalBefore.lines[0].cp ?? 0);
    const cpAfter = evalAfter.lines[0].mate !== undefined
      ? (evalAfter.lines[0].mate! > 0 ? 9999 : -9999)
      : (evalAfter.lines[0].cp ?? 0);
    const drop = i % 2 === 0 ? cpBefore - cpAfter : cpAfter - cpBefore;

    // Only generate puzzles for mistakes/blunders (not minor inaccuracies)
    if (drop < 150) continue;

    const fenBefore = getFenAtHalfMove(moveHistory, i);
    const bestPvSan = convertPvToSan(fenBefore, evalBefore.lines[0].pv ?? []);
    const bestMove = bestPvSan[0] || "unknown";
    const motifs = detectTacticalMotifs(fenBefore, bestMove, bestPvSan);

    try {
      // Call the mistake-puzzles API
      const response = await fetch("http://localhost:3000/api/mistake-puzzles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fen: fenBefore,
          movePlayed: moveHistory[i],
          correctMove: bestMove,
          evalBefore: cpBefore,
          evalAfter: cpAfter,
          tacticalMotifs: motifs,
          userRating,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const reinforcements = await buildReinforcements(
          fenBefore,
          bestMove,
          bestPvSan,
          userRating
        );
        recommendations.push({
          moveNumber: Math.floor(i / 2) + 1,
          movePlayed: moveHistory[i],
          correctMove: bestMove,
          fen: fenBefore,
          evalBefore: cpBefore,
          evalAfter: cpAfter,
          mistakeSeverity: data.mistakeSeverity,
          tacticalMotifs: motifs,
          puzzles: data.puzzles.slice(0, 3), // Top 3 puzzles (legacy theme path)
          explanation: data.explanation,
          reinforcements,
        });
      }
    } catch (error) {
      console.error(`Failed to fetch puzzles for mistake at move ${Math.floor(i / 2) + 1}:`, error);
      // Continue with other mistakes even if one fails
    }

    // Limit to top 3 mistakes to avoid overwhelming the user
    if (recommendations.length >= 3) break;
  }

  return recommendations;
}

export async function POST(request: NextRequest) {
  const requestId = extractRequestId(request.headers);

  return withRequestContext(requestId, async () => {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();

    const parsed = validateRequest(enhancedAnalysisSchema, body);
    if (!parsed.success) return parsed.response;
    const {
      userMessage,
      message,
      moveHistory,
      fen,
      position,
      gameEval,
      playerColor,
      username,
      userRating,
      boardOrientation,
      conversationHistory,
    } = parsed.data;
    const messageText = userMessage || message || "";

    log.info("Enhanced analysis started", {
      hasMessage: !!messageText,
      moveCount: moveHistory?.length,
      hasEval: !!gameEval,
      playerColor,
      skillLevel: userRating ? (userRating < 1000 ? "beginner" : userRating < 1600 ? "intermediate" : "advanced") : "intermediate",
    });

    // API-key presence is now validated inside callLLM(); both Anthropic and
    // OpenAI are accepted, with automatic fallback from one to the other.

    // Build game context for the LLM
    let gameContext = "";
    if (moveHistory && moveHistory.length > 0) {
      gameContext = buildGameContext(
        moveHistory,
        gameEval,
        playerColor || (boardOrientation ? "w" : "b"),
        username,
        userRating
      );
    } else if (fen || position) {
      // Position-only analysis
      const fenStr = fen || position;
      const game = new Chess(fenStr);
      gameContext = `## POSITION ANALYSIS\nFEN: ${fenStr}\nTurn: ${game.turn() === "w" ? "White" : "Black"}\nLegal moves: ${game.moves().length}\n${getMaterialBalance(game)}`;
    } else {
      gameContext = "No game data or position provided. The user may be asking a general chess question.";
    }

    // Build the system prompt for Claude. Server-controlled only — see
    // AUDIT-PHASE-1.4 hardening note above.
    const claudeSystemPrompt = [
      "You are an expert chess coach AI. Analyze games thoroughly using Stockfish evaluation data when available.",
      "When the context includes a PEDAGOGICAL CONCEPTS block, you MUST:",
      "  (a) name the concept explicitly using its human-readable name (e.g., \"this is a back-rank mate\"),",
      "  (b) teach the principle behind it using the provided definition, adapted to the student's level,",
      "  (c) ground the explanation in the detector evidence and the actual move played.",
      "If no concept layer is provided, fall back to explaining tactical themes from the VERIFIED MOTIFS tags.",
      "Be specific — cite exact move numbers and variations.",
    ].join("\n");

    // Build the messages for Claude (user/assistant turns only — system is separate)
    const claudeMessages: Array<{ role: "user" | "assistant"; content: string }> = [];

    // Add conversation history for multi-turn context (prior messages before current)
    if (conversationHistory && Array.isArray(conversationHistory) && conversationHistory.length > 0) {
      for (const msg of conversationHistory) {
        if (msg.content && (msg.role === "user" || msg.role === "assistant")) {
          claudeMessages.push({ role: msg.role, content: msg.content });
        }
      }
    }

    // Current user message with full game context appended
    let userContent = "";
    if (messageText) {
      userContent += `## USER REQUEST:\n${messageText}\n\n`;
    }
    if (gameContext) {
      userContent += gameContext;
    }

    // Inject gold-standard few-shot examples for quality benchmarking
    const skillLevel = userRating
      ? (userRating < 1000 ? "beginner" : userRating < 1600 ? "intermediate" : "advanced") as "beginner" | "intermediate" | "advanced"
      : "intermediate" as const;
    const examples = selectExamples(undefined, skillLevel, 3);
    const examplesContext = formatExamplesForPrompt(examples);
    if (examplesContext) {
      userContent += examplesContext;
    }

    claudeMessages.push({ role: "user", content: userContent });

    // Check response cache before calling Claude
    const currentFen = fen || (moveHistory && moveHistory.length > 0
      ? getFenAtHalfMove(moveHistory, moveHistory.length)
      : "startpos");
    const cacheKey = generateCacheKey(currentFen, skillLevel, messageText || "analyze");
    const cachedResponse = getCachedResponse(cacheKey);

    if (cachedResponse) {
      // Build game state for metadata even on cache hit
      const cachedGame = new Chess();
      if (moveHistory && moveHistory.length > 0) {
        for (const m of moveHistory) {
          try { cachedGame.move(m); } catch { break; }
        }
      } else if (fen) {
        try { cachedGame.load(fen); } catch { /* ignore */ }
      }

      return NextResponse.json({
        gameAnalysis: {
          analysis: cachedResponse,
          position: cachedGame.fen(),
          turn: cachedGame.turn(),
          moveCount: Math.ceil(cachedGame.history().length / 2),
          availableMoves: cachedGame.moves().length,
          validationScore: 1.0,
          validationIssues: 0,
          cached: true,
        },
      });
    }

    // Call the unified LLM provider (Anthropic primary, OpenAI fallback).
    let llmResult;
    try {
      llmResult = await callLLM({
        tier: "flagship",
        system: claudeSystemPrompt,
        messages: claudeMessages,
        temperature: 0.7,
        maxTokens: 3000,
      });
    } catch (err) {
      const e = err instanceof LLMError ? err : new Error(String(err));
      log.error("LLM provider failed for enhanced-analysis", {
        message: e.message,
      });
      return NextResponse.json(
        {
          error: "LLM request failed",
          details: e.message,
        },
        { status: 502 }
      );
    }
    const rawAnalysis = llmResult.content || "No analysis generated.";

    // Build final game state for response metadata
    const game = new Chess();
    if (moveHistory && moveHistory.length > 0) {
      for (const m of moveHistory) {
        try { game.move(m); } catch { break; }
      }
    } else if (fen) {
      try { game.load(fen); } catch { /* ignore */ }
    }

    // Validate the LLM response against the actual board state
    const validationFen = game.fen();
    const validation = validateAIResponse(rawAnalysis, validationFen, moveHistory);

    if (validation.issues.length > 0) {
      log.warn("AI response validation issues", {
        issueCount: validation.issues.length,
        score: validation.score,
        issues: validation.issues.map(i => ({ severity: i.severity, type: i.type, detail: i.detail })),
      });
    }

    // Use the validated (potentially annotated) response
    const analysisContent = validation.isValid ? rawAnalysis : validation.correctedResponse;

    // Cache the validated response for future identical queries
    setCachedResponse(cacheKey, analysisContent, validation.score);

    // Store full analysis context for fast follow-up chat via /api/chat
    const contextId = generateContextId(moveHistory, fen, playerColor || "w");
    storeAnalysisContext({
      contextId,
      gameContext,
      systemPrompt: claudeSystemPrompt,
      fewShotExamples: examplesContext,
      fen: validationFen,
      skillLevel,
      playerColor: playerColor || "w",
      moveCount: Math.ceil(game.history().length / 2),
      createdAt: Date.now(),
      initialAnalysis: analysisContent,
    });

    // Generate targeted puzzle recommendations for detected mistakes
    const puzzleRecommendations = await generatePuzzleRecommendations(
      moveHistory,
      gameEval,
      userRating
    );

    return NextResponse.json({
      gameAnalysis: {
        analysis: analysisContent,
        position: validationFen,
        turn: game.turn(),
        moveCount: Math.ceil(game.history().length / 2),
        availableMoves: game.moves().length,
        validationScore: validation.score,
        validationIssues: validation.issues.length,
        contextId,
        puzzleRecommendations, // NEW: Targeted puzzles for each mistake
      },
    });
  } catch (error) {
    log.error("Enhanced analysis failed", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      {
        error: "Analysis failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
  });
}
