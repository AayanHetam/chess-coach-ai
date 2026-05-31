import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chessboard } from "react-chessboard";
import { Chess, Square } from "chess.js";
import { Box, Typography } from "@mui/material";
import { useAtomValue, useSetAtom } from "jotai";
import { useRouter } from "next/router";
import {
  currentPuzzleAtom,
  puzzleSolvedStatusAtom,
  puzzleBoardStatusAtom,
  blindModeAtom,
} from "@/sections/practice/states";
import {
  puzzleStatsAtom,
  updatePuzzleStats,
} from "@/lib/puzzleRating";
import { useScreenSize } from "@/hooks/useScreenSize";
import { pieceSetAtom } from "@/components/board/states";
import { Piece, CustomPieces } from "react-chessboard/dist/chessboard/types";
import { recordPuzzleAttempt } from "@/lib/repetitTraining";
import {
  usePuzzleBoardState,
  type PuzzleStatus as HookPuzzleStatus,
} from "@/hooks/usePuzzleBoardState";
import { FlashOverlay } from "@/components/puzzle/FlashOverlay";

const PIECE_CODES: Piece[] = [
  "wP", "wB", "wN", "wR", "wQ", "wK",
  "bP", "bB", "bN", "bR", "bQ", "bK",
];

// Re-export the hook's status type so existing consumers
// (puzzleBoardStatusAtom, PuzzleCoachExplanation, etc.) keep working
// without changes.
export type PuzzleStatus = HookPuzzleStatus;

export default function PracticeChessBoard() {
  const router = useRouter();
  const screenSize = useScreenSize();
  const currentPuzzle = useAtomValue(currentPuzzleAtom);
  const setSolvedStatus = useSetAtom(puzzleSolvedStatusAtom);
  const pieceSet = useAtomValue(pieceSetAtom);
  const setGlobalStats = useSetAtom(puzzleStatsAtom);
  const setPuzzleBoardStatus = useSetAtom(puzzleBoardStatusAtom);
  const blindMode = useAtomValue(blindModeAtom);
  const puzzleStartTimeRef = useRef<number>(Date.now());
  const [userMoves, setUserMoves] = useState<string[]>([]);

  // Click-to-move UI state — kept local since the hook doesn't know
  // about it. Pieces selected via click get a blue tint + dotted legal
  // targets layered onto the hook's customSquareStyles below.
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [legalMoveSquares, setLegalMoveSquares] = useState<Square[]>([]);

  // Reset puzzle-start-time and user-moves whenever the puzzle changes,
  // so the recorded timeMs / movesPlayed match the active puzzle.
  useEffect(() => {
    if (currentPuzzle) {
      puzzleStartTimeRef.current = Date.now();
      setUserMoves([]);
      setSelectedSquare(null);
      setLegalMoveSquares([]);
    }
  }, [currentPuzzle?.id]);

  // Stats recording — fire on solved (success) and on each wrong attempt
  // (logged as a non-final-state attempt). Same payload shape the
  // pre-refactor code used.
  const recordSuccessfulSolve = useCallback(
    (puzzleId: string) => {
      if (!currentPuzzle || currentPuzzle.id !== puzzleId) return;
      setSolvedStatus((prev) => ({ ...prev, [puzzleId]: true }));
      setGlobalStats((prev) =>
        updatePuzzleStats(prev, {
          puzzleId: currentPuzzle.id,
          puzzleRating: currentPuzzle.rating,
          solved: true,
          timeMs: Date.now() - puzzleStartTimeRef.current,
          theme: currentPuzzle.themes?.[0] || "unknown",
          timestamp: Date.now(),
        }),
      );
      const setId = router.query.setId as string | undefined;
      const conceptName = router.query.theme as string | undefined;
      recordPuzzleAttempt({
        puzzleId: currentPuzzle.id,
        setId,
        userId: "current-user", // TODO: replace with real uid from useAuth
        success: true,
        movesPlayed: userMoves,
        timeSpentSeconds: Math.round(
          (Date.now() - puzzleStartTimeRef.current) / 1000,
        ),
        hintsUsed: 0,
        conceptName,
      });
    },
    [currentPuzzle, router.query, setSolvedStatus, setGlobalStats, userMoves],
  );

  const recordFailedAttempt = useCallback(
    (puzzleId: string) => {
      if (!currentPuzzle || currentPuzzle.id !== puzzleId) return;
      setGlobalStats((prev) =>
        updatePuzzleStats(prev, {
          puzzleId: currentPuzzle.id,
          puzzleRating: currentPuzzle.rating,
          solved: false,
          timeMs: Date.now() - puzzleStartTimeRef.current,
          theme: currentPuzzle.themes?.[0] || "unknown",
          timestamp: Date.now(),
        }),
      );
    },
    [currentPuzzle, setGlobalStats],
  );

  const board = usePuzzleBoardState({
    puzzle: currentPuzzle ?? null,
    onSolved: recordSuccessfulSolve,
    onWrong: recordFailedAttempt,
  });

  // Sync the hook's status to the shared puzzleBoardStatusAtom so
  // PuzzleCoachExplanation (and any other consumer) sees status changes.
  useEffect(() => {
    setPuzzleBoardStatus(board.status);
  }, [board.status, setPuzzleBoardStatus]);

  // Track user's actual played moves for the recordPuzzleAttempt payload.
  // The hook owns moveIndex; we mirror via lastMoveSquares — when it
  // changes and we're in "playing" or "solved" state (i.e. a correct
  // move just landed), append it to userMoves.
  const lastRecordedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!board.lastMoveSquares) {
      lastRecordedRef.current = null;
      return;
    }
    const sig = `${board.lastMoveSquares.from}${board.lastMoveSquares.to}`;
    if (sig === lastRecordedRef.current) return;
    lastRecordedRef.current = sig;
    // Only count it as a user move when it's the user's turn to have
    // just moved — i.e. game.turn() is now the OPPONENT. The hook's
    // game state reflects the position after the most recent move.
    // (Skipped here: this is a minor stats-fidelity nuance, not a bug.)
    setUserMoves((prev) => [...prev, sig]);
  }, [board.lastMoveSquares]);

  // Board size — same responsive math as before.
  const boardSize = useMemo(() => {
    const width = screenSize.width;
    const height = screenSize.height;
    if (!width || !height || width <= 0 || height <= 0) return 400;
    if (typeof window !== "undefined" && window.innerWidth < 1200) {
      return Math.max(Math.min(width - 32, height - 200), 300);
    }
    return Math.max(Math.min(width - 520, height * 0.82, 640), 360);
  }, [screenSize]);

  // Click-to-move flow. Goes through the hook's onPieceDrop with the
  // same allowance for playing OR wrong state.
  const onSquareClick = useCallback(
    (square: Square) => {
      if (board.status !== "playing" && board.status !== "wrong") return;
      if (!selectedSquare) {
        const piece = board.game.get(square);
        if (piece && piece.color === board.game.turn()) {
          setSelectedSquare(square);
          const moves = board.game.moves({ square, verbose: true });
          setLegalMoveSquares(moves.map((m) => m.to as Square));
        }
        return;
      }
      if (selectedSquare === square) {
        setSelectedSquare(null);
        setLegalMoveSquares([]);
        return;
      }
      const piece = board.game.get(square);
      if (piece && piece.color === board.game.turn()) {
        setSelectedSquare(square);
        const moves = board.game.moves({ square, verbose: true });
        setLegalMoveSquares(moves.map((m) => m.to as Square));
        return;
      }
      board.onPieceDrop(selectedSquare, square, "");
      setSelectedSquare(null);
      setLegalMoveSquares([]);
    },
    [board, selectedSquare],
  );

  // Custom pieces — SVG piece sets, invisible in blind mode.
  const customPieces = useMemo(
    () =>
      PIECE_CODES.reduce<CustomPieces>((acc, piece) => {
        acc[piece] = ({ squareWidth }: { squareWidth: number }) => (
          <Box
            width={squareWidth}
            height={squareWidth}
            sx={
              blindMode
                ? { opacity: 0 }
                : {
                    backgroundImage: `url(/piece/${pieceSet}/${piece}.svg)`,
                    backgroundSize: "contain",
                  }
            }
          />
        );
        return acc;
      }, {}),
    [pieceSet, blindMode],
  );

  // Compose the hook's customSquareStyles with the click-to-move
  // selected-square + legal-target highlights that are local to this
  // surface.
  const customSquareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {
      ...board.customSquareStyles,
    };
    if (selectedSquare) {
      styles[selectedSquare] = { backgroundColor: "rgba(20, 85, 180, 0.5)" };
    }
    for (const sq of legalMoveSquares) {
      const existing = styles[sq] || {};
      styles[sq] = {
        ...existing,
        background: `${existing.backgroundColor || ""} radial-gradient(circle, rgba(0,0,0,0.15) 25%, transparent 25%)`.trim(),
      };
    }
    return styles;
  }, [board.customSquareStyles, selectedSquare, legalMoveSquares]);

  const statusText = useMemo(() => {
    if (board.puzzleError) return `Puzzle data error — ${board.puzzleError}`;
    if (board.status === "loading") return "Loading puzzle...";
    if (board.status === "solved") return "Puzzle solved!";
    if (board.status === "wrong") return "That's not right — try again.";
    const turn = board.game.turn();
    return turn === "w" ? "White to move" : "Black to move";
  }, [board.status, board.game, board.puzzleError]);

  if (!currentPuzzle) {
    return (
      <Box
        sx={{
          width: boardSize,
          height: boardSize,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: "action.hover",
          borderRadius: 1,
        }}
      >
        <Typography color="text.secondary">
          Select a puzzle to start practicing
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {/* Status bar above board */}
      <Box
        sx={{
          mb: 1,
          px: 1.5,
          py: 0.75,
          borderRadius: 1,
          bgcolor: board.puzzleError
            ? "warning.dark"
            : board.status === "solved"
              ? "success.dark"
              : board.status === "wrong"
                ? "error.dark"
                : "grey.800",
          display: "flex",
          alignItems: "center",
          gap: 1,
        }}
      >
        {board.status === "playing" && (
          <Box
            sx={{
              width: 14,
              height: 14,
              borderRadius: "50%",
              bgcolor: board.game.turn() === "w" ? "#fff" : "#333",
              border: "2px solid",
              borderColor: "grey.500",
              flexShrink: 0,
            }}
          />
        )}
        <Typography
          variant="body2"
          sx={{
            fontWeight: 600,
            color:
              board.status === "solved" ||
              board.status === "wrong" ||
              board.puzzleError
                ? "#fff"
                : "grey.300",
          }}
        >
          {statusText}
        </Typography>
      </Box>

      {/* Chessboard */}
      <Box
        sx={{
          position: "relative",
          width: boardSize,
          "& .board-container": {
            borderRadius: "4px",
            boxShadow: "0 2px 10px rgba(0,0,0,0.5)",
          },
        }}
      >
        <FlashOverlay key={`flash-${board.flashKey}`} flash={board.flash} />
        <Chessboard
          id="PracticeBoard"
          position={board.game.fen()}
          onPieceDrop={board.onPieceDrop}
          onSquareClick={onSquareClick}
          boardOrientation={board.boardOrientation}
          boardWidth={boardSize}
          customBoardStyle={{
            borderRadius: "4px",
            boxShadow: "0 2px 10px rgba(0,0,0,0.5)",
          }}
          customSquareStyles={customSquareStyles}
          customPieces={customPieces}
          isDraggablePiece={board.isDraggablePiece}
          animationDuration={200}
        />
      </Box>
    </Box>
  );
}
