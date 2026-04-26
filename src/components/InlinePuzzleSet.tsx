"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Paper, Typography, Chip, Link } from "@mui/material";
import { styled, keyframes } from "@mui/material/styles";
import { Chessboard } from "react-chessboard";
import { Chess, Square } from "chess.js";
import type { ChessPuzzle } from "@/lib/chessPuzzlesService";

/**
 * InlinePuzzleSet — 3 puzzles solved inside the chat bubble (no /practice nav).
 *
 * Move-handler convention mirrored from src/components/PracticeChessBoard.tsx
 * `onPieceDrop` (lines 226–335):
 *   - The puzzle FEN's side-to-move is the OPPONENT, not the user.
 *   - solution[0] = opponent's setup move, auto-played 600ms after load.
 *   - solution[1] = expected user first move; alternating thereafter.
 *   - On wrong move, do NOT reset the position — clear the red highlight after
 *     1200ms and let the user retry from the same position (matches legacy).
 *
 * Mod 1 (skip): after 2 wrong attempts on the same puzzle, show "Skip" link.
 */

const flashGreen = keyframes`
  0%   { box-shadow: 0 0 0 0 rgba(76, 175, 80, 0); }
  20%  { box-shadow: 0 0 0 6px rgba(76, 175, 80, 0.55); }
  100% { box-shadow: 0 0 0 0 rgba(76, 175, 80, 0); }
`;

const flashRed = keyframes`
  0%   { box-shadow: 0 0 0 0 rgba(220, 50, 50, 0); }
  20%  { box-shadow: 0 0 0 6px rgba(220, 50, 50, 0.65); }
  100% { box-shadow: 0 0 0 0 rgba(220, 50, 50, 0); }
`;

const StyledPaper = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(2),
  marginTop: theme.spacing(1.5),
  maxWidth: 480,
  background:
    "linear-gradient(145deg, rgba(76, 175, 80, 0.10) 0%, rgba(46, 125, 50, 0.14) 100%)",
  border: "1px solid rgba(76, 175, 80, 0.35)",
  borderRadius: "12px",
  boxShadow: "0 4px 12px rgba(76, 175, 80, 0.18)",
}));

const BoardWrap = styled(Box, {
  shouldForwardProp: (prop) => prop !== "flash",
})<{ flash: "idle" | "green" | "red" }>(({ flash }) => ({
  borderRadius: "8px",
  margin: "0 auto",
  width: "fit-content",
  animation:
    flash === "green"
      ? `${flashGreen} 600ms ease-out`
      : flash === "red"
      ? `${flashRed} 600ms ease-out`
      : "none",
}));

const BOARD_MAX_WIDTH = 360;
const BOARD_MIN_WIDTH = 240;
const PAPER_HORIZONTAL_PADDING = 32; // 2 * theme.spacing(2)
const OPPONENT_SETUP_DELAY_MS = 600;
const OPPONENT_RESPONSE_DELAY_MS = 400;
const WRONG_FLASH_MS = 1200;
const SOLVED_ADVANCE_DELAY_MS = 700;
const WRONG_ATTEMPTS_BEFORE_SKIP = 2;

type Status = "loading" | "playing" | "wrong" | "solved";

function parseSolutionMoves(
  fen: string,
  moves: string[]
): { from: Square; to: Square; promotion?: string }[] {
  const parsed: { from: Square; to: Square; promotion?: string }[] = [];
  const g = new Chess(fen);
  for (const m of moves) {
    const from = m.slice(0, 2) as Square;
    const to = m.slice(2, 4) as Square;
    const promotion = m.length > 4 ? m[4] : undefined;
    try {
      const result = g.move({ from, to, promotion });
      if (result) parsed.push({ from, to, promotion });
      else break;
    } catch {
      break;
    }
  }
  return parsed;
}

interface InlinePuzzleSetProps {
  puzzles: ChessPuzzle[];
  displayTheme?: string;
}

export const InlinePuzzleSet: React.FC<InlinePuzzleSetProps> = ({
  puzzles,
  displayTheme,
}) => {
  const trimmed = useMemo(() => puzzles.slice(0, 3), [puzzles]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [boardWidth, setBoardWidth] = useState<number>(BOARD_MAX_WIDTH);
  const [game, setGame] = useState<Chess>(() => new Chess());
  const [status, setStatus] = useState<Status>("loading");
  const [moveIndex, setMoveIndex] = useState(0);
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [lastMoveSquares, setLastMoveSquares] =
    useState<{ from: Square; to: Square } | null>(null);
  const [wrongSquare, setWrongSquare] = useState<Square | null>(null);
  const [flash, setFlash] = useState<"idle" | "green" | "red">("idle");
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const puzzleIdRef = useRef<string | null>(null);

  const currentPuzzle = trimmed[currentIndex];
  const done = currentIndex >= trimmed.length;

  const solutionMoves = useMemo(() => {
    if (!currentPuzzle) return [];
    const moves = currentPuzzle.solution || currentPuzzle.moves || [];
    return parseSolutionMoves(currentPuzzle.fen, moves);
  }, [currentPuzzle]);

  // Init / re-init on puzzle change
  useEffect(() => {
    if (!currentPuzzle) return;
    const puzzleId = currentPuzzle.id;
    puzzleIdRef.current = puzzleId;

    const newGame = new Chess(currentPuzzle.fen);
    const opponentColor = newGame.turn();
    const userColor = opponentColor === "w" ? "black" : "white";

    setOrientation(userColor);
    setGame(newGame);
    setMoveIndex(0);
    setStatus("loading");
    setLastMoveSquares(null);
    setWrongSquare(null);
    setFlash("idle");
    setWrongAttempts(0);

    const timer = setTimeout(() => {
      if (puzzleIdRef.current !== puzzleId) return;
      const moves = currentPuzzle.solution || currentPuzzle.moves || [];
      if (moves.length === 0) {
        setStatus("playing");
        return;
      }
      const m = moves[0];
      const from = m.slice(0, 2) as Square;
      const to = m.slice(2, 4) as Square;
      const promotion = m.length > 4 ? m[4] : undefined;
      try {
        const g = new Chess(newGame.fen());
        g.move({ from, to, promotion });
        setGame(g);
        setMoveIndex(1);
        setLastMoveSquares({ from, to });
        setStatus("playing");
      } catch {
        setStatus("playing");
        setMoveIndex(0);
      }
    }, OPPONENT_SETUP_DELAY_MS);

    return () => clearTimeout(timer);
  }, [currentPuzzle]);

  const advanceToNext = useCallback(() => {
    setCurrentIndex((i) => i + 1);
  }, []);

  // Responsive board sizing — clamp to container width so the board never
  // overflows a narrow chat bubble or gets squished by an ultra-wide one.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const compute = () => {
      const inner = el.clientWidth - PAPER_HORIZONTAL_PADDING;
      const w = Math.max(BOARD_MIN_WIDTH, Math.min(BOARD_MAX_WIDTH, inner));
      setBoardWidth(w);
    };
    compute();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const playOpponentResponse = useCallback(
    (g: Chess, nextIdx: number, puzzleId: string) => {
      setTimeout(() => {
        if (puzzleIdRef.current !== puzzleId) return;
        const m = solutionMoves[nextIdx];
        if (!m) return;
        try {
          const g2 = new Chess(g.fen());
          g2.move({ from: m.from, to: m.to, promotion: m.promotion });
          setGame(g2);
          setMoveIndex(nextIdx + 1);
          setLastMoveSquares({ from: m.from, to: m.to });

          if (nextIdx + 1 >= solutionMoves.length) {
            setStatus("solved");
            setFlash("green");
            setTimeout(() => {
              if (puzzleIdRef.current === puzzleId) advanceToNext();
            }, SOLVED_ADVANCE_DELAY_MS);
          }
        } catch {
          /* opponent move failed — leave puzzle in current state */
        }
      }, OPPONENT_RESPONSE_DELAY_MS);
    },
    [solutionMoves, advanceToNext]
  );

  const onPieceDrop = useCallback(
    (sourceSquare: string, targetSquare: string, piece: string): boolean => {
      if (status !== "playing") return false;
      if (!currentPuzzle) return false;
      if (moveIndex >= solutionMoves.length) return false;

      const expected = solutionMoves[moveIndex];
      const from = sourceSquare as Square;
      const to = targetSquare as Square;

      const isMatch = from === expected.from && to === expected.to;
      if (!isMatch) {
        setStatus("wrong");
        setWrongSquare(to);
        setWrongAttempts((n) => n + 1);
        setFlash("red");
        const puzzleId = currentPuzzle.id;
        setTimeout(() => {
          if (puzzleIdRef.current === puzzleId) {
            setStatus("playing");
            setWrongSquare(null);
            setFlash("idle");
          }
        }, WRONG_FLASH_MS);
        return false;
      }

      try {
        const g = new Chess(game.fen());
        g.move({ from, to, promotion: expected.promotion });
        setGame(g);
        setLastMoveSquares({ from, to });
        setWrongSquare(null);

        const nextIdx = moveIndex + 1;
        setMoveIndex(nextIdx);

        if (nextIdx >= solutionMoves.length) {
          setStatus("solved");
          setFlash("green");
          const puzzleId = currentPuzzle.id;
          setTimeout(() => {
            if (puzzleIdRef.current === puzzleId) advanceToNext();
          }, SOLVED_ADVANCE_DELAY_MS);
        } else {
          playOpponentResponse(g, nextIdx, currentPuzzle.id);
        }
        return true;
      } catch {
        return false;
      }
    },
    [
      status,
      moveIndex,
      solutionMoves,
      game,
      currentPuzzle,
      playOpponentResponse,
      advanceToNext,
    ]
  );

  const customSquareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    if (lastMoveSquares) {
      styles[lastMoveSquares.from] = {
        backgroundColor: "rgba(255, 170, 0, 0.4)",
      };
      styles[lastMoveSquares.to] = {
        backgroundColor: "rgba(255, 170, 0, 0.5)",
      };
    }
    if (wrongSquare) {
      styles[wrongSquare] = { backgroundColor: "rgba(220, 50, 50, 0.6)" };
    }
    return styles;
  }, [lastMoveSquares, wrongSquare]);

  if (trimmed.length === 0) return null;

  if (done) {
    return (
      <StyledPaper ref={containerRef} elevation={2}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
          ✅ Nice work — 3 puzzles done
        </Typography>
        {displayTheme && (
          <Typography variant="caption" color="text.secondary">
            Theme: {displayTheme}
          </Typography>
        )}
      </StyledPaper>
    );
  }

  const turn = game.turn();
  const statusText =
    status === "loading"
      ? "Loading…"
      : status === "wrong"
      ? "Not quite — try again."
      : status === "solved"
      ? "Correct!"
      : turn === "w"
      ? "White to move"
      : "Black to move";

  const showSkip =
    wrongAttempts >= WRONG_ATTEMPTS_BEFORE_SKIP &&
    status !== "solved" &&
    !done;

  return (
    <StyledPaper ref={containerRef} elevation={2}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 1,
          flexWrap: "wrap",
          gap: 1,
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          🧩 Puzzle {currentIndex + 1} of {trimmed.length}
          {currentPuzzle?.rating ? ` · ${currentPuzzle.rating}` : ""}
        </Typography>
        <Chip
          size="small"
          label={statusText}
          color={
            status === "solved"
              ? "success"
              : status === "wrong"
              ? "error"
              : "default"
          }
          variant="outlined"
        />
      </Box>

      <BoardWrap flash={flash}>
        <Chessboard
          id={`InlinePuzzle-${currentPuzzle?.id ?? currentIndex}`}
          position={game.fen()}
          onPieceDrop={onPieceDrop}
          boardOrientation={orientation}
          boardWidth={boardWidth}
          customBoardStyle={{
            borderRadius: "4px",
            boxShadow: "0 2px 10px rgba(0,0,0,0.4)",
          }}
          customSquareStyles={customSquareStyles}
          isDraggablePiece={({ piece }) => {
            if (status !== "playing") return false;
            const color = piece[0] === "w" ? "w" : "b";
            return color === game.turn();
          }}
          animationDuration={200}
        />
      </BoardWrap>

      {showSkip && (
        <Box sx={{ mt: 1, textAlign: "center" }}>
          <Link
            component="button"
            type="button"
            variant="caption"
            onClick={advanceToNext}
            sx={{ color: "text.secondary", textDecoration: "underline" }}
          >
            Skip this one →
          </Link>
        </Box>
      )}
    </StyledPaper>
  );
};

export default InlinePuzzleSet;
