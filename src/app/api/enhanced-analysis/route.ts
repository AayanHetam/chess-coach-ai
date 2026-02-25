import { NextRequest, NextResponse } from "next/server";
import { Chess } from "chess.js";
import { validateAIResponse } from "@/lib/aiResponseValidator";
import { annotatePosition, annotationToPromptContext } from "@/lib/positionAnnotator";
import { selectExamples, formatExamplesForPrompt } from "@/data/goldStandardExamples";
import { generateCacheKey, getCachedResponse, setCachedResponse } from "@/lib/responseCache";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

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

      // Best move from the position BEFORE this move was played
      if (evalBefore?.bestMove && evalBefore.bestMove !== "N/A") {
        const bestSan = uciToSan(fenBefore, evalBefore.bestMove);
        if (bestSan !== moveSan) {
          line += `\n    Best was: ${bestSan}`;
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      userMessage,
      message,
      moveHistory,
      fen,
      position,
      systemPrompt,
      gameEval,
      playerColor,
      username,
      userRating,
      boardOrientation,
      conversationHistory,
    } = body;
    const messageText = userMessage || message || "";

    console.log("Enhanced analysis API called:", {
      hasMessage: !!messageText,
      moveCount: moveHistory?.length,
      hasEval: !!gameEval,
      hasSystemPrompt: !!systemPrompt,
      playerColor,
    });

    // Check for OpenAI API key
    if (!OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY not configured");
      return NextResponse.json(
        { error: "OpenAI API key not configured. Please set OPENAI_API_KEY in .env.local." },
        { status: 500 }
      );
    }

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

    // Build the messages for OpenAI
    const openaiMessages: Array<{ role: string; content: string }> = [];

    // System prompt (from client's AI Coach system prompt)
    if (systemPrompt) {
      openaiMessages.push({ role: "system", content: systemPrompt });
    } else {
      openaiMessages.push({
        role: "system",
        content: "You are an expert chess coach AI. Analyze games thoroughly using Stockfish evaluation data when available. Identify mistakes, explain principles violated, suggest improvements, and reference tactical themes. Be specific — cite exact move numbers and variations.",
      });
    }

    // Add conversation history for multi-turn context (prior messages before current)
    if (conversationHistory && Array.isArray(conversationHistory) && conversationHistory.length > 0) {
      for (const msg of conversationHistory) {
        if (msg.role && msg.content) {
          openaiMessages.push({ role: msg.role, content: msg.content });
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
    const examples = selectExamples(undefined, skillLevel, 2);
    const examplesContext = formatExamplesForPrompt(examples);
    if (examplesContext) {
      userContent += examplesContext;
    }

    openaiMessages.push({ role: "user", content: userContent });

    // Check response cache before calling OpenAI
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

    // Call OpenAI
    const openaiResponse = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: openaiMessages,
        temperature: 0.7,
        max_tokens: 3000,
      }),
    });

    if (!openaiResponse.ok) {
      const errorBody = await openaiResponse.text();
      console.error("OpenAI API error:", openaiResponse.status, errorBody);
      return NextResponse.json(
        {
          error: "OpenAI API request failed",
          details: `Status ${openaiResponse.status}: ${errorBody.slice(0, 200)}`,
        },
        { status: 502 }
      );
    }

    const openaiData = await openaiResponse.json();
    const rawAnalysis = openaiData.choices?.[0]?.message?.content || "No analysis generated.";

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
      console.log(`🔍 AI Response Validation: ${validation.issues.length} issue(s) found, score: ${validation.score.toFixed(2)}`);
      validation.issues.forEach(issue => {
        console.log(`  [${issue.severity}] ${issue.type}: ${issue.detail}`);
      });
    }

    // Use the validated (potentially annotated) response
    const analysisContent = validation.isValid ? rawAnalysis : validation.correctedResponse;

    // Cache the validated response for future identical queries
    setCachedResponse(cacheKey, analysisContent, validation.score);

    return NextResponse.json({
      gameAnalysis: {
        analysis: analysisContent,
        position: validationFen,
        turn: game.turn(),
        moveCount: Math.ceil(game.history().length / 2),
        availableMoves: game.moves().length,
        validationScore: validation.score,
        validationIssues: validation.issues.length,
      },
    });
  } catch (error) {
    console.error("Error in enhanced analysis:", error);
    return NextResponse.json(
      {
        error: "Analysis failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
