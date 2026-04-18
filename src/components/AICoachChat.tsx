"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Box,
  Paper,
  TextField,
  IconButton,
  Typography,
  CircularProgress,
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ThumbUpOutlinedIcon from "@mui/icons-material/ThumbUpOutlined";
import ThumbDownOutlinedIcon from "@mui/icons-material/ThumbDownOutlined";
import ThumbUpIcon from "@mui/icons-material/ThumbUp";
import ThumbDownIcon from "@mui/icons-material/ThumbDown";
import { styled } from "@mui/material/styles";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/cjs/styles/prism";

import { Chess } from "chess.js";
import { ChessPuzzle } from "@/lib/chessPuzzlesService";
import { useChessActions } from "@/hooks/useChessActions";
import {
  boardAtom,
  gameAtom,
  gameEvalAtom,
  moveAnalysisRequestAtom,
  userPlayerInfoAtom,
} from "@/sections/analysis/states";
import { useAtomValue, useSetAtom } from "jotai";
import { MaiaStatusIndicator } from "./MaiaStatusIndicator";
import { useRouter } from "next/router";
import {
  practicePuzzlesAtom,
  currentPuzzleIndexAtom,
  practiceThemeAtom,
  puzzleSolvedStatusAtom,
  PracticePuzzle,
} from "@/sections/practice/states";
import { getPuzzlesByTheme, normalizeThemeName, TACTICAL_THEMES } from "@/lib/chessPuzzlesService";
import { isExplorationModeAtom } from "@/components/board/states";
import { selectedCoachIdAtom } from "@/atoms/coachAtoms";
import { getPersonalityById } from "@/config/coachPersonalities";
import { useAuth } from "@/contexts/AuthContext";
import { storeFeedback } from "@/lib/feedbackStore";
import { ContextualPuzzleRecommendations } from "@/components/ContextualPuzzleRecommendations";
import { loadWeaknessProfile, getWeaknessPromptContext } from "@/lib/weaknessProfile";

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

interface AICoachChatProps {
  position?: string;
  game?: Chess;
  boardOrientation?: boolean;
}

// Component for inline "Practice Similar Puzzles" button in AI responses
const PracticePuzzleButton: React.FC<{
  theme: string;
  displayTheme: string;
}> = ({ theme, displayTheme }) => {
  const router = useRouter();
  const game = useAtomValue(gameAtom);
  const userPlayerInfo = useAtomValue(userPlayerInfoAtom);
  const setPracticePuzzles = useSetAtom(practicePuzzlesAtom);
  const setCurrentPuzzleIndex = useSetAtom(currentPuzzleIndexAtom);
  const setPracticeTheme = useSetAtom(practiceThemeAtom);
  const [loading, setLoading] = React.useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      const normalizedTheme = normalizeThemeName(theme);

      // Kebab-case theme IDs (matches Neo4j Theme.id convention)
      const kebabTheme = theme
        .trim()
        .replace(/([a-z])([A-Z])/g, "$1-$2")
        .replace(/\s+/g, "-")
        .toLowerCase();
      const themesForQuery = Array.from(new Set([kebabTheme, normalizedTheme]));

      // Use the CURRENT board position as the reference FEN for similarity ranking.
      // This is typically the mistake position the user navigated to.
      const currentFen = (() => {
        try { return game?.fen?.() ?? null; } catch { return null; }
      })();

      // Infer user rating from headers if available
      const userRating = (() => {
        try {
          const headers = game?.getHeaders?.() ?? {};
          const color = userPlayerInfo?.playerColor;
          const str = color === "black" ? headers.BlackElo : headers.WhiteElo;
          const n = str ? parseInt(String(str), 10) : NaN;
          return Number.isFinite(n) ? n : 1500;
        } catch { return 1500; }
      })();

      // PRIMARY PATH: /api/similar-puzzles (theme match + FEN similarity re-rank)
      if (currentFen) {
        try {
          const resp = await fetch("/api/similar-puzzles", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fen: currentFen,
              themes: themesForQuery,
              userRating,
              limit: 20,
              candidatePoolSize: 80,
              excludeIds: [],
              sideToMoveMustMatch: false,
            }),
          });
          if (resp.ok) {
            const data = await resp.json();
            if (data.puzzles && data.puzzles.length > 0) {
              const mapped: ChessPuzzle[] = data.puzzles.map((p: any) => ({
                id: p.puzzleId,
                fen: p.fen,
                moves: typeof p.moves === "string" ? p.moves.split(" ") : p.moves,
                rating: p.rating,
                themes: p.themes || [],
                solution: typeof p.moves === "string" ? p.moves.split(" ") : p.moves,
              }));

              try {
                const { createTrainingSet } = await import("@/lib/repetitTraining");
                const trainingSet = createTrainingSet({
                  conceptName: displayTheme,
                  theme: normalizedTheme,
                  puzzles: mapped,
                  userId: "current-user",
                });
                setPracticePuzzles(mapped);
                setCurrentPuzzleIndex(0);
                setPracticeTheme(normalizedTheme);
                router.push({
                  pathname: "/practice",
                  query: { theme: normalizedTheme, setId: trainingSet.id },
                });
              } catch {
                setPracticePuzzles(mapped);
                setCurrentPuzzleIndex(0);
                setPracticeTheme(normalizedTheme);
                router.push({ pathname: "/practice", query: { theme: normalizedTheme } });
              }
              console.log(`✅ Loaded ${mapped.length} puzzles via similar-puzzles (theme + FEN similarity). Pool=${data.poolSize}`);
              return;
            }
          }
        } catch (e) {
          console.log("similar-puzzles failed, falling back to adaptive-puzzles:", (e as Error).message);
        }
      }

      // SECONDARY FALLBACK: /api/adaptive-puzzles (theme-only, no FEN re-rank)
      try {
        const resp = await fetch("/api/adaptive-puzzles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: "practice-user",
            themes: themesForQuery,
            limit: 20,
            excludeIds: [],
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data.puzzles && data.puzzles.length > 0) {
            const mapped: ChessPuzzle[] = data.puzzles.map((p: any) => ({
              id: p.puzzleId,
              fen: p.fen,
              moves: typeof p.moves === "string" ? p.moves.split(" ") : p.moves,
              rating: p.rating,
              themes: p.themes || [],
              solution: typeof p.moves === "string" ? p.moves.split(" ") : p.moves,
            }));
            setPracticePuzzles(mapped);
            setCurrentPuzzleIndex(0);
            setPracticeTheme(normalizedTheme);
            router.push({ pathname: "/practice", query: { theme: normalizedTheme } });
            console.log(`✅ Loaded ${mapped.length} puzzles via adaptive-puzzles fallback`);
            return;
          }
        }
      } catch (e) {
        console.log("adaptive-puzzles also failed, falling back to static dataset");
      }

      // TERTIARY FALLBACK: static dataset
      const puzzles = await getPuzzlesByTheme([normalizedTheme], 20);
      if (puzzles.length > 0) {
        setPracticePuzzles(puzzles);
        setCurrentPuzzleIndex(0);
        setPracticeTheme(normalizedTheme);
        router.push({ pathname: "/practice", query: { theme: normalizedTheme } });
      }
    } catch (error) {
      console.error("Error fetching practice puzzles:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <span
      onClick={handleClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        color: "#fff",
        cursor: loading ? "wait" : "pointer",
        fontWeight: 600,
        padding: "6px 14px",
        borderRadius: "8px",
        background: "linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%)",
        fontSize: "0.85em",
        transition: "all 0.2s ease",
        boxShadow: "0 2px 6px rgba(76, 175, 80, 0.3)",
        marginTop: "4px",
      }}
      onMouseEnter={(e) => {
        if (!loading) {
          e.currentTarget.style.background = "linear-gradient(135deg, #43A047 0%, #1B5E20 100%)";
          e.currentTarget.style.boxShadow = "0 3px 10px rgba(76, 175, 80, 0.4)";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%)";
        e.currentTarget.style.boxShadow = "0 2px 6px rgba(76, 175, 80, 0.3)";
      }}
      title={`Practice ${displayTheme} puzzles`}
    >
      {loading ? "Loading..." : `🧩 Practice ${displayTheme} Puzzles`}
    </span>
  );
};

// Component for "see how" tactical sequence links
const SeeHowLink: React.FC<{
  sequence: string[];
  description: string;
  fromMoveNumber?: number;
}> = ({ sequence, description, fromMoveNumber }) => {
  const game = useAtomValue(gameAtom);
  const { goToMove } = useChessActions(boardAtom);

  const handleSequenceClick = async () => {
    console.log(`SeeHowLink clicked: ${description}, sequence:`, sequence);
    try {
      // First, go to the position where the sequence should start
      let startPosition = fromMoveNumber
        ? fromMoveNumber + 1
        : game.history().length + 1;
      goToMove(startPosition, game);

      // Wait a moment for the position to update
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Create a temporary game to play through the sequence
      const tempGame = new Chess(game.fen());
      const startingHistory = game.history();

      // Play through the sequence step by step
      for (let i = 0; i < sequence.length; i++) {
        const move = sequence[i];
        console.log(`Playing move ${i + 1}/${sequence.length}: ${move}`);

        try {
          // Make the move in the temporary game
          tempGame.move(move);

          // Navigate to this position in the main game by creating a new game state
          const newGame = new Chess();

          // Play all original moves up to the starting point
          for (let j = 0; j < startingHistory.length; j++) {
            newGame.move(startingHistory[j]);
          }

          // Then play the sequence moves up to the current point
          for (let k = 0; k <= i; k++) {
            newGame.move(sequence[k]);
          }

          // Navigate to this position
          goToMove(startingHistory.length + i + 1, newGame);

          // Wait before the next move
          if (i < sequence.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        } catch (error) {
          console.error(`Error playing move ${move}:`, error);
          break;
        }
      }

      console.log(`✅ Demonstrated tactical sequence: ${description}`);
    } catch (error) {
      console.error("Error demonstrating tactical sequence:", error);
    }
  };

  return (
    <span
      onClick={handleSequenceClick}
      style={{
        color: "#4CAF50",
        cursor: "pointer",
        textDecoration: "underline",
        fontWeight: "bold",
        padding: "2px 6px",
        borderRadius: "4px",
        backgroundColor: "rgba(76, 175, 80, 0.1)",
        border: "1px solid rgba(76, 175, 80, 0.3)",
        fontSize: "0.9em",
        transition: "all 0.2s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "rgba(76, 175, 80, 0.2)";
        e.currentTarget.style.borderColor = "rgba(76, 175, 80, 0.5)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "rgba(76, 175, 80, 0.1)";
        e.currentTarget.style.borderColor = "rgba(76, 175, 80, 0.3)";
      }}
      title={`Click to see how: ${description}`}
    >
      🔍 see how
    </span>
  );
};

// Component for clickable position links (navigates to specific position in game)
const PositionLink: React.FC<{
  positionNumber: number;
  description?: string;
}> = ({ positionNumber, description }) => {
  const game = useAtomValue(gameAtom);
  const { goToMove } = useChessActions(boardAtom);

  const handlePositionClick = () => {
    console.log(`PositionLink clicked: position ${positionNumber}`);
    try {
      // Navigate to the position (positionNumber corresponds to halfMoveNumber)
      // Position 0 = initial position, Position 1 = after first move, etc.
      goToMove(positionNumber, game);
      console.log(`✅ Navigated to position ${positionNumber}`);
    } catch (error) {
      console.error("Error navigating to position:", error);
    }
  };

  return (
    <span
      onClick={handlePositionClick}
      style={{
        color: "#FF9800",
        cursor: "pointer",
        textDecoration: "underline",
        fontWeight: "bold",
        padding: "2px 6px",
        borderRadius: "4px",
        backgroundColor: "rgba(255, 152, 0, 0.1)",
        border: "1px solid rgba(255, 152, 0, 0.3)",
        fontSize: "0.9em",
        transition: "all 0.2s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "rgba(255, 152, 0, 0.2)";
        e.currentTarget.style.borderColor = "rgba(255, 152, 0, 0.5)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "rgba(255, 152, 0, 0.1)";
        e.currentTarget.style.borderColor = "rgba(255, 152, 0, 0.3)";
      }}
      title={`Click to jump to position ${positionNumber}${description ? `: ${description}` : ""}`}
    >
      [position {positionNumber}]
    </span>
  );
};

// Component for clickable chess moves
const ClickableMove: React.FC<{
  move: string;
  moveNumber?: number;
  isBlackMove?: boolean;
  isRecommended?: boolean; // New prop to distinguish recommended moves
}> = ({ move, moveNumber, isBlackMove, isRecommended = false }) => {
  const game = useAtomValue(gameAtom);
  const board = useAtomValue(boardAtom);
  const isExplorationMode = useAtomValue(isExplorationModeAtom);
  const { goToMove, addMoves } = useChessActions(boardAtom);

  console.log(
    `ClickableMove created: ${moveNumber}.${isBlackMove ? ".." : ""} ${move} ${isRecommended ? "(recommended)" : ""}`
  );

  // Helper: enter exploration mode by replaying game to a half-move index, then playing an alternative move
  const enterExplorationAt = (halfMoveIdx: number, altMove: string): boolean => {
    try {
      const gameHistory = game.history();
      const newGame = new Chess();
      // Replay the original game up to BEFORE the target half-move
      for (let i = 0; i < halfMoveIdx && i < gameHistory.length; i++) {
        newGame.move(gameHistory[i]);
      }
      // Play the alternative/recommended move
      newGame.move(altMove);
      goToMove(newGame.history().length, newGame);
      console.log(`✅ Entered exploration mode: ${altMove} at half-move ${halfMoveIdx}`);
      return true;
    } catch (error) {
      console.warn(`Could not enter exploration for ${altMove}:`, error);
      return false;
    }
  };

  const handleMoveClick = () => {
    console.log(
      `ClickableMove clicked: ${moveNumber}.${isBlackMove ? ".." : ""} ${move}`
    );
    
    // Calculate the half-move index for this move number
    let halfMoveIdx = moveNumber !== undefined
      ? (isBlackMove ? moveNumber * 2 - 1 : (moveNumber - 1) * 2)
      : -1;

    // Verify the turn color at the calculated position and correct if needed
    // This fixes cases where AI writes "20. Rf7" when it means "20... Rf7" (Black's move)
    if (halfMoveIdx >= 0 && moveNumber !== undefined) {
      const gameHistory = game.history();
      const tempGame = new Chess();
      for (let i = 0; i < halfMoveIdx && i < gameHistory.length; i++) {
        tempGame.move(gameHistory[i]);
      }
      // Check if move is legal at the calculated position
      const legalMoves = tempGame.moves();
      const isLegalHere = legalMoves.some(m => m.replace(/[+#]/, '') === move.replace(/[+#]/, ''));
      if (!isLegalHere) {
        // Try the other color's position (±1 half-move)
        const altIdx = isBlackMove ? (moveNumber - 1) * 2 : moveNumber * 2 - 1;
        if (altIdx >= 0 && altIdx <= gameHistory.length) {
          const tempGame2 = new Chess();
          for (let i = 0; i < altIdx && i < gameHistory.length; i++) {
            tempGame2.move(gameHistory[i]);
          }
          const altLegal = tempGame2.moves();
          if (altLegal.some(m => m.replace(/[+#]/, '') === move.replace(/[+#]/, ''))) {
            console.log(`Color correction: ${move} not legal at halfMove ${halfMoveIdx}, using ${altIdx} instead`);
            halfMoveIdx = altIdx;
          }
        }
      }
    }

    if (isRecommended && moveNumber !== undefined) {
      // GREEN LINK: Enter exploration mode at the correct position
      enterExplorationAt(halfMoveIdx, move);
      return;
    }
    
    try {
      const gameHistory = game.history();

      if (moveNumber !== undefined) {
        // We have a move number — use it to navigate precisely
        const targetMoveIndex = halfMoveIdx;

        // Check if the move matches at the expected position in the original game
        if (
          targetMoveIndex >= 0 &&
          targetMoveIndex < gameHistory.length &&
          gameHistory[targetMoveIndex] === move
        ) {
          // Exact match — navigate to this move in the original game
          goToMove(targetMoveIndex + 1, game);
          console.log(`✅ Navigated to move ${targetMoveIndex + 1}: ${move}`);
          return;
        }

        // Move doesn't match at expected index — this is an alternative/engine move
        // Enter exploration mode at this specific move number's position
        console.log(`Move "${move}" not at expected index ${targetMoveIndex}, entering exploration mode at move ${moveNumber}`);
        if (enterExplorationAt(halfMoveIdx >= 0 ? halfMoveIdx : 0, move)) return;

      } else {
        // No move number — search for the move in history (find first occurrence)
        const targetMoveIndex = gameHistory.findIndex(
          (historyMove) => historyMove === move
        );
        if (targetMoveIndex >= 0) {
          goToMove(targetMoveIndex + 1, game);
          console.log(`✅ Navigated to move ${targetMoveIndex + 1}: ${move}`);
          return;
        }
      }

      // FALLBACK: If board is already in exploration mode, try playing the move
      // on the CURRENT board position (supports sequential continuation clicks)
      if (isExplorationMode) {
        try {
          const boardCopy = new Chess();
          boardCopy.loadPgn(board.pgn());
          boardCopy.move(move);
          goToMove(boardCopy.history().length, boardCopy);
          console.log(`✅ Played continuation move on current board: ${move}`);
          return;
        } catch {
          console.log(`Could not play ${move} on current board`);
        }
      }

      console.warn(
        `❌ Could not find or explore move "${move}" in game history`
      );
    } catch (error) {
      console.error("Error navigating to move:", error);
    }
  };

  return (
    <span
      onClick={handleMoveClick}
      style={{
        color: isRecommended ? "#2E7D32" : "#2196F3", // Green for recommended, blue for regular
        cursor: "pointer",
        textDecoration: "underline",
        fontWeight: "bold",
        padding: "1px 3px",
        borderRadius: "3px",
        backgroundColor: isRecommended ? "rgba(46, 125, 50, 0.1)" : "rgba(33, 150, 243, 0.08)",
        transition: "all 0.2s ease",
      }}
      onMouseEnter={(e) => {
        if (isRecommended) {
          e.currentTarget.style.backgroundColor = "rgba(46, 125, 50, 0.2)";
          e.currentTarget.style.color = "#1B5E20";
        } else {
          e.currentTarget.style.backgroundColor = "rgba(33, 150, 243, 0.15)";
          e.currentTarget.style.color = "#1976D2";
        }
      }}
      onMouseLeave={(e) => {
        if (isRecommended) {
          e.currentTarget.style.backgroundColor = "rgba(46, 125, 50, 0.1)";
          e.currentTarget.style.color = "#2E7D32";
        } else {
          e.currentTarget.style.backgroundColor = "rgba(33, 150, 243, 0.08)";
          e.currentTarget.style.color = "#2196F3";
        }
      }}
      title={isRecommended ? `Click to explore position after ${move}` : `Click to jump to move ${moveNumber}${isBlackMove ? "..." : "."} ${move}`}
    >
      {isRecommended && "🔍 "}{moveNumber}.{isBlackMove ? ".." : ""} {move}
    </span>
  );
};









// Helper: convert UCI PV array to SAN from a given FEN
function uciPvToSan(fen: string, pvUci: string[]): string[] {
  const result: string[] = [];
  try {
    const g = new Chess(fen);
    for (const uci of pvUci) {
      const from = uci.slice(0, 2);
      const to = uci.slice(2, 4);
      const promotion = uci.length > 4 ? uci.slice(4) : undefined;
      try {
        const moveResult = g.move({ from, to, promotion });
        if (!moveResult) break;
        result.push(moveResult.san);
      } catch { break; }
    }
  } catch { /* ignore */ }
  return result;
}

// Helper: format SAN array as numbered move list
function formatSanAsMoveList(sanMoves: string[], startMoveNum: number, startsAsWhite: boolean): string {
  const parts: string[] = [];
  let moveNum = startMoveNum;
  let isWhite = startsAsWhite;
  for (const san of sanMoves) {
    if (isWhite) {
      parts.push(`${moveNum}. ${san}`);
    } else {
      if (parts.length === 0) parts.push(`${moveNum}... ${san}`);
      else parts.push(san);
      moveNum++;
    }
    isWhite = !isWhite;
  }
  return parts.join(" ");
}

// Engine-backed continuation: reads real Stockfish PV from gameEvalAtom (no LLM hallucinations)
const EngineContinuation: React.FC<{
  moveNum: number;    // Full move number (e.g. 14)
  color: "w" | "b";  // Color whose move this is
}> = ({ moveNum, color }) => {
  const gameEval = useAtomValue(gameEvalAtom);
  const game = useAtomValue(gameAtom);
  const { goToMove } = useChessActions(boardAtom);

  // Calculate half-move index: white move 14 = index 26, black move 14 = index 27
  const halfMoveIdx = color === "b" ? moveNum * 2 - 1 : (moveNum - 1) * 2;
  const gameHistory = game.history();

  // Get PV from Stockfish evaluation data
  const posEval = gameEval?.positions?.[halfMoveIdx];
  const pvLine = posEval?.lines?.[0]; // Best line (multiPv=1)

  if (!pvLine?.pv || pvLine.pv.length === 0) {
    return <span style={{ color: "#999", fontStyle: "italic", fontSize: "0.85em" }}>(Engine line not available for move {moveNum})</span>;
  }

  // Get FEN at position before this move by replaying game
  let fenBeforeMove = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  try {
    const tempGame = new Chess();
    for (let i = 0; i < halfMoveIdx && i < gameHistory.length; i++) {
      tempGame.move(gameHistory[i]);
    }
    fenBeforeMove = tempGame.fen();
  } catch { /* use default */ }

  // Convert UCI PV to SAN
  const pvSan = uciPvToSan(fenBeforeMove, pvLine.pv);
  if (pvSan.length === 0) {
    return <span style={{ color: "#999", fontStyle: "italic", fontSize: "0.85em" }}>(Could not parse engine line)</span>;
  }

  const isWhiteStart = color === "w";
  const displayText = formatSanAsMoveList(pvSan, moveNum, isWhiteStart);

  // Format eval
  const evalStr = pvLine.mate !== undefined
    ? `M${pvLine.mate > 0 ? "+" : ""}${pvLine.mate}`
    : pvLine.cp !== undefined ? `${pvLine.cp >= 0 ? "+" : ""}${(pvLine.cp / 100).toFixed(1)}` : "";

  const handlePlayLine = () => {
    try {
      const newGame = new Chess();
      for (let i = 0; i < halfMoveIdx && i < gameHistory.length; i++) {
        newGame.move(gameHistory[i]);
      }
      for (const san of pvSan) {
        try { newGame.move(san); } catch { break; }
      }
      // Go to divergence point (before first PV move), not the end.
      // The full PV is in the game history so the user can step forward/backward.
      goToMove(halfMoveIdx, newGame);
      console.log(`✅ Engine continuation loaded (${pvSan.length} moves) at divergence point move ${moveNum}. Use forward arrow to step through.`);
    } catch (error) {
      console.error("Error playing engine continuation:", error);
    }
  };

  return (
    <div style={{
      margin: "6px 0",
      padding: "8px 12px",
      borderRadius: "8px",
      backgroundColor: "rgba(76, 175, 80, 0.08)",
      border: "1px solid rgba(76, 175, 80, 0.25)",
      fontSize: "0.9em",
    }}>
      <div style={{ marginBottom: "4px" }}>
        <strong style={{ color: "#2E7D32" }}>Engine Best Line {evalStr && `(${evalStr})`}:</strong>{" "}
        <span>{displayText}</span>
      </div>
      <span
        onClick={handlePlayLine}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          color: "#4CAF50",
          cursor: "pointer",
          fontWeight: "bold",
          padding: "3px 8px",
          borderRadius: "6px",
          backgroundColor: "rgba(76, 175, 80, 0.15)",
          border: "1px solid rgba(76, 175, 80, 0.4)",
          fontSize: "0.85em",
          transition: "all 0.2s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "rgba(76, 175, 80, 0.3)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "rgba(76, 175, 80, 0.15)";
        }}
        title={`Click to play this line on the board`}
      >
        ▶ Play on Board
      </span>
    </div>
  );
};

// Maia continuation: user's color plays engine best, opponent plays Maia-predicted moves
const MaiaContinuation: React.FC<{
  moveNum: number;
  color: "w" | "b"; // Color of the user (whose mistake this was)
}> = ({ moveNum, color }) => {
  const gameEval = useAtomValue(gameEvalAtom);
  const game = useAtomValue(gameAtom);
  const { goToMove } = useChessActions(boardAtom);
  const [maiaLine, setMaiaLine] = React.useState<string[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const halfMoveIdx = color === "b" ? moveNum * 2 - 1 : (moveNum - 1) * 2;
  const gameHistory = game.history();

  const buildMaiaLine = async () => {
    setLoading(true);
    setError(null);
    try {
      // Get FEN at position before this move
      const tempGame = new Chess();
      for (let i = 0; i < halfMoveIdx && i < gameHistory.length; i++) {
        tempGame.move(gameHistory[i]);
      }

      // Get the engine best moves from PV
      const posEval = gameEval?.positions?.[halfMoveIdx];
      const pvLine = posEval?.lines?.[0];
      if (!pvLine?.pv || pvLine.pv.length === 0) {
        setError("No engine data available");
        setLoading(false);
        return;
      }

      // Build hybrid line: user color = engine best, opponent = Maia predicted
      const resultSan: string[] = [];
      const userIsWhite = color === "w";
      let currentIsWhite = userIsWhite; // First move is user's best move
      
      // Play engine best move first (this is the recommended move)
      const firstUci = pvLine.pv[0];
      const firstResult = tempGame.move({ from: firstUci.slice(0, 2), to: firstUci.slice(2, 4), promotion: firstUci.length > 4 ? firstUci.slice(4) : undefined });
      if (!firstResult) { setError("Could not play engine move"); setLoading(false); return; }
      resultSan.push(firstResult.san);
      currentIsWhite = !currentIsWhite;

      // Now alternate: opponent = Maia, user = engine best
      for (let step = 0; step < 8; step++) { // Max 8 more half-moves
        const fen = tempGame.fen();
        const isUserTurn = (currentIsWhite && userIsWhite) || (!currentIsWhite && !userIsWhite);

        if (isUserTurn) {
          // User's turn: play engine best from current eval (or PV if available)
          // Try to use PV continuation
          const pvIdx = resultSan.length;
          if (pvIdx < pvLine.pv.length) {
            const uci = pvLine.pv[pvIdx];
            try {
              const r = tempGame.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci.slice(4) : undefined });
              if (r) { resultSan.push(r.san); currentIsWhite = !currentIsWhite; continue; }
            } catch { /* fall through */ }
          }
          break; // No more engine moves available
        } else {
          // Opponent's turn: ask Maia for prediction
          try {
            const resp = await fetch("/api/maia-predict", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ fen, rating: 1500 }),
            });
            const data = await resp.json();
            if (data.humanLikeMove) {
              try {
                const r = tempGame.move(data.humanLikeMove);
                if (r) { resultSan.push(r.san); currentIsWhite = !currentIsWhite; continue; }
              } catch { /* Maia move illegal, try from PV */ }
            }
          } catch { /* Maia API failed */ }

          // Fallback: use PV move for opponent too
          const pvIdx = resultSan.length;
          if (pvIdx < pvLine.pv.length) {
            const uci = pvLine.pv[pvIdx];
            try {
              const r = tempGame.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci.slice(4) : undefined });
              if (r) { resultSan.push(r.san); currentIsWhite = !currentIsWhite; continue; }
            } catch { /* ignore */ }
          }
          break; // No more moves available
        }
      }

      setMaiaLine(resultSan);
    } catch (err) {
      setError("Failed to build Maia line");
      console.error(err);
    }
    setLoading(false);
  };

  const handlePlayLine = () => {
    if (!maiaLine || maiaLine.length === 0) return;
    try {
      const newGame = new Chess();
      for (let i = 0; i < halfMoveIdx && i < gameHistory.length; i++) {
        newGame.move(gameHistory[i]);
      }
      for (const san of maiaLine) {
        try { newGame.move(san); } catch { break; }
      }
      // Go to divergence point (before first Maia move), not the end.
      // The full line is in the game history so the user can step forward/backward.
      goToMove(halfMoveIdx, newGame);
      console.log(`✅ Maia line loaded (${maiaLine.length} moves) at divergence point. Use forward arrow to step through.`);
    } catch (error) {
      console.error("Error playing Maia continuation:", error);
    }
  };

  const isWhiteStart = color === "w";
  const displayText = maiaLine ? formatSanAsMoveList(maiaLine, moveNum, isWhiteStart) : "";

  return (
    <div style={{
      margin: "6px 0",
      padding: "8px 12px",
      borderRadius: "8px",
      backgroundColor: "rgba(156, 39, 176, 0.08)",
      border: "1px solid rgba(156, 39, 176, 0.25)",
      fontSize: "0.9em",
    }}>
      <div style={{ marginBottom: "4px" }}>
        <strong style={{ color: "#7B1FA2" }}>Maia Realistic Line</strong>
        <span style={{ color: "#9C27B0", fontSize: "0.8em", marginLeft: "6px" }}>
          (You play best moves, opponent plays most likely human responses)
        </span>
      </div>
      {!maiaLine && !loading && !error && (
        <span
          onClick={buildMaiaLine}
          style={{
            display: "inline-flex", alignItems: "center", gap: "4px",
            color: "#9C27B0", cursor: "pointer", fontWeight: "bold",
            padding: "3px 8px", borderRadius: "6px",
            backgroundColor: "rgba(156, 39, 176, 0.15)",
            border: "1px solid rgba(156, 39, 176, 0.4)",
            fontSize: "0.85em", transition: "all 0.2s ease",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(156, 39, 176, 0.3)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "rgba(156, 39, 176, 0.15)"; }}
        >
          🤖 Compute Maia Line
        </span>
      )}
      {loading && <span style={{ color: "#9C27B0" }}>Computing Maia predictions...</span>}
      {error && <span style={{ color: "#999", fontStyle: "italic" }}>{error}</span>}
      {maiaLine && maiaLine.length > 0 && (
        <>
          <div style={{ margin: "4px 0" }}>{displayText}</div>
          <span
            onClick={handlePlayLine}
            style={{
              display: "inline-flex", alignItems: "center", gap: "4px",
              color: "#9C27B0", cursor: "pointer", fontWeight: "bold",
              padding: "3px 8px", borderRadius: "6px",
              backgroundColor: "rgba(156, 39, 176, 0.15)",
              border: "1px solid rgba(156, 39, 176, 0.4)",
              fontSize: "0.85em", transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(156, 39, 176, 0.3)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "rgba(156, 39, 176, 0.15)"; }}
          >
            ▶ Play on Board
          </span>
        </>
      )}
    </div>
  );
};

// New component for hypothetical "what-if" moves
const HypotheticalMove: React.FC<{
  move: string;
  moveNumber?: number;
  isBlackMove?: boolean;
  originalMove: string;
}> = ({ move, moveNumber, isBlackMove, originalMove }) => {
  const game = useAtomValue(gameAtom);
  const { goToMove } = useChessActions(boardAtom);

  const handleHypotheticalClick = () => {
    console.log(
      `HypotheticalMove clicked: ${moveNumber}.${isBlackMove ? ".." : ""} ${move} instead of ${originalMove}`
    );
    try {
      const gameHistory = game.history();
      let targetMoveIndex = -1;

      if (moveNumber !== undefined) {
        // Calculate the exact index based on move number and color
        if (isBlackMove) {
          targetMoveIndex = moveNumber * 2 - 1;
        } else {
          targetMoveIndex = moveNumber * 2 - 2;
        }
      }

      if (targetMoveIndex >= 0 && targetMoveIndex < gameHistory.length) {
        // Go to the position before the violation
        const newGame = new Chess();
        const history = gameHistory.slice(0, targetMoveIndex);
        history.forEach((m) => newGame.move(m));

        // Make the hypothetical move instead of the original move
        try {
          newGame.move(move);
          goToMove(targetMoveIndex + 1, newGame);
          console.log(
            `✅ Navigated to hypothetical move ${targetMoveIndex + 1}: ${move}`
          );
        } catch (error) {
          console.error("Invalid hypothetical move:", move, error);
        }
      }
    } catch (error) {
      console.error("Error navigating to hypothetical move:", error);
    }
  };

  return (
    <span
      onClick={handleHypotheticalClick}
      style={{
        color: "#4CAF50", // Green color for hypothetical moves
        cursor: "pointer",
        textDecoration: "underline",
        fontWeight: "bold",
        padding: "2px 4px",
        borderRadius: "4px",
        backgroundColor: "rgba(76, 175, 80, 0.1)",
        transition: "all 0.2s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "rgba(76, 175, 80, 0.2)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "rgba(76, 175, 80, 0.1)";
      }}
      title={`Click to see what if ${moveNumber}${isBlackMove ? "..." : "."} ${move} was played instead of ${originalMove}`}
    >
      {moveNumber}.{isBlackMove ? ".." : ""} {move}
    </span>
  );
};

// Helper function to process [CONTINUATION:moveNum:color] and [MAIA_CONTINUATION:moveNum:color] tokens
// These render engine-backed continuation lines from real Stockfish PV data (no LLM hallucinations)
const processContinuationTokens = (text: string): Array<string | React.ReactElement> => {
  const tokenPattern = /\[(CONTINUATION|MAIA_CONTINUATION):(\d+):(w|b)\]/g;
  
  const parts: Array<string | React.ReactElement> = [];
  let lastIndex = 0;
  let match;

  while ((match = tokenPattern.exec(text)) !== null) {
    // Add text before the token
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const type = match[1]; // "CONTINUATION" or "MAIA_CONTINUATION"
    const moveNum = parseInt(match[2]);
    const color = match[3] as "w" | "b";

    if (type === "CONTINUATION") {
      parts.push(
        <EngineContinuation
          key={`engine-cont-${match.index}`}
          moveNum={moveNum}
          color={color}
        />
      );
    } else {
      parts.push(
        <MaiaContinuation
          key={`maia-cont-${match.index}`}
          moveNum={moveNum}
          color={color}
        />
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
};

// Helper function to process position links
const processPositionLinks = (text: string) => {
  if (!text.includes("position") && !text.includes("Position") && !text.includes("[position")) {
    return [text];
  }

  const parts = [];
  // Pattern to match position references: "[position X]" (new format) or "position X", "Position X", etc. (old formats)
  const positionPattern = /\[position\s+(\d+)\]|(?:\[)?(?:position|Position)\s+(\d+)(?:\])?/gi;
  let lastIndex = 0;
  let match;

  while ((match = positionPattern.exec(text)) !== null) {
    // Add text before the link
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    // Use first capture group if available (new format), otherwise second (old format)
    const positionNumber = parseInt(match[1] || match[2]);
    parts.push(
      <PositionLink
        key={`position-${match.index}`}
        positionNumber={positionNumber}
      />
    );

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
};

// Helper function to process practice puzzle button markers [PRACTICE:theme:displayName]
const processPracticeButtons = (text: string): Array<string | React.ReactElement> => {
  if (!text.includes("[PRACTICE:")) {
    return [text];
  }

  const parts: Array<string | React.ReactElement> = [];
  const pattern = /\[PRACTICE:([^:\]]+):([^\]]+)\]/g;
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <PracticePuzzleButton
        key={`practice-${match.index}`}
        theme={match[1]}
        displayTheme={match[2]}
      />
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
};

// Helper function to process correct move links [Correct: Move]
const processCorrectMoveLinks = (text: string, game: Chess, moveNumber?: number, isBlackMove?: boolean) => {
  if (!text.includes("[Correct:") && !text.includes("[correct:")) {
    return [text];
  }

  const parts = [];
  // Pattern to match [Correct: Move] format
  const correctMovePattern = /\[Correct:\s*([NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?|O-O(?:-O)?[+#]?)\]/gi;
  let lastIndex = 0;
  let match;

  while ((match = correctMovePattern.exec(text)) !== null) {
    // Add text before the link
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const correctMove = match[1];
    // Try to find the original move from context (we'll need to extract this from the text)
    // For now, use a placeholder - we'll improve this later
    const originalMove = "original"; // Placeholder
    
    parts.push(
      <HypotheticalMove
        key={`correct-${match.index}`}
        move={correctMove}
        moveNumber={moveNumber}
        isBlackMove={isBlackMove}
        originalMove={originalMove}
      />
    );

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
};

// Custom text renderer that converts move notation to clickable links
const renderTextWithClickableMoves = (text: string, game?: Chess) => {
  if (!text) return null;

  // Step 0: Process [CONTINUATION:X:c] and [MAIA_CONTINUATION:X:c] tokens → engine-backed lines
  const textWithContinuations = processContinuationTokens(text);
  if (textWithContinuations.length > 1 || (textWithContinuations.length === 1 && typeof textWithContinuations[0] !== "string")) {
    return <>{textWithContinuations.map((part, idx) => {
      if (typeof part === "string") {
        return <React.Fragment key={idx}>{renderTextWithClickableMoves(part, game)}</React.Fragment>;
      }
      return <React.Fragment key={idx}>{part}</React.Fragment>;
    })}</>;
  }

  // First, process practice puzzle buttons [PRACTICE:theme:displayName]
  const textWithPractice = processPracticeButtons(text);
  if (textWithPractice.length > 1 || (textWithPractice.length === 1 && typeof textWithPractice[0] !== "string")) {
    // Has practice buttons — process remaining string parts for other links
    return <>{textWithPractice.map((part, idx) => {
      if (typeof part === "string") {
        return <React.Fragment key={idx}>{renderTextWithClickableMoves(part, game)}</React.Fragment>;
      }
      return <React.Fragment key={idx}>{part}</React.Fragment>;
    })}</>;
  }

  // Then, process position links
  const textWithPositions = processPositionLinks(text);

  // Then process correct move links for each string part
  const processParts = (parts: any[]): any[] => {
    return parts.map((part, idx) => {
      if (typeof part === "string") {
        // Process correct move links in this string part
        const textWithCorrectMoves = processCorrectMoveLinks(part, game || new Chess());
        
        // If we have correct move links, process each part for regular moves
        if (textWithCorrectMoves.length > 1 || 
            (textWithCorrectMoves.length === 1 && typeof textWithCorrectMoves[0] !== "string")) {
          return textWithCorrectMoves.map((subPart, subIdx) => {
            if (typeof subPart === "string") {
              return (
                <React.Fragment key={`${idx}-${subIdx}`}>
                  {renderMovesInText(subPart)}
                </React.Fragment>
              );
            }
            return <React.Fragment key={`${idx}-${subIdx}`}>{subPart}</React.Fragment>;
          });
        }
        
        // No correct move links, just process regular moves
        return (
          <React.Fragment key={idx}>{renderMovesInText(part)}</React.Fragment>
        );
      }
      return <React.Fragment key={idx}>{part}</React.Fragment>;
    });
  };

  // If we have position links, process each part
  if (
    textWithPositions.length > 1 ||
    (textWithPositions.length === 1 && typeof textWithPositions[0] !== "string")
  ) {
    return processParts(textWithPositions);
  }

  // No position links, process correct move links and regular moves
  const textWithCorrectMoves = processCorrectMoveLinks(text, game || new Chess());
  if (textWithCorrectMoves.length > 1 || 
      (textWithCorrectMoves.length === 1 && typeof textWithCorrectMoves[0] !== "string")) {
    return processParts(textWithCorrectMoves);
  }

  // No special links, just process regular moves
  return renderMovesInText(text);
};

// Helper function to render moves in text
const renderMovesInText = (text: string) => {
  if (!text) return null;

  // Unified pattern to catch all move formats in priority order
  const movePatterns = [
    // Priority 1: AI response format "Move X (move)" - your specific format
    {
      pattern:
        /Move\s+(\d+)\s*\([^)]*([NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?|O-O(?:-O)?[+#]?)\)/gi,
      type: "ai_parentheses",
      priority: 1,
    },
    // Priority 2: AI response format "Move X: [move]" 
    {
      pattern:
        /Move\s+(\d+):\s*([NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?|O-O(?:-O)?[+#]?)/gi,
      type: "ai",
      priority: 2,
    },
    // Priority 3: Standard notation "15. Nf3" or "15... cxd4" (1-3 dots)
    {
      pattern:
        /(\d+)\.{1,3}\s*([NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?|O-O(?:-O)?[+#]?)/g,
      type: "standard",
      priority: 3,
    },
    // Priority 4: "move X" format
    {
      pattern:
        /move\s+(\d+)([wb])?:\s*([NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?|O-O(?:-O)?[+#]?)/gi,
      type: "move",
      priority: 4,
    },
  ];

  let parts = [];
  let lastIndex = 0;
  let processedRanges: Array<{ start: number; end: number }> = [];

  // Find all matches from all patterns and sort by priority and position
  const allMatches: Array<{
    match: RegExpExecArray;
    pattern: any;
    index: number;
    priority: number;
  }> = [];

  movePatterns.forEach((patternInfo) => {
    patternInfo.pattern.lastIndex = 0;
    let match;
    while ((match = patternInfo.pattern.exec(text)) !== null) {
      allMatches.push({
        match,
        pattern: patternInfo,
        index: match.index,
        priority: patternInfo.priority,
      });
    }
  });

  // Sort matches by priority (lower number = higher priority) and then by position
  allMatches.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return a.index - b.index;
  });

  // Process matches in order, avoiding overlaps
  allMatches.forEach((matchInfo) => {
    const { match, pattern } = matchInfo;
    const fullMatch = match[0];
    const startIndex = match.index;
    const endIndex = startIndex + fullMatch.length;

    // Check if this range overlaps with any already processed range
    const overlaps = processedRanges.some(
      (range) =>
        (startIndex >= range.start && startIndex < range.end) ||
        (endIndex > range.start && endIndex <= range.end) ||
        (startIndex <= range.start && endIndex >= range.end)
    );

    if (overlaps) {
      return; // Skip this match as it overlaps with a higher priority match
    }

    // Add text before the match
    if (startIndex > lastIndex) {
      parts.push(text.slice(lastIndex, startIndex));
    }

    // Process the match based on pattern type
    let moveNumber: number;
    let move: string;
    let isBlackMove: boolean;

    if (pattern.type === "ai_parentheses") {
      // Handle "Move X (move)" format - your specific case
      moveNumber = parseInt(match[1]);
      move = match[2];
      isBlackMove = moveNumber % 2 === 0;
    } else if (pattern.type === "ai") {
      moveNumber = parseInt(match[1]);
      move = match[2];
      isBlackMove = moveNumber % 2 === 0;
    } else if (pattern.type === "standard") {
      moveNumber = parseInt(match[1]);
      move = match[2];
      isBlackMove = fullMatch.includes("...");
    } else if (pattern.type === "move") {
      moveNumber = parseInt(match[1]);
      isBlackMove = match[2] === "b";
      move = match[3];
    } else {
      return; // Unknown pattern type
    }

    // Check LOCAL context around the move to determine if it's a recommended/best alternative
    const contextBefore = text.slice(Math.max(0, startIndex - 60), startIndex).toLowerCase();
    const isRecommendedMove = /best\s*(was|move|is)|should\s*have\s*(played|been)|instead\s*(of|,|:)|better\s*(was|move|is|alternative)|recommended|correct\s*move|improvement/.test(contextBefore);
    
    if (isRecommendedMove) {
      // Use green clickable move with exploration mode
      parts.push(
        <ClickableMove
          key={`recommended-${moveNumber}-${isBlackMove ? "black" : "white"}-${startIndex}`}
          move={move}
          moveNumber={moveNumber}
          isBlackMove={isBlackMove}
          isRecommended={true}
        />
      );
    } else {
      // Use regular blue clickable move
      parts.push(
        <ClickableMove
          key={`${pattern.type}-${moveNumber}-${isBlackMove ? "black" : "white"}-${startIndex}`}
          move={move}
          moveNumber={moveNumber}
          isBlackMove={isBlackMove}
          isRecommended={false}
        />
      );
    }

    // Update tracking
    lastIndex = endIndex;
    processedRanges.push({ start: startIndex, end: endIndex });
  });

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  // If no moves were found, just return the text
  if (parts.length === 0) {
    return <>{text}</>;
  }

  return <>{parts}</>;
};

// Helper function to process "see how" links
const processSeeLinks = (text: string) => {
  if (!text.includes("<SEELINK>")) {
    return [text];
  }

  const parts = [];
  const linkPattern = /<SEELINK>(.*?)<\/SEELINK>/g;
  let lastIndex = 0;
  let match;

  while ((match = linkPattern.exec(text)) !== null) {
    // Add text before the link
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    try {
      const linkData = JSON.parse(match[1]);
      parts.push(" ");
      parts.push(
        <SeeHowLink
          key={`see-how-${match.index}`}
          sequence={linkData.sequence}
          description={linkData.description}
        />
      );
    } catch (e) {
      console.error("Error parsing see link data:", e);
      parts.push(match[0]); // Fallback to original text
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
};

const ChatContainer = styled(Paper)(({ theme }) => ({
  height: "100%",
  display: "flex",
  flexDirection: "column",
  padding: theme.spacing(2),
}));

const MessagesContainer = styled(Box, {
  shouldForwardProp: (prop) => prop !== "isExpanded",
})<{ isExpanded: boolean }>(({ theme, isExpanded }) => ({
  flex: isExpanded ? 1 : "none",
  overflowY: "auto",
  marginBottom: theme.spacing(2),
  padding: theme.spacing(1),
  transition: "all 0.3s ease",
  maxHeight: isExpanded ? "none" : "400px", // Increased from 200px to 400px for better readability
}));

const ExpandButton = styled(IconButton)(({ theme }) => ({
  position: "absolute",
  right: theme.spacing(2),
  top: theme.spacing(2),
  zIndex: 1,
}));

const MessageBubble = styled(Box, {
  shouldForwardProp: (prop) => prop !== "isUser",
})<{ isUser: boolean }>(({ theme, isUser }) => ({
  maxWidth: "85%",
  padding: theme.spacing(1.5),
  borderRadius: theme.spacing(2),
  marginBottom: theme.spacing(1.5),
  backgroundColor: isUser
    ? theme.palette.primary.main // Orange for user messages
    : "#FF8C42", // Lighter orange for AI messages
  color: isUser
    ? "#FFFFFF" // White text on orange
    : "#FFFFFF", // White text on light orange
  alignSelf: isUser ? "flex-end" : "flex-start",
  marginLeft: isUser ? "auto" : 0,
  boxShadow: theme.shadows[2],
  transition: "all 0.2s ease-in-out",
  "&:hover": {
    boxShadow: theme.shadows[3],
  },
  // Enhanced markdown styling
  "& h1, & h2, & h3, & h4, & h5, & h6": {
    marginTop: theme.spacing(2),
    marginBottom: theme.spacing(1),
    fontWeight: 600,
    color: isUser ? "#FFFFFF" : "#FFFFFF",
  },
  "& h1": { fontSize: "1.5rem" },
  "& h2": { fontSize: "1.3rem" },
  "& h3": { fontSize: "1.2rem" },
  "& p": {
    marginBottom: theme.spacing(1),
    lineHeight: 1.6,
  },
  "& ul, & ol": {
    paddingLeft: theme.spacing(3),
    marginBottom: theme.spacing(1),
  },
  "& li": {
    marginBottom: theme.spacing(0.5),
  },
  "& blockquote": {
    borderLeft: `4px solid ${isUser ? "#FFFFFF" : "#FFFFFF"}`,
    paddingLeft: theme.spacing(2),
    marginLeft: 0,
    marginRight: 0,
    marginTop: theme.spacing(1),
    marginBottom: theme.spacing(1),
    fontStyle: "italic",
    backgroundColor: isUser
      ? "rgba(255, 255, 255, 0.1)"
      : "rgba(255, 255, 255, 0.1)",
    borderRadius: theme.spacing(0.5),
  },
  "& table": {
    width: "100%",
    borderCollapse: "collapse",
    marginBottom: theme.spacing(1),
    fontSize: "0.9rem",
  },
  "& th, & td": {
    border: `1px solid rgba(255, 255, 255, 0.3)`,
    padding: theme.spacing(1),
    textAlign: "left",
  },
  "& th": {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    fontWeight: 600,
  },
  "& code": {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    color: "#FFFFFF",
    padding: theme.spacing(0.25, 0.5),
    borderRadius: theme.spacing(0.5),
    fontSize: "0.9em",
    fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
  },
  "& pre": {
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    borderRadius: theme.spacing(1),
    padding: theme.spacing(1.5),
    overflow: "auto",
    marginBottom: theme.spacing(1),
    "& code": {
      backgroundColor: "transparent",
      color: "inherit",
      padding: 0,
      fontSize: "0.85em",
    },
  },
  "& hr": {
    border: "none",
    borderTop: `1px solid rgba(255, 255, 255, 0.3)`,
    margin: theme.spacing(2, 0),
  },
  "& strong": {
    fontWeight: 600,
  },
  "& em": {
    fontStyle: "italic",
  },
}));

// Smart greeting when a game is loaded — AI speaks first
function getSmartGameGreeting(
  game: Chess,
  playerInfo: { username?: string | null; playerColor?: string | null }
): string {
  const moveCount = Math.ceil(game.history().length / 2);
  const playerColor = playerInfo.playerColor === "white" ? "w" : playerInfo.playerColor === "black" ? "b" : null;
  const playerName = playerInfo.username || "you";

  if (game.isCheckmate()) {
    const winnerSide = game.turn() === "w" ? "b" : "w"; // side that delivered mate wins
    if (playerColor && playerColor === winnerSide) {
      return `Nice win, ${playerName}! 🎉 You checkmated your opponent in ${moveCount} moves. I'm your AI chess coach — would you like me to review the game, point out your best moves, or focus on any particular part?`;
    } else if (playerColor) {
      return `Tough loss, ${playerName}. Your opponent found checkmate on move ${moveCount}. But every loss is a learning opportunity! I'm your AI chess coach — want me to analyze what went wrong and show you how to improve?`;
    }
    return `The game ended in checkmate after ${moveCount} moves. I'm your AI chess coach — what would you like to analyze?`;
  }

  if (game.isDraw()) {
    if (game.isStalemate()) {
      return `The game ended in stalemate after ${moveCount} moves — so close! I'm your AI chess coach. Want me to review the endgame and show where the win was?`;
    }
    return `A hard-fought draw after ${moveCount} moves. I'm your AI chess coach — would you like me to analyze the key moments or find where you could have pushed for a win?`;
  }

  if (game.isGameOver()) {
    return `The game has ended after ${moveCount} moves. I'm your AI chess coach — what aspect would you like me to analyze?`;
  }

  // Game still in progress (imported mid-game or ongoing)
  if (moveCount > 0) {
    return `I see a ${moveCount}-move game loaded. I'm your AI chess coach — you can ask me anything: analyze the full game, review specific moves, explain positions, suggest improvements, or ask about strategy. What would you like to do?`;
  }

  return `Hi! I'm your AI chess coach. Import a game from the database, paste a PGN, or play moves on the board — then I'll help you analyze it. You can ask me about anything: mistakes, strategy, openings, endgames, or specific moves.`;
}

const AICoachChat: React.FC<AICoachChatProps> = ({
  position,
  game,
  boardOrientation = true,
}) => {
  const router = useRouter();
  // Get real Stockfish evaluation data
  const gameEval = useAtomValue(gameEvalAtom);
  // Get user player info (username and color)
  const userPlayerInfo = useAtomValue(userPlayerInfoAtom);

  // User profile (chess.com/lichess usernames)
  const { profile: userProfile } = useAuth();

  // Coach personality
  const selectedCoachId = useAtomValue(selectedCoachIdAtom);
  const personality = getPersonalityById(selectedCoachId);
  
  // Practice state setters
  const setPracticePuzzles = useSetAtom(practicePuzzlesAtom);
  const setCurrentPuzzleIndex = useSetAtom(currentPuzzleIndexAtom);
  const setPracticeTheme = useSetAtom(practiceThemeAtom);
  const puzzleSolvedStatus = useAtomValue(puzzleSolvedStatusAtom);
  const setPuzzleSolvedStatus = useSetAtom(puzzleSolvedStatusAtom);

  // Track previous game to detect when a new game is loaded
  const prevGameRef = useRef<string | null>(null);
  const gameLoadedRef = useRef(false);
  const hasUserMessagedRef = useRef(false);

  // Detect when a new game is loaded and auto-greet
  useEffect(() => {
    if (game) {
      const currentFen = game.fen();
      if (prevGameRef.current === null) {
        // Initial load
        prevGameRef.current = currentFen;
      } else if (prevGameRef.current !== currentFen) {
        // New game detected - check if it's a different game (not just a move)
        const currentMoves = game.history().length;
        const prevGame = new Chess(prevGameRef.current);
        const prevMoves = prevGame.history().length;
        
        // If move count decreased or significantly different, it's a new game
        if (currentMoves < prevMoves || Math.abs(currentMoves - prevMoves) > 5) {
          gameLoadedRef.current = true;
          hasUserMessagedRef.current = false; // Reset for new game
          analysisContextIdRef.current = null; // Reset context for new game

          // AI speaks first — auto-greet when game is loaded
          const greeting = getSmartGameGreeting(game, userPlayerInfo);
          setMessages((prev) => {
            // Keep system message, remove old conversation
            const systemMsg = prev.find((m) => m.role === "system");
            return [
              ...(systemMsg ? [systemMsg] : []),
              { role: "assistant" as const, content: greeting },
            ];
          });
        }
        prevGameRef.current = currentFen;
      }
    }
  }, [game]);

  const [messages, setMessages] = useState<Message[]>([
    {
      role: "system",
      content: `You are an expert grandmaster-level chess coach with deep knowledge of chess principles, strategy, and tactics. Your role is to guide users through their games by providing clear, actionable feedback that helps them improve.

YOUR PRIMARY JOB:
- Understand what the user is asking for using your natural language understanding
- Use the Stockfish evaluations, game history, and position data provided to fulfill their request
- Think through the request: What do they want? What information do you have? How can you use it to answer?
- Provide intelligent, helpful analysis based on their actual question - don't just follow templates

CRITICAL: PLAYER PERSPECTIVE ONLY
- You are coaching the PLAYER, whose color is provided in the USER CONTEXT section.
- ONLY analyze the PLAYER's moves and mistakes in detail. Do NOT give detailed analysis of the opponent's mistakes or blunders.
- If the opponent made a mistake, you may briefly note it ("Your opponent slipped here, giving you an opportunity") but do NOT dedicate a full analysis section to it. The player cannot control what the opponent does.
- Focus 100% of your coaching on what the PLAYER could have done better or did well.
- When doing a game review, ONLY pick the PLAYER's critical mistakes (biggest eval drops on THEIR moves). Skip opponent blunders entirely.

CHAIN-OF-THOUGHT REASONING (internal process before responding):
Before writing your response, silently work through these steps:
1. VERIFY: Check the FEN data. Before claiming any piece is on a square, mentally decode the FEN to confirm. If the FEN shows "r1bqkb1r", that means rook-empty-bishop-queen-king-bishop-empty-rook on that rank.
2. CROSS-CHECK: For every move you suggest, verify it is legal in the given position by checking the piece exists on the source square and the destination is reachable.
3. GROUND: Only reference information that appears in the Stockfish evaluation data, game history, or position annotation provided. Never guess at evaluations or invent variations.
4. CALIBRATE: Check the user's skill level from the USER CONTEXT section and adjust vocabulary, depth, and tone accordingly.
5. STRUCTURE: Select which of the 5 explanation categories (Threats, Best Moves, Plans, Piece Roles, Concepts) are most relevant for this specific position.
Do NOT show this reasoning process to the user — only output the final, polished coaching response.

CONVERSATION FLOW:
- If the user makes a specific request (e.g., "best moves", "analyze move 5", "what's wrong here"), use your reasoning to understand what they want, then use the provided Stockfish data to answer their question directly
- If the user only greets you (Hi, Hello) without a request, introduce yourself and ask what they'd like to do
- If a game is newly loaded, give a brief reaction, then ask what they'd like to analyze
- Use your judgment: if they've asked something specific, answer it. If they haven't, ask what they want.

CRITICAL: BOOK MOVES POLICY - NEVER CRITIQUE BOOK MOVES
- Book moves are theoretical opening moves that appear in master-level games (typically 50+ games or 5%+ frequency)
- NEVER critique book moves as mistakes, blunders, or inaccuracies - they are established theory
- When a move is marked as "BOOK_SOLID" or "BOOK_DUBIOUS":
  * BOOK_SOLID: Acknowledge it as a well-known book move. If engine prefers alternative, mention it gently: "The engine slightly prefers [alternative], but your move is completely standard and leads to a playable position."
  * BOOK_DUBIOUS: Acknowledge it's book but mention modern engines prefer alternatives: "This move is part of older opening theory and has been played in master games, but modern engines prefer [alternative]. You might consider the more modern line..."
- Focus on explaining WHY the book move is played in theory, not on criticizing it
- Book moves are stylistic/theoretical choices, not mistakes. Respect established opening theory.

CRITICAL: OPENING MOVES POLICY
- DO NOT critique opening moves (moves 1-15). These are established openings played by strong players.
- If an opening is detected (e.g., Vienna Game, Ruy Lopez, Sicilian Defense), acknowledge it: "Let's analyze your Vienna game" or "I see you played the Ruy Lopez"
- Only analyze moves from move 16 onwards, unless the user specifically asks about opening moves
- Example: If user plays 1.e4 e5 2.Nc3 (Vienna), say "Let's analyze your Vienna game" NOT "2.Nc3 is a mistake, you should play 2.Nf3"
- Opening moves are stylistic choices, not mistakes. Respect the user's opening choice.

DEEP STOCKFISH ANALYSIS - THINK LIKE A CHESS COACH:
You must deeply analyze Stockfish's principal variation (PV) to understand WHY moves are good. Don't just say "this is the best move" - explain the reasoning:

GAMEKNOT COMMENTARY DATASET - PRIMARY SOURCE FOR EXPLANATIONS:
You have access to the GameKnot commentary dataset containing 298,000+ human-written move explanations. This is your PRIMARY source for explaining WHY and HOW moves work:

1. PRIORITY: When GameKnot commentary is provided, USE IT AS THE PRIMARY SOURCE for explanations
   - GameKnot commentary contains human-written strategic reasoning
   - It explains WHY moves are played (strategic goals)
   - It explains HOW moves achieve their goals (mechanisms)
   - These are real explanations from experienced players

2. HOW TO USE GAMEKNOT COMMENTARY:
   - When commentary is provided, prioritize it over other sources
   - Use the commentary to explain the strategic reasoning behind moves
   - Combine commentary with Stockfish analysis for comprehensive explanations
   - Reference specific commentary when it directly applies: "As noted in similar positions, this move..."
   - Synthesize multiple commentaries if provided

3. EXAMPLE USAGE:
   - If commentary says "This move develops the knight and controls the center"
   - Explain: "Stockfish recommends this move because, as noted in similar positions, it develops your knight while controlling important central squares. This follows the principle of piece development and central control."

TACTICAL PATTERN RECOGNITION (Based on FULL Lichess Chess Puzzles Dataset):
You have access to the COMPLETE Lichess chess puzzles dataset with millions of real puzzle positions. Use this extensively (in addition to GameKnot commentary):

1. SIMILAR PUZZLES FROM DATASET:
   - When similar puzzles are provided, reference them directly: "This position is similar to puzzle #12345 from the Lichess dataset, which demonstrates the same fork pattern"
   - Explain how the solution sequences from similar puzzles relate to Stockfish's principal variation
   - Use puzzle themes to identify what type of tactic is present: "This is a classic fork pattern, as seen in thousands of Lichess puzzles with the 'fork' theme"

2. TACTICAL THEME IDENTIFICATION:
   - Use the tactical theme analysis provided (fork, pin, discovered attack, skewer, sacrifice, etc.)
   - Connect the identified tactical patterns to specific moves in the principal variation
   - Explain HOW the tactical pattern works in this specific position
   - Reference that these patterns come from the Lichess dataset: "This fork pattern appears in over 50,000 puzzles in the Lichess dataset"

3. DATASET-BASED EXPLANATIONS:
   - When explaining tactics, mention that this pattern is common in the dataset: "Forks like this appear frequently in the Lichess puzzle database"
   - Reference puzzle ratings when relevant: "This type of pin is typically rated around 1500-1800 in puzzle difficulty"
   - Use puzzle solutions to explain sequences: "The solution to similar puzzles shows that after this fork, the typical continuation is..."

For example:
- If a "fork" theme is identified with similar puzzles: "Stockfish suggests this move because it creates a fork, attacking both the king and queen simultaneously. This pattern appears in puzzle #12345 from the Lichess dataset (rated 1650), where the same fork leads to winning material. The solution sequence shows..."
- If a "pin" theme is identified: "This move creates a pin, where the opponent's piece cannot move without exposing a more valuable piece behind it. The Lichess dataset contains thousands of puzzles demonstrating this pattern, typically rated 1400-2000."
- If a "discovered attack" theme is identified: "By moving this piece, we reveal an attack from a piece behind it. This discovered attack pattern is one of the most common themes in the Lichess puzzle database, appearing in over 100,000 puzzles."

1. TACTICAL REASONS (immediate threats and opportunities):
   - Identify the specific tactical theme (fork, pin, discovered attack, skewer, sacrifice, etc.)
   - Explain HOW the tactical pattern works in this position
   - Connect the pattern to the moves in Stockfish's principal variation
   - Does it win material (piece, pawn)?
   - Does it threaten checkmate or force a winning sequence?
   - Does it defend against an immediate threat?

2. STRATEGIC REASONS (long-term plans and piece coordination):
   - Does it develop a piece to a better square?
   - Does it improve pawn structure or create weaknesses?
   - Does it coordinate pieces for an attack or defense?
   - Does it control important squares or files?

3. POSITIONAL REASONS (piece placement and future plans):
   - WHERE should pieces be placed? (e.g., "The knight belongs on f3 to control e5 and prepare kingside castling")
   - HOW do we get pieces there? (e.g., "We need to play d3 first to allow the bishop to develop")
   - WHY is this the best move? (e.g., "This move prepares the bishop development while maintaining central control")

4. GAME PLAN CREATION:
   - From any position, identify where pieces should ideally be placed
   - Explain the path to reach those ideal positions
   - Connect the best move to that plan: "This move is best because it starts the plan of placing the knight on f3, which will control the center and allow kingside castling"

MAIA INTEGRATION - HUMAN-LIKE MOVE PREDICTIONS:
- Maia predicts what humans at the user's rating level would play
- Use Maia predictions to:
  * Identify if the user played a common human move (even if not optimal): "You played the move that most players at your level choose, which is understandable because..."
  * Explain why humans choose certain moves: "Many players at your level play this move because it feels natural, but Stockfish shows a better alternative..."
  * Provide personalized feedback: "This is a common mistake at your level. Here's how to avoid it..."
- Compare: Stockfish (optimal) vs Maia (human-like) vs User's actual move
- If user's move matches Maia's prediction, acknowledge it's a common choice and explain why it's not optimal
- If user's move matches Stockfish, celebrate it: "Excellent! You found the engine's best move!"

STRUCTURED EXPLANATION FRAMEWORK (DecodeChess-quality depth):
For EACH critical mistake or key moment, provide ALL of the following sections that are relevant. Your analysis should match the depth of a professional chess analysis tool.

**For each mistake/key moment, structure as:**

### Move X. [Move] — [Severity: Blunder/Mistake/Inaccuracy]
**Eval:** [before] → [after] (lost X.X pawns)

**Best Move: X. [BestMove] (eval)**
[CONTINUATION:X:c]
[MAIA_CONTINUATION:X:c]

CRITICAL RULES FOR CONTINUATION TOKENS:
- Replace X with the move number (e.g., 14) and c with the color (w for white, b for black) whose move it was.
- Example: For white's mistake on move 14, write: [CONTINUATION:14:w] then [MAIA_CONTINUATION:14:w]
- NEVER write out continuation move sequences yourself — they WILL be wrong. The tokens above are rendered by the app using real Stockfish engine data.
- The [CONTINUATION] token shows the engine's best line where both sides play perfectly.
- The [MAIA_CONTINUATION] token shows a realistic line where the user plays best moves but the opponent plays human-likely responses (powered by Maia AI).
- Always include BOTH tokens for each mistake you analyze.

After the tokens, explain WHY the best move is good — what does it achieve? What threats does it create?

**Why the best move works (Idea → Problem → Solution → Outcome):**
- **Idea**: What White/Black wants to achieve (e.g., "White wants to win the knight on d7")
- **Problem**: What obstacle exists (e.g., "Black can play Qb6, threatening the queen on b2")
- **Solution**: How the best move addresses it (e.g., "Playing Qa1 before Bxd5 avoids the queen trade")
- **Outcome**: What the resulting position looks like (e.g., "White maintains a decisive advantage with active pieces")

CRITICAL — WHEN DISCUSSING OPPONENT RESPONSES:
- When explaining what happens after the best move, use the ENGINE'S recommended opponent response from the PV (principal variation), NOT what was actually played in the game.
- Example: "After 9. Be3, the best response for Black is 9... Nbd7 (from engine analysis)" — NOT "After 9. Be3, Black played 9... h6" (what actually happened in the game).
- The [CONTINUATION] and [MAIA_CONTINUATION] tokens will show these lines automatically, so you can reference them in your explanation.
- If you want to mention what the opponent actually played, do it SEPARATELY: "In the game, your opponent played 9... h6 instead, which was a mistake."

**Why X. [PlayedMove] was wrong:**
Explain the specific problem — what tactical or strategic issue did it create? Reference the eval drop.

**Threats in this position:**
- List 2-3 key threats from BOTH sides. What is each side threatening to do?
- Show how the best move addresses/creates threats

**Key piece roles:**
- For 2-3 most important pieces: what they do, what they threaten, what they support, what they control
- Identify the WORST placed piece and suggest where it should go

**Concept:** Name the tactical/strategic concept (pin, fork, outpost, x-ray, overloading, etc.) and briefly explain it.

DEPTH REQUIREMENTS:
- ALWAYS use [CONTINUATION:X:c] and [MAIA_CONTINUATION:X:c] tokens for each mistake (the app renders real engine lines from these — NEVER write out move sequences yourself)
- ALWAYS include eval scores in parentheses for candidate moves
- ALWAYS explain the PLAN behind the best move, not just "this is better"
- For game reviews, analyze the TOP 3-5 most critical mistakes with full depth
- After the detailed analysis, include an "Overall Patterns" section identifying recurring weaknesses

CRITICAL RULE: NEVER invent chess analysis beyond what the engine data shows. Your role is to TRANSLATE engine output into structured natural language, not to generate your own chess calculations. Every claim about pieces, squares, and moves MUST be grounded in the FEN and Stockfish data provided.

CORE RESPONSIBILITIES:
- Use your reasoning capabilities to understand what the user is asking for
- Analyze chess positions and games using Stockfish engine evaluations as your primary source of truth
- When analyzing moves, deeply examine Stockfish's principal variation to understand WHY moves are good:
  * Tactical reasons: pins, forks, discovered attacks, material wins, threats
  * Strategic reasons: piece development, pawn structure, piece coordination, control of squares
  * Positional reasons: ideal piece placement, how to reach those positions, why the move helps
- Use Maia predictions to provide personalized, human-level feedback when available
- Be encouraging and educational, helping users understand the deeper reasoning behind moves
- CRITICAL FORMATTING: ALWAYS reference moves with their move number. Use format "X. Move" for white moves and "X... Move" for black moves (e.g., "14. Nb3", "14... Nxe5"). This applies to BOTH played moves AND suggested/best moves. NEVER write bare moves like "Qe2" — always write "14. Qe2". This is required because move numbers make moves clickable in the UI.
- ALWAYS verify piece placements against the FEN data before claiming a piece is on a specific square

CRITICAL — MOVE TIMING AND BEST MOVE SUGGESTIONS:
- When suggesting the "Best Move" for a mistake, you MUST use the CORRECT MOVE NUMBER where the mistake occurred, NOT where that move was played later in the game.
- Example: If the player made a mistake on move 9 by playing 9. O-O, and the best move was 9. Be3, you MUST write "Best Move: 9. Be3" even if Be3 was actually played on move 13 in the game.
- NEVER write "Best Move: 13. Be3" just because Be3 appears on move 13 in the game history. The move number must match the position where the mistake occurred.
- After suggesting the best move, when showing the opponent's best response, use the NEXT move number (e.g., "After 9. Be3, the opponent's best response is 9... Nbd7").
- DO NOT use the move numbers from the actual game for hypothetical variations — use sequential move numbers starting from the position where the variation begins.
- This is CRITICAL because users click on move numbers to navigate to positions, and wrong move numbers will take them to the wrong position in the game.

STOCKFISH EVALUATION USAGE:
- Always ground your analysis in the Stockfish evaluations provided
- Deeply analyze the principal variation (PV) - don't just list moves, explain WHY each move in the PV is good
- When Stockfish shows a significant evaluation change, analyze the PV to understand what caused it
- Use Stockfish's best move suggestions and explain them using the WHERE/HOW/WHY framework
- Explain the evaluation in terms of pawns (e.g., "+0.5 pawns advantage" or "-1.2 pawns")
- If Stockfish shows mate, explain the mating sequence clearly by analyzing the PV
- Trust Stockfish evaluations over general principles when they conflict, but explain WHY

HOW TO FULFILL REQUESTS:
- Read the user's request carefully and understand what they're asking for
- Look at the Stockfish evaluations, game history, and position data provided
- Use your reasoning to determine: What information do they need? What does the data show?
- Provide a direct, helpful answer using the Stockfish data to support your analysis
- For move analysis: Reference moves as "move X" or "X.", analyze Stockfish PV to explain WHY
- For game reviews: Use Stockfish evaluations to identify key moments (only critique moves after move 10)
- Always make moves clickable by using "move X" or "X." format
- Be specific and educational - explain the reasoning, not just the result

CHESS PRINCIPLES TO REFERENCE:
When analyzing moves (after move 10), reference relevant chess principles such as:
- Opening (moves 1-10): Acknowledge the opening, don't critique it
- Middlegame: Improve worst-placed piece, control open files, create and exploit weaknesses
- Endgame: Activate your king, create passed pawns, control key squares
- Tactical: Look for tactical opportunities, don't leave pieces hanging, create pins and forks
- Strategic: Control important squares, don't create permanent weaknesses, coordinate pieces

INTERACTIVE ELEMENTS:
- When referencing a move in the game, format it as clickable: "move X" or "X."
- When suggesting a hypothetical move, clearly indicate it's an alternative and explain WHY using PV analysis
- When discussing a specific position, reference it clearly and explain the plan

${personality.systemPromptOverride}

PRACTICE PUZZLE SYSTEM — POWERED BY GRAPH DATABASE (200,000+ REAL PUZZLES):
You have direct access to a Neo4j Graph Database containing 200,000+ real Lichess puzzles with rich theme categorization. This is one of your MOST IMPORTANT capabilities. When the user makes mistakes, you MUST recommend PRECISE practice puzzles that match the EXACT tactical pattern they missed.

Available tactical themes (use the EXACT key on the left for the [PRACTICE:...] token):
${Object.entries(TACTICAL_THEMES).map(([key, val]) => `- "${key}" → ${val.theme}: ${val.description}`).join("\n")}

Difficulty bands: beginner (≤1200 rating), intermediate (1201-1600), advanced (1601-2000), expert (2001+)

PRACTICE OFFER PROTOCOL:
After explaining EACH mistake, you MUST offer practice puzzles using a special token that renders as a clickable button connected to the Graph DB.

HOW TO OFFER PRACTICE:
Include this exact token: [PRACTICE:themeKey:Display Name]
- themeKey must EXACTLY match one of the theme keys listed above (e.g., "fork", "pin", "backRankMate", "hangingPiece", "exposedKing")
- Display Name is what the user sees (e.g., "Fork Tactics", "Pin Patterns", "King Safety")
- The button queries 200,000+ real puzzles in the Graph Database to find the BEST matching puzzles at the user's skill level

CRITICAL — BE SPECIFIC WITH THEMES:
- Do NOT suggest generic themes. Match the EXACT tactical pattern from the mistake.
- If the user missed a knight fork → use [PRACTICE:fork:Knight Fork Tactics]
- If the user left their king exposed → use [PRACTICE:exposedKing:King Safety Puzzles]
- If the user missed a back rank threat → use [PRACTICE:backRankMate:Back Rank Defense]
- If the user hung a piece → use [PRACTICE:hangingPiece:Hanging Piece Awareness]
- If the user missed a pin → use [PRACTICE:pin:Pin Tactics]
- If the user missed a discovered attack → use [PRACTICE:discoveredAttack:Discovered Attack Puzzles]
- If the user missed a skewer → use [PRACTICE:skewer:Skewer Puzzles]
- For endgame mistakes, use the specific endgame theme (rookEndgame, pawnEndgame, bishopEndgame, etc.)
- You can include MULTIPLE [PRACTICE:...] tokens if the mistake involves multiple patterns

EXAMPLES:
- "You missed a fork pattern here. The Graph Database has thousands of fork puzzles at your level — let's sharpen that pattern recognition:\n[PRACTICE:fork:Fork Tactics]"
- "This was a classic back rank weakness. Practice defending against these with real puzzles from the database:\n[PRACTICE:backRankMate:Back Rank Defense]"
- "Your king safety awareness needs work. Here are targeted puzzles:\n[PRACTICE:exposedKing:King Safety Puzzles]"

RULES:
- ALWAYS include at least one [PRACTICE:...] token after your analysis of mistakes — this is INTEGRAL to the coaching experience
- Match the theme PRECISELY to the mistake pattern (fork → fork, NOT generic "tactics")
- Include a brief explanation of WHY this practice will help before the token
- After a game review with multiple mistakes, include a [PRACTICE:...] token for EACH distinct weakness pattern identified

SKILL-LEVEL CALIBRATION:
Adapt your explanations based on the user's rating (provided in USER CONTEXT). If no rating is available, default to intermediate (1000-1600).

BEGINNER (Under 1000):
- Use plain English. Avoid jargon. Say "your knight can attack two pieces at once" not "the knight fork on e6"
- Focus on: material safety, basic threats, one-move tactics, piece development
- Show ONE best move with a clear reason. Maximum 2-3 moves of variation.
- Tone: Encouraging and patient. Celebrate good moves. Frame mistakes as learning opportunities.

INTERMEDIATE (1000-1600):
- Introduce chess terms with brief context. "This is a knight fork on e6, where your knight attacks both the queen and rook"
- Focus on: tactical patterns, pawn structure, piece activity, opening principles
- Show top 2 moves with tradeoffs. Variations up to 4-5 moves deep.
- Tone: Constructive and specific. Point out patterns they should recognize.

ADVANCED (1600+):
- Use standard terminology freely. "Ne6 creates a royal fork with tempo"
- Focus on: strategic imbalances, prophylaxis, long-term plans, complex endgame technique
- Show top 3 moves with nuanced comparison. Full principal variations.
- Tone: Direct and analytical. Treat them as a peer studying the position.

IMPORTANT GUIDELINES:
- NEVER show FEN strings unless specifically requested
- NEVER critique opening moves (1-10) - acknowledge the opening instead
- Always analyze moves in the context of the full game, not just the current position
- Deeply analyze Stockfish's principal variation to understand WHY moves are good
- Use Maia predictions to provide personalized, human-level feedback
- Focus on educational value - help users understand the reasoning, not just the result
- Use Stockfish evaluations to identify the most critical mistakes (biggest evaluation drops) AFTER move 10
- Provide actionable advice that users can apply in similar positions
- Explain WHERE pieces should be, HOW to get them there, and WHY the best move is best`,
    },
    {
      role: "assistant",
      content: "Hi! I'm your AI chess coach. Import a game from the database, paste a PGN, or play moves on the board — then I'll help you analyze it. You can ask me about anything: mistakes, strategy, openings, endgames, or specific moves.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [messageFeedback, setMessageFeedback] = useState<Record<number, "positive" | "negative">>({});
  const [puzzleRecommendations, setPuzzleRecommendations] = useState<any[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const analysisContextIdRef = useRef<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // Track previous personality to detect changes
  const prevPersonalityRef = useRef<string>(selectedCoachId);

  // Reset conversation when coach personality changes
  useEffect(() => {
    if (prevPersonalityRef.current !== selectedCoachId) {
      prevPersonalityRef.current = selectedCoachId;
      const newPersonality = getPersonalityById(selectedCoachId);
      
      // Rebuild system prompt with new personality
      const systemMsg = messages.find((m) => m.role === "system");
      if (systemMsg) {
        const updatedContent = systemMsg.content.replace(
          /TONE AND STYLE[^\n]*PERSONALITY[^]*?(?=\n\nPRACTICE OFFER PROTOCOL)/,
          newPersonality.systemPromptOverride + "\n"
        );
        
        setMessages([
          { role: "system", content: updatedContent },
          { role: "assistant", content: newPersonality.greeting },
        ]);
      }
      
      hasUserMessagedRef.current = false;
      gameLoadedRef.current = false;
      analysisContextIdRef.current = null; // Reset context for new personality
    }
  }, [selectedCoachId]);

  // Listen for move analysis requests from moves panel
  const moveAnalysisRequest = useAtomValue(moveAnalysisRequestAtom);
  const setMoveAnalysisRequest = useSetAtom(moveAnalysisRequestAtom);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Helper function to detect if message is a greeting
  const isGreeting = (text: string): boolean => {
    const normalizedText = text.toLowerCase().trim();
    const greetings = ["hi", "hello", "hey", "greetings", "hi there", "hello there", "hey there"];
    return greetings.some(greeting => normalizedText === greeting || normalizedText.startsWith(greeting + " "));
  };

  // Helper function to detect if message is a direct request
  const isDirectRequest = (text: string): boolean => {
    const normalizedText = text.toLowerCase().trim();
    const requestKeywords = [
      "analyze", "review", "explain", "what", "why", "how", "show", "tell", 
      "help", "check", "best", "worst", "mistake", "good", "bad", "move",
      "moves", "game", "position", "opening", "middlegame", "endgame",
      "tactic", "strategy", "improve", "feedback", "coach", "teach"
    ];
    return requestKeywords.some(keyword => normalizedText.includes(keyword));
  };

  // Helper function to detect if user is accepting practice offer.
  //
  // IMPORTANT: Uses word-boundary matching and a short-message cap so that
  // casual requests like "help me analyze my game please" don't get hijacked
  // into the practice branch (which was previously happening because "please"
  // was a substring match).
  const isPracticeAcceptance = (text: string): boolean => {
    const normalizedText = text.toLowerCase().trim();
    // Acceptance utterances are short affirmations, not long requests.
    if (normalizedText.length > 60) return false;

    const acceptanceKeywords = [
      "yes", "sure", "ok", "okay", "yeah", "yep", "yup", "alright", "all right",
      "let's practice", "let's do it", "sounds good", "that sounds good",
      "i'd like to practice", "i want to practice", "i'd like that",
    ];
    return acceptanceKeywords.some((keyword) => {
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(^|\\W)${escaped}(\\W|$)`, "i").test(normalizedText);
    });
  };

  // Whether the most recent assistant message actually offered a practice drill.
  // Required gate before treating a message as practice acceptance — otherwise
  // we'd fire the practice flow on any short "yes" / "ok" regardless of context.
  const lastAssistantOfferedPractice = (): boolean => {
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return false;
    const c = lastAssistant.content;
    // Must contain a practice-offer phrase AND end with a question.
    const offerPhrase = /(practice\s+(?:some\s+)?\w+?\s*puzzles|would you like to (?:practice|drill|work on|try)|shall we (?:practice|drill)|want to practice)/i;
    return offerPhrase.test(c) && /\?/.test(c);
  };

  // Helper function to extract theme from recent conversation
  const extractThemeFromConversation = (): string | null => {
    // Look at the last few assistant messages for practice offer context
    const recentMessages = messages.slice(-5).reverse();
    
    for (const msg of recentMessages) {
      if (msg.role === "assistant") {
        const content = msg.content.toLowerCase();
        
        // Look for common theme keywords in the message
        const themePatterns = [
          { keywords: ["fork", "forks"], theme: "fork" },
          { keywords: ["pin", "pins"], theme: "pin" },
          { keywords: ["back rank", "back-rank"], theme: "backRankMate" },
          { keywords: ["discovered attack", "discovered attacks"], theme: "discoveredAttack" },
          { keywords: ["skewer", "skewers"], theme: "skewer" },
          { keywords: ["sacrifice", "sacrifices"], theme: "sacrifice" },
          { keywords: ["mate", "checkmate"], theme: "mate" },
          { keywords: ["hanging piece", "hanging pieces"], theme: "hangingPiece" },
        ];

        for (const pattern of themePatterns) {
          if (pattern.keywords.some(keyword => content.includes(keyword))) {
            return pattern.theme;
          }
        }
      }
    }
    
    return null;
  };

  // Helper function to get game result reaction
  const getGameReaction = (game: Chess): string => {
    if (game.isCheckmate()) {
      // If it's checkmate, the side that just moved won
      // game.turn() gives the side to move next, so if it's checkmate, the opposite side won
      const winner = game.turn() === "w" ? "Black" : "White";
      return `Wow! Nice win for ${winner}!`;
    } else if (game.isDraw()) {
      if (game.isStalemate()) {
        return "Interesting! The game ended in stalemate.";
      } else if (game.isThreefoldRepetition()) {
        return "Close game! It ended in a threefold repetition draw.";
      } else if (game.isInsufficientMaterial()) {
        return "The game ended in a draw due to insufficient material.";
      } else {
        return "Close game! It ended in a draw.";
      }
    } else if (game.isGameOver()) {
      return "The game has ended.";
    } else {
      // Game is still ongoing
      return "Nice game so far!";
    }
  };

  // Extracted send logic to be reusable - using useCallback to avoid dependency issues
  const handleSendMessage = React.useCallback(
    async (messageText?: string) => {
      const textToSend = messageText || input.trim();
      if (!textToSend) return;

      // Cancel any ongoing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const userMessage: Message = { role: "user", content: textToSend };

      // Extract system prompt from messages state BEFORE updating it
      const systemMessage = messages.find((m) => m.role === "system");
      let systemPrompt =
        systemMessage?.content && systemMessage.content.trim() !== ""
          ? systemMessage.content
          : undefined;

      // Add user player information to system prompt if available
      if (systemPrompt) {
        let playerInfoSection = "\n\nUSER CONTEXT:";
        let hasContext = false;

        if (userPlayerInfo.username && userPlayerInfo.playerColor) {
          playerInfoSection += `
- The user's in-game username is: ${userPlayerInfo.username}
- The user is playing as: ${userPlayerInfo.playerColor === "white" ? "White" : "Black"}
- Always analyze the game from the perspective of ${userPlayerInfo.username} playing as ${userPlayerInfo.playerColor === "white" ? "White" : "Black"}
- When referring to the user's moves, say "your move" or "${userPlayerInfo.username}'s move"
- When referring to the opponent, say "your opponent" or "the opponent"
- Focus your analysis on helping ${userPlayerInfo.username} understand their moves and improve their game`;
          hasContext = true;
        }

        // Add chess platform usernames from profile
        if (userProfile?.chesscomUsername) {
          playerInfoSection += `\n- Chess.com username: ${userProfile.chesscomUsername} (use this to understand the user's online rating and skill level)`;
          hasContext = true;
        }
        if (userProfile?.lichessUsername) {
          playerInfoSection += `\n- Lichess username: ${userProfile.lichessUsername} (use this to understand the user's online rating and skill level)`;
          hasContext = true;
        }

        // Inject user rating and skill level tier for calibration
        let extractedRating: number | undefined;
        if (game) {
          const headers = game.getHeaders();
          if (userPlayerInfo.playerColor === "white" && headers.WhiteElo) {
            extractedRating = parseInt(headers.WhiteElo);
          } else if (userPlayerInfo.playerColor === "black" && headers.BlackElo) {
            extractedRating = parseInt(headers.BlackElo);
          }
        }
        if (extractedRating) {
          const skillTier = extractedRating < 1000 ? "BEGINNER" : extractedRating < 1600 ? "INTERMEDIATE" : "ADVANCED";
          playerInfoSection += `\n- User rating: ${extractedRating}`;
          playerInfoSection += `\n- Skill calibration tier: ${skillTier} — use the ${skillTier} calibration from the SKILL-LEVEL CALIBRATION section above`;
          hasContext = true;
        }

        if (hasContext) {
          systemPrompt = systemPrompt + playerInfoSection;
        }

        // Inject weakness profile for personalized coaching
        try {
          const weaknessProfile = loadWeaknessProfile();
          const weaknessContext = getWeaknessPromptContext(weaknessProfile);
          if (weaknessContext) {
            systemPrompt = systemPrompt + weaknessContext;
          }
        } catch (e) {
          // Non-critical — skip if localStorage unavailable
        }
      }

      // Check if this is the first user message (only system message exists)
      const isFirstUserMessage = messages.filter(m => m.role === "user").length === 0;
      
      // Check if a new game was just loaded and user hasn't messaged yet
      const isNewGameLoaded = gameLoadedRef.current && game && !hasUserMessagedRef.current;
      
      // Mark that user has now messaged
      if (isFirstUserMessage) {
        hasUserMessagedRef.current = true;
      }
      
      // ───────────────────────────────────────────────────────────────
      // INTENT CLASSIFICATION (LLM-powered router)
      //
      // Instead of fragile keyword heuristics, ask a small fast LLM
      // (Claude Haiku, via /api/classify-intent) what the user actually
      // wants. Possible intents:
      //   - accept_practice  → run the puzzle-fetch flow with the extracted theme
      //   - decline_practice → short canned acknowledgment, stay in analysis
      //   - off_topic        → polite on-topic redirect (no big LLM call)
      //   - chess_question   → fall through to /api/enhanced-analysis or /api/chat
      //
      // If the classifier fails (network/API error or unparseable), we fall
      // back to the legacy regex heuristics below so the chat still works.
      // ───────────────────────────────────────────────────────────────
      type Intent =
        | "accept_practice"
        | "decline_practice"
        | "off_topic"
        | "chess_question";
      let classifiedIntent: Intent | null = null;
      let classifiedTheme: string | null = null;
      try {
        const classifyRes = await fetch("/api/classify-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userMessage: textToSend,
            recentMessages: messages
              .filter((m) => m.role === "user" || m.role === "assistant")
              .slice(-4)
              .map((m) => ({ role: m.role, content: m.content })),
          }),
        });
        if (classifyRes.ok) {
          const c = await classifyRes.json();
          if (
            c.intent === "accept_practice" ||
            c.intent === "decline_practice" ||
            c.intent === "off_topic" ||
            c.intent === "chess_question"
          ) {
            classifiedIntent = c.intent as Intent;
            classifiedTheme = typeof c.theme === "string" ? c.theme : null;
          }
        }
      } catch (e) {
        // Swallow — we'll fall back to regex heuristics below.
        console.warn("Intent classifier call failed, falling back to heuristics:", e);
      }

      // Route: OFF-TOPIC — short polite redirect, no big LLM call.
      if (classifiedIntent === "off_topic") {
        setMessages((prev) => [
          ...prev,
          userMessage,
          {
            role: "assistant",
            content:
              "I'm your chess coach, so I'll stay focused on chess! Ask me to analyze your game, explain a move, or suggest tactics to practice — happy to dive into any of those.",
          },
        ]);
        if (!messageText) setInput("");
        return;
      }

      // Route: DECLINE PRACTICE — short acknowledgment, then wait for next message.
      if (classifiedIntent === "decline_practice") {
        setMessages((prev) => [
          ...prev,
          userMessage,
          {
            role: "assistant",
            content:
              "No problem! We can keep analyzing the game. Let me know if you want to tackle a specific move or idea.",
          },
        ]);
        if (!messageText) setInput("");
        return;
      }

      // Route: ACCEPT PRACTICE — decide whether to trigger the puzzle flow.
      // Prefer the classifier's decision, but guard with the legacy heuristic
      // (last assistant actually offered practice) to avoid runaway loops.
      const shouldTriggerPractice =
        classifiedIntent === "accept_practice"
          ? !!classifiedTheme || lastAssistantOfferedPractice()
          : classifiedIntent === null &&
            isPracticeAcceptance(textToSend) &&
            lastAssistantOfferedPractice(); // regex fallback only if classifier unavailable

      if (shouldTriggerPractice) {
        // Prefer the classifier-extracted theme; fall back to keyword scan of
        // recent turns if the classifier didn't give us one.
        const theme = classifiedTheme || extractThemeFromConversation();
        
        if (theme) {
          // Determine difficulty from user rating
          let difficulty: string | undefined;
          if (game) {
            const headers = game.getHeaders();
            const playerColor = userPlayerInfo.playerColor;
            const ratingStr = playerColor === "black" ? headers.BlackElo : headers.WhiteElo;
            const rating = ratingStr ? parseInt(ratingStr) : undefined;
            if (rating) {
              if (rating <= 1200) difficulty = "beginner";
              else if (rating <= 1600) difficulty = "intermediate";
              else if (rating <= 2000) difficulty = "advanced";
              else difficulty = "expert";
            }
          }

          // User accepted practice offer - fetch puzzles and redirect
          setMessages((prev) => [
            ...prev,
            userMessage,
            { role: "assistant", content: `Great! Let me gather some ${theme} puzzles${difficulty ? ` at ${difficulty} level` : ""} for you...` },
          ]);
          
          try {
            const normalizedTheme = normalizeThemeName(theme);
            // The static puzzle DB (Lichess-derived) uses camelCase theme IDs
            // like `mate`, `backRankMate`, `trappedPiece`, etc., while
            // normalizeThemeName emits kebab-case like `mating-attack`. Pass
            // both so we hit whichever the local index actually stores.
            const themeVariants = Array.from(
              new Set([normalizedTheme, theme].filter(Boolean))
            );
            const puzzles = await getPuzzlesByTheme(themeVariants, 20, difficulty);
            
            if (puzzles.length > 0) {
              setPracticePuzzles(puzzles);
              setCurrentPuzzleIndex(0);
              setPracticeTheme(normalizedTheme);
              
              // Redirect with theme and difficulty preset
              const query: Record<string, string> = { theme: normalizedTheme };
              if (difficulty) query.difficulty = difficulty;
              router.push({ pathname: "/practice", query });
            } else {
              setMessages((prev) => [
                ...prev,
                {
                  role: "assistant",
                  content: "I couldn't find puzzles for that theme right now. Let's continue analyzing your game!",
                },
              ]);
            }
          } catch (error) {
            console.error("Error fetching practice puzzles:", error);
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: "Sorry, I encountered an error fetching puzzles. Let's continue analyzing your game!",
              },
            ]);
          }
          
          if (!messageText) {
            setInput("");
          }
          return; // Don't make API call for practice acceptance
        }
      }

      // All user messages go to the LLM — no more forced canned responses
      // The AI already speaks first via auto-greet when a game is loaded
      gameLoadedRef.current = false; // Reset flag if set

      setMessages((prev) => [...prev, userMessage]);
      if (!messageText) {
        setInput("");
      }
      setIsLoading(true);

      // Create a new abort controller for this request
      abortControllerRef.current = new AbortController();

      try {
        // Determine user color - prioritize detected player color from username, fallback to board orientation
        let userColor: "w" | "b";
        if (userPlayerInfo.playerColor) {
          userColor = userPlayerInfo.playerColor === "white" ? "w" : "b";
        } else {
          userColor = boardOrientation ? "w" : "b";
        }

        // Extract user rating from game headers if available
        let userRating: number | undefined = undefined;
        if (game) {
          const headers = game.getHeaders();
          if (userPlayerInfo.playerColor === "white" && headers.WhiteElo) {
            userRating = parseInt(headers.WhiteElo);
          } else if (userPlayerInfo.playerColor === "black" && headers.BlackElo) {
            userRating = parseInt(headers.BlackElo);
          }
        }

        // Build conversation history for multi-turn context (exclude system messages)
        const conversationHistory = messages
          .filter((m) => m.role !== "system")
          .map((m) => ({ role: m.role, content: m.content }));

        let data: any;

        // TWO-TIER ROUTING:
        // - First message (or no contextId): Full deep analysis via /api/enhanced-analysis (gpt-4o, 5-15s)
        // - Follow-up messages: Fast chat via /api/chat (gpt-4o-mini, 2-5s) using cached context
        const hasContext = analysisContextIdRef.current && conversationHistory.some(m => m.role === "assistant");

        if (hasContext) {
          // === FAST PATH: Follow-up via /api/chat ===
          const chatResponse = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contextId: analysisContextIdRef.current,
              userMessage: textToSend,
              conversationHistory: conversationHistory,
            }),
            signal: abortControllerRef.current.signal,
          });

          if (chatResponse.status === 404) {
            // Context expired — fall through to full analysis below
            console.log("Analysis context expired, falling back to full analysis");
            analysisContextIdRef.current = null;
          } else if (!chatResponse.ok) {
            const errorData = await chatResponse.json();
            throw new Error(errorData.error || `HTTP error! status: ${chatResponse.status}`);
          } else {
            data = await chatResponse.json();
          }
        }

        // === DEEP PATH: Full analysis via /api/enhanced-analysis (first message or context expired) ===
        if (!data) {
          const requestData: any = {
            analysisType: "game_review",
            model: "gpt-4o",
            includeAIAnalysis: true,
            playerColor: userColor,
            systemPrompt: systemPrompt,
            userMessage: textToSend,
            conversationHistory: conversationHistory,
            responseLength: "comprehensive",
            boardOrientation: boardOrientation,
            gameEval: gameEval,
            // Include username and player color for context
            username: userPlayerInfo.username || undefined,
            playerColorName: userPlayerInfo.playerColor || undefined,
            userRating: userRating || 1500, // Default to 1500 if rating unknown
          };

          // Add game data based on what's available
          if (game) {
            requestData.moveHistory = game.history();
            requestData.fen = game.fen();
          } else if (position) {
            requestData.fen = position;
          }

          const response = await fetch("/api/enhanced-analysis", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestData),
            signal: abortControllerRef.current.signal,
          });

          if (!response.ok) {
            const errorData = await response.json();
            const errorMessage =
              errorData.error ||
              errorData.details ||
              `HTTP error! status: ${response.status}`;
            console.error("API Error:", errorData);
            throw new Error(errorMessage);
          }

          data = await response.json();

          // Store contextId for fast follow-up chat
          if (data.gameAnalysis?.contextId) {
            analysisContextIdRef.current = data.gameAnalysis.contextId;
          }

          // Store puzzle recommendations if available
          if (data.gameAnalysis?.puzzleRecommendations) {
            setPuzzleRecommendations(data.gameAnalysis.puzzleRecommendations);
          }
        }

        // Add assistant message with the analysis
        let assistantContent = "";

        if (data.gameAnalysis) {
          assistantContent += data.gameAnalysis.analysis;
        } else if (data.currentPositionAnalysis) {
          assistantContent += data.currentPositionAnalysis.analysis;
        }

        if (data.aiAnalysisError) {
          assistantContent += `\n\n**Note:** ${data.aiAnalysisError}`;
        }

        // Scan response for tactical themes and append practice button
        if (assistantContent && TACTICAL_THEMES) {
          const contentLower = assistantContent.toLowerCase();
          // Map of keywords → [themeKey, displayName]
          const themeKeywords: Array<[string[], string, string]> = [
            [["fork", "forks", "forking"], "fork", "Fork"],
            [["pin", "pins", "pinning", "pinned"], "pin", "Pin"],
            [["skewer", "skewers"], "skewer", "Skewer"],
            [["back rank", "back-rank", "backrank"], "backRankMate", "Back Rank"],
            [["discovered attack", "discovered check"], "discoveredAttack", "Discovered Attack"],
            [["double check"], "doubleCheck", "Double Check"],
            [["deflection", "deflect"], "deflection", "Deflection"],
            [["sacrifice", "sacrifices"], "sacrifice", "Sacrifice"],
            [["trapped piece", "trapping"], "trappedPiece", "Trapped Piece"],
            [["hanging piece", "hanging"], "hangingPiece", "Hanging Piece"],
            [["overloaded", "overloading"], "overloading", "Overloading"],
            [["zwischenzug", "in-between", "intermezzo"], "intermezzo", "Zwischenzug"],
            [["endgame", "end game"], "endgame", "Endgame"],
            [["mate in", "checkmate pattern", "mating pattern"], "mate", "Checkmate Patterns"],
          ];

          // Find the first (most relevant) theme mentioned in the analysis of a mistake
          const hasMistakeContext = /blunder|mistake|inaccuracy|error|missed|should have|better was|instead of/i.test(contentLower);
          if (hasMistakeContext) {
            for (const [keywords, themeKey, displayName] of themeKeywords) {
              if (keywords.some((kw) => contentLower.includes(kw))) {
                assistantContent += `\n\n[PRACTICE:${themeKey}:${displayName}]`;
                break; // Only add one button per response
              }
            }
          }
        }

        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: assistantContent },
        ]);
      } catch (error: unknown) {
        if (error instanceof Error && error.name === "AbortError") {
          console.log("Request aborted");
        } else {
          console.error("Error sending message:", error);
          const errMsg =
            error instanceof Error && error.message
              ? error.message
              : "Unknown error";
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Sorry, I encountered an error: ${errMsg}. Please try again.`,
            },
          ]);
        }
      } finally {
        setIsLoading(false);
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    [messages, game, position, boardOrientation, gameEval, input, router, puzzleSolvedStatus, setPracticePuzzles, setCurrentPuzzleIndex, setPracticeTheme, userProfile]
  );

  // Handle move analysis requests from moves panel
  useEffect(() => {
    if (moveAnalysisRequest && !isLoading) {
      const { moveNumber, move } = moveAnalysisRequest;
      const analysisMessage = `Analyze move ${moveNumber} (${move}) in detail. Explain the short-term and long-term consequences, alternatives, and which principles were followed or violated.`;

      // Clear the request immediately to prevent duplicate triggers
      setMoveAnalysisRequest(null);

      // Trigger send directly with the message
      handleSendMessage(analysisMessage);
    }
  }, [
    moveAnalysisRequest,
    isLoading,
    setMoveAnalysisRequest,
    handleSendMessage,
  ]);

  const handleSend = async () => {
    await handleSendMessage();
  };

  // Helper function to process React children recursively
  const processChildren = (children: React.ReactNode): React.ReactNode => {
    if (typeof children === "string") {
      return renderTextWithClickableMoves(children, game);
    }
    if (Array.isArray(children)) {
      return children.map((child, index) => (
        <React.Fragment key={index}>{processChildren(child)}</React.Fragment>
      ));
    }
    if (React.isValidElement(children)) {
      return React.cloneElement(children, {
        ...children.props,
        children: processChildren(children.props.children),
      });
    }
    return children;
  };

  // Helper function to enhance move citation in AI responses
  const enhanceMoveCitation = (content: string, game: Chess | null): string => {
    if (!game) return content;

    const gameHistory = game.history();
    if (gameHistory.length === 0) return content;

    // SAN move pattern (captures piece moves, pawn moves, castling)
    const sanPattern = /([NBRQK][a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?|[a-h]x[a-h][1-8](?:=[NBRQ])?[+#]?|[a-h][1-8](?:=[NBRQ])?[+#]?|O-O(?:-O)?[+#]?)/g;

    // Find all bare SAN moves that DON'T already have a move number prefix
    const result = content.replace(sanPattern, (match, move, offset) => {
      // Check if this move is already preceded by a move number like "14." or "14..."
      const before = content.slice(Math.max(0, offset - 10), offset);
      if (/\d+\.{1,3}\s*$/.test(before)) {
        return match; // Already has a move number — don't double-number
      }

      // Check if this is inside a heading/label like "Best Move:" — we want to number these
      // But skip things that look like square references, not moves (e.g., "e4" in "pawn on e4")
      const contextBefore = content.slice(Math.max(0, offset - 30), offset).toLowerCase();
      if (/(?:on|at|square|from|to)\s*$/.test(contextBefore)) {
        return match; // This is a square reference, not a move
      }

      // Try to find the move in game history (for played moves)
      const moveIndex = gameHistory.findIndex((h) => h === move);
      if (moveIndex >= 0) {
        const moveNum = Math.floor(moveIndex / 2) + 1;
        const isBlack = moveIndex % 2 === 1;
        return `${moveNum}.${isBlack ? ".." : ""} ${move}`;
      }

      // For engine-suggested moves NOT in game history, try to infer move number from nearby context
      const nearbyContext = content.slice(Math.max(0, offset - 80), offset);
      const nearbyMoveNum = nearbyContext.match(/(?:Move\s+(\d+)|(\d+)\.)/i);
      if (nearbyMoveNum) {
        const inferredNum = parseInt(nearbyMoveNum[1] || nearbyMoveNum[2]);
        if (inferredNum > 0 && inferredNum <= Math.ceil(gameHistory.length / 2) + 5) {
          return `${inferredNum}. ${move}`;
        }
      }

      return match; // Can't determine move number — leave as-is
    });

    return result;
  };

  const handleFeedback = (messageIndex: number, rating: "positive" | "negative") => {
    // Toggle off if same rating clicked again
    if (messageFeedback[messageIndex] === rating) {
      setMessageFeedback((prev) => {
        const next = { ...prev };
        delete next[messageIndex];
        return next;
      });
      return;
    }

    setMessageFeedback((prev) => ({ ...prev, [messageIndex]: rating }));

    // Find the actual message from the filtered list
    const filteredMessages = messages.filter((m) => m.role !== "system");
    const message = filteredMessages[messageIndex];
    if (!message) return;

    // Store feedback
    try {
      storeFeedback({
        rating,
        responseText: message.content.slice(0, 500),
        fen: game?.fen(),
        coachId: selectedCoachId,
      });
    } catch (e) {
      console.warn("Failed to store feedback:", e);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <ChatContainer elevation={3}>
      <Box sx={{ mb: 2, position: "relative" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="h6" gutterBottom sx={{ mb: 0 }}>
          AI Chess Coach
        </Typography>
          <MaiaStatusIndicator size="small" />
        </Box>
        <ExpandButton onClick={() => setIsExpanded(!isExpanded)} size="small">
          {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </ExpandButton>
      </Box>

      <MessagesContainer isExpanded={isExpanded}>
        {messages
          .filter((m) => m.role !== "system")
          .map((message, index) => (
            <MessageBubble key={index} isUser={message.role === "user"}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  // Preserve existing code component
                  code({ className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || "");
                    const language = match ? match[1] : "";
                    const isCodeBlock = Boolean(match);

                    return isCodeBlock ? (
                      <SyntaxHighlighter
                        style={vscDarkPlus}
                        language={language}
                        PreTag="div"
                        customStyle={{
                          margin: 0,
                          borderRadius: "8px",
                          fontSize: "0.85em",
                        }}
                      >
                        {String(children).replace(/\n$/, "")}
                      </SyntaxHighlighter>
                    ) : (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    );
                  },
                  // Preserve existing table component
                  table({ children }: any) {
                    return (
                      <div style={{ overflowX: "auto", marginBottom: "1rem" }}>
                        <table style={{ minWidth: "100%" }}>{children}</table>
                      </div>
                    );
                  },
                  // Preserve existing blockquote component
                  blockquote({ children }: any) {
                    return (
                      <blockquote
                        style={{
                          borderLeft: "4px solid #1976d2",
                          paddingLeft: "16px",
                          margin: "16px 0",
                          fontStyle: "italic",
                          backgroundColor: "#f5f5f5",
                          borderRadius: "4px",
                          padding: "8px 16px",
                        }}
                      >
                        {children}
                      </blockquote>
                    );
                  },
                  // Handle paragraphs and other text-containing elements
                  p({ children }) {
                    // Process children recursively to handle React elements
                    return <p>{processChildren(children)}</p>;
                  },
                  li({ children }) {
                    // Process children recursively to handle React elements
                    return <li>{processChildren(children)}</li>;
                  },
                  strong({ children }) {
                    return <strong>{processChildren(children)}</strong>;
                  },
                  em({ children }) {
                    return <em>{processChildren(children)}</em>;
                  },
                  h1({ children }) {
                    return <h1>{processChildren(children)}</h1>;
                  },
                  h2({ children }) {
                    return <h2>{processChildren(children)}</h2>;
                  },
                  h3({ children }) {
                    return <h3>{processChildren(children)}</h3>;
                  },
                  h4({ children }) {
                    return <h4>{processChildren(children)}</h4>;
                  },
                  td({ children }: any) {
                    return <td>{processChildren(children)}</td>;
                  },
                  th({ children }: any) {
                    return <th>{processChildren(children)}</th>;
                  },
                }}
              >
                {message.role === "assistant" ? enhanceMoveCitation(message.content, game ?? null) : message.content}
              </ReactMarkdown>
              {isStreaming &&
                index ===
                  messages.filter((m) => m.role !== "system").length - 1 &&
                message.role === "assistant" && (
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      mt: 1,
                      opacity: 0.7,
                    }}
                  >
                    <CircularProgress size={12} sx={{ mr: 1 }} />
                    <Typography variant="caption" sx={{ fontStyle: "italic" }}>
                      Thinking...
                    </Typography>
                  </Box>
                )}
              {message.role === "assistant" && !isStreaming && (
                <Box
                  sx={{
                    display: "flex",
                    gap: 0.5,
                    mt: 0.5,
                    opacity: messageFeedback[index] ? 1 : 0.4,
                    "&:hover": { opacity: 1 },
                    transition: "opacity 0.2s",
                  }}
                >
                  <IconButton
                    size="small"
                    onClick={() => handleFeedback(index, "positive")}
                    sx={{
                      padding: "2px",
                      color: messageFeedback[index] === "positive" ? "#4caf50" : "inherit",
                    }}
                  >
                    {messageFeedback[index] === "positive" ? (
                      <ThumbUpIcon sx={{ fontSize: 14 }} />
                    ) : (
                      <ThumbUpOutlinedIcon sx={{ fontSize: 14 }} />
                    )}
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => handleFeedback(index, "negative")}
                    sx={{
                      padding: "2px",
                      color: messageFeedback[index] === "negative" ? "#f44336" : "inherit",
                    }}
                  >
                    {messageFeedback[index] === "negative" ? (
                      <ThumbDownIcon sx={{ fontSize: 14 }} />
                    ) : (
                      <ThumbDownOutlinedIcon sx={{ fontSize: 14 }} />
                    )}
                  </IconButton>
                </Box>
              )}
            </MessageBubble>
          ))}
        <div ref={messagesEndRef} />
      </MessagesContainer>

      {/* Display puzzle recommendations for detected mistakes */}
      {puzzleRecommendations.length > 0 && (
        <Box sx={{ mt: 2, mb: 2 }}>
          <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
            🎯 Targeted Practice Puzzles
          </Typography>
          {puzzleRecommendations.map((recommendation, idx) => (
            <Box key={idx} sx={{ mb: 3 }}>
              <ContextualPuzzleRecommendations
                fen={recommendation.fen}
                movePlayed={recommendation.movePlayed}
                correctMove={recommendation.correctMove}
                evalBefore={recommendation.evalBefore}
                evalAfter={recommendation.evalAfter}
                tacticalMotifs={recommendation.tacticalMotifs}
                userRating={userProfile?.rating}
                mistakeDescription={`Move ${recommendation.moveNumber}: ${recommendation.explanation}`}
              />
            </Box>
          ))}
        </Box>
      )}

      <Box sx={{ display: "flex", gap: 1, alignItems: "flex-end" }}>
        <TextField
          fullWidth
          multiline
          maxRows={4}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Ask specific questions about moves or positions..."
          disabled={isLoading}
        />

        {/* Quick Analysis Button */}
        <IconButton
          onClick={() => {
            if (!isLoading && !input.trim()) {
              setInput("analyze my game");
              // Use the existing handleSend function to ensure proper state management
              setTimeout(() => {
                handleSend();
              }, 50);
            }
          }}
          disabled={isLoading}
          sx={{
            background: "linear-gradient(135deg, #FF8C42 0%, #FF6B42 100%)",
            color: "white",
            width: 48,
            height: 48,
            borderRadius: 2,
            "&:hover": {
              background: isLoading
                ? "linear-gradient(135deg, #FF8C42 0%, #FF6B42 100%)"
                : "linear-gradient(135deg, #FF6B42 0%, #FF5722 100%)",
            },
            "&.Mui-disabled": {
              background: "linear-gradient(135deg, #FF8C42 0%, #FF6B42 100%)",
              opacity: 0.6,
              color: "white",
            },
          }}
          title="Analyze My Game"
        >
          {isLoading ? (
            <CircularProgress size={20} sx={{ color: "white" }} />
          ) : (
            <>🎯</>
          )}
        </IconButton>

        <IconButton
          color="primary"
          onClick={handleSend}
          disabled={isLoading || !input.trim()}
        >
          {isLoading ? <CircularProgress size={24} /> : <SendIcon />}
        </IconButton>
      </Box>
    </ChatContainer>
  );
};

export default AICoachChat;
