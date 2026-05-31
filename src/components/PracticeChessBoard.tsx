import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chessboard } from "react-chessboard";
import { Chess, Square } from "chess.js";
import { Box, Typography } from "@mui/material";
import { keyframes, styled } from "@mui/material/styles";
import { useAtomValue, useSetAtom } from "jotai";
import { useRouter } from "next/router";
import {
  currentPuzzleAtom,
  puzzleSolvedStatusAtom,
  currentPuzzleIndexAtom,
  practicePuzzlesAtom,
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

const PIECE_CODES: Piece[] = [
  "wP", "wB", "wN", "wR", "wQ", "wK",
  "bP", "bB", "bN", "bR", "bQ", "bK",
];

// Flash overlay — copy of the InlinePuzzleSet pattern. Box-shadow pulse
// animation ringing the board on solved (green) and wrong (red).
// Positioned absolutely with pointer-events:none so it doesn't block
// drags. Parent renders with a `key={flashKey}` that increments on every
// flash trigger so the overlay remounts and the CSS animation restarts
// cleanly — without the remount, repeat flashes (e.g. multiple wrong
// attempts) don't reliably retrigger the same emotion class's animation.
const flashGreen = keyframes`
  0%   { box-shadow: 0 0 0 0 rgba(76, 175, 80, 0); }
  20%  { box-shadow: 0 0 0 8px rgba(76, 175, 80, 0.55); }
  100% { box-shadow: 0 0 0 0 rgba(76, 175, 80, 0); }
`;

const flashRed = keyframes`
  0%   { box-shadow: 0 0 0 0 rgba(220, 50, 50, 0); }
  20%  { box-shadow: 0 0 0 8px rgba(220, 50, 50, 0.65); }
  100% { box-shadow: 0 0 0 0 rgba(220, 50, 50, 0); }
`;

const FlashOverlay = styled(Box, {
  shouldForwardProp: (prop) => prop !== "flash",
})<{ flash: "idle" | "green" | "red" }>(({ flash }) => ({
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  borderRadius: "8px",
  zIndex: 2,
  animation:
    flash === "green"
      ? `${flashGreen} 700ms ease-out`
      : flash === "red"
      ? `${flashRed} 700ms ease-out`
      : "none",
}));

export type PuzzleStatus = "loading" | "playing" | "wrong" | "solved";

/**
 * Parse solution moves array (UCI format like "e2e4") into {from, to, promotion} objects.
 */
function parseSolutionMoves(
  fen: string,
  moves: string[]
): { from: Square; to: Square; promotion?: string }[] {
  const parsed: { from: Square; to: Square; promotion?: string }[] = [];
  const g = new Chess(fen);

  for (const m of moves) {
    // Moves are in UCI format: e2e4, e7e8q etc.
    const from = m.slice(0, 2) as Square;
    const to = m.slice(2, 4) as Square;
    const promotion = m.length > 4 ? m[4] : undefined;

    // Validate the move is legal
    try {
      const result = g.move({ from, to, promotion });
      if (result) {
        parsed.push({ from, to, promotion });
      } else {
        break;
      }
    } catch {
      break;
    }
  }

  return parsed;
}

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
  const [userMoves, setUserMoves] = useState<string[]>([]); // Track user's attempted moves

  // Internal chess game state
  const [game, setGame] = useState<Chess>(new Chess());
  const [statusLocal, setStatusLocal] = useState<PuzzleStatus>("loading");

  // Wrapper to update both local and shared status
  const setStatus = useCallback((s: PuzzleStatus) => {
    setStatusLocal(s);
    setPuzzleBoardStatus(s);
  }, [setPuzzleBoardStatus]);
  const status = statusLocal;
  const [moveIndex, setMoveIndex] = useState(0);
  const [boardOrientation, setBoardOrientation] = useState<"white" | "black">("white");
  const [lastMoveSquares, setLastMoveSquares] = useState<{ from: Square; to: Square } | null>(null);
  const [wrongSquare, setWrongSquare] = useState<Square | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [legalMoveSquares, setLegalMoveSquares] = useState<Square[]>([]);
  // Flash state mirrors InlinePuzzleSet — pulse animation around the
  // board on solved (green) and wrong (red). flashKey bumps on each
  // trigger so the FlashOverlay remounts and the CSS animation restarts.
  const [flash, setFlash] = useState<"idle" | "green" | "red">("idle");
  const [flashKey, setFlashKey] = useState(0);

  // Ref to track puzzle ID to avoid stale closures
  const puzzleIdRef = useRef<string | null>(null);

  // Parsed solution moves
  const solutionMoves = useMemo(() => {
    if (!currentPuzzle) return [];
    const moves = currentPuzzle.solution || currentPuzzle.moves || [];
    return parseSolutionMoves(currentPuzzle.fen, moves);
  }, [currentPuzzle]);

  // Board size calculation
  const boardSize = useMemo(() => {
    const width = screenSize.width;
    const height = screenSize.height;
    if (!width || !height || width <= 0 || height <= 0) return 400;
    if (typeof window !== "undefined" && window.innerWidth < 1200) {
      return Math.max(Math.min(width - 32, height - 200), 300);
    }
    return Math.max(Math.min(width - 520, height * 0.82, 640), 360);
  }, [screenSize]);

  // Initialize puzzle: load FEN, determine orientation, play opponent's first move
  useEffect(() => {
    if (!currentPuzzle) {
      setStatus("loading");
      return;
    }

    const puzzleId = currentPuzzle.id;
    puzzleIdRef.current = puzzleId;

    const newGame = new Chess(currentPuzzle.fen);

    // The side to move in the FEN is the opponent — they play the first move.
    // The user plays as the other side.
    const opponentColor = newGame.turn(); // side that plays first (opponent)
    const userColor = opponentColor === "w" ? "black" : "white";
    setBoardOrientation(userColor);

    setGame(newGame);
    setMoveIndex(0);
    setStatus("loading");
    setLastMoveSquares(null);
    setWrongSquare(null);
    setSelectedSquare(null);
    setLegalMoveSquares([]);
    setFlash("idle");
    setFlashKey(0);
    puzzleStartTimeRef.current = Date.now();

    // Auto-play opponent's first move after a short delay
    const timer = setTimeout(() => {
      if (puzzleIdRef.current !== puzzleId) return;

      const moves = currentPuzzle.solution || currentPuzzle.moves || [];
      if (moves.length === 0) return;

      const firstMove = moves[0];
      const from = firstMove.slice(0, 2) as Square;
      const to = firstMove.slice(2, 4) as Square;
      const promotion = firstMove.length > 4 ? firstMove[4] : undefined;

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
    }, 600);

    return () => clearTimeout(timer);
  }, [currentPuzzle]);

  // Play opponent's response after user makes a correct move
  const playOpponentMove = useCallback(
    (currentGame: Chess, nextMoveIdx: number) => {
      if (nextMoveIdx >= solutionMoves.length) return;

      const puzzleId = puzzleIdRef.current;

      setTimeout(() => {
        if (puzzleIdRef.current !== puzzleId) return;

        const move = solutionMoves[nextMoveIdx];
        try {
          const g = new Chess(currentGame.fen());
          g.move({ from: move.from, to: move.to, promotion: move.promotion });
          setGame(g);
          setMoveIndex(nextMoveIdx + 1);
          setLastMoveSquares({ from: move.from, to: move.to });

          // Check if puzzle is now fully solved (opponent played last move)
          if (nextMoveIdx + 1 >= solutionMoves.length) {
            setStatus("solved");
            setFlash("green");
            setFlashKey((k) => k + 1);
            if (currentPuzzle?.id) {
              setSolvedStatus((prev) => ({ ...prev, [currentPuzzle.id]: true }));
              setGlobalStats((prev) =>
                updatePuzzleStats(prev, {
                  puzzleId: currentPuzzle.id,
                  puzzleRating: currentPuzzle.rating,
                  solved: true,
                  timeMs: Date.now() - puzzleStartTimeRef.current,
                  theme: currentPuzzle.themes?.[0] || "unknown",
                  timestamp: Date.now(),
                })
              );

              // Record attempt for Repetit Training
              const setId = router.query.setId as string | undefined;
              const conceptName = router.query.theme as string | undefined;
              recordPuzzleAttempt({
                puzzleId: currentPuzzle.id,
                setId,
                userId: "current-user", // TODO: Replace with actual user ID from auth
                success: true,
                movesPlayed: userMoves,
                timeSpentSeconds: Math.round((Date.now() - puzzleStartTimeRef.current) / 1000),
                hintsUsed: 0, // TODO: Track hints if implemented
                conceptName,
              });
            }
          }
        } catch {
          // Move failed
        }
      }, 400);
    },
    [solutionMoves, currentPuzzle, setSolvedStatus, setGlobalStats]
  );

  // Handle user piece drop
  const onPieceDrop = useCallback(
    (sourceSquare: string, targetSquare: string, piece: string): boolean => {
      // Allow attempts during playing OR persistent wrong state — the
      // user shouldn't have to wait for a timer between attempts.
      if (status !== "playing" && status !== "wrong") return false;
      if (moveIndex >= solutionMoves.length) return false;

      const expectedMove = solutionMoves[moveIndex];
      const from = sourceSquare as Square;
      const to = targetSquare as Square;

      // Determine promotion
      let promotion: string | undefined;
      if (expectedMove.promotion) {
        // If this is a promotion move
        if (from === expectedMove.from && to === expectedMove.to) {
          promotion = expectedMove.promotion;
        } else {
          promotion = piece[1]?.toLowerCase() === "p" ? "q" : undefined;
        }
      }

      // Check if this matches the expected solution move
      if (from === expectedMove.from && to === expectedMove.to) {
        try {
          const g = new Chess(game.fen());
          g.move({ from, to, promotion: expectedMove.promotion });
          setGame(g);
          setLastMoveSquares({ from, to });
          // Correct move clears the persistent wrong-state memory.
          setWrongSquare(null);
          setStatus("playing");
          setSelectedSquare(null);
          setLegalMoveSquares([]);

          // Track user move
          setUserMoves(prev => [...prev, `${from}${to}${expectedMove.promotion || ''}`]);

          const nextIdx = moveIndex + 1;
          setMoveIndex(nextIdx);

          // Check if puzzle is solved
          if (nextIdx >= solutionMoves.length) {
            setStatus("solved");
            setFlash("green");
            setFlashKey((k) => k + 1);
            if (currentPuzzle?.id) {
              setSolvedStatus((prev) => ({ ...prev, [currentPuzzle.id]: true }));
              setGlobalStats((prev) =>
                updatePuzzleStats(prev, {
                  puzzleId: currentPuzzle.id,
                  puzzleRating: currentPuzzle.rating,
                  solved: true,
                  timeMs: Date.now() - puzzleStartTimeRef.current,
                  theme: currentPuzzle.themes?.[0] || "unknown",
                  timestamp: Date.now(),
                })
              );

              // Record attempt for Repetit Training
              const setId = router.query.setId as string | undefined;
              const conceptName = router.query.theme as string | undefined;
              recordPuzzleAttempt({
                puzzleId: currentPuzzle.id,
                setId,
                userId: "current-user", // TODO: Replace with actual user ID from auth
                success: true,
                movesPlayed: userMoves,
                timeSpentSeconds: Math.round((Date.now() - puzzleStartTimeRef.current) / 1000),
                hintsUsed: 0, // TODO: Track hints if implemented
                conceptName,
              });
            }
          } else {
            // Play opponent's next move
            playOpponentMove(g, nextIdx);
          }

          return true;
        } catch {
          return false;
        }
      } else {
        // Wrong move — persistent. Status, wrongSquare and the red flash
        // all stay set until the user makes another attempt (correct or
        // wrong). The flashKey bump remounts FlashOverlay so the
        // box-shadow keyframes restart cleanly on every repeat wrong.
        // No auto-reset timer — old behavior briefly flashed red then
        // returned to "playing," which made the negative reinforcement
        // easy to miss and hard to reread.
        setStatus("wrong");
        setWrongSquare(to);
        setSelectedSquare(null);
        setLegalMoveSquares([]);
        setFlash("red");
        setFlashKey((k) => k + 1);

        // Record failed attempt to stats
        if (currentPuzzle?.id) {
          setGlobalStats((prev) =>
            updatePuzzleStats(prev, {
              puzzleId: currentPuzzle.id,
              puzzleRating: currentPuzzle.rating,
              solved: false,
              timeMs: Date.now() - puzzleStartTimeRef.current,
              theme: currentPuzzle.themes?.[0] || "unknown",
              timestamp: Date.now(),
            })
          );
        }

        return false;
      }
    },
    [game, status, moveIndex, solutionMoves, currentPuzzle, setSolvedStatus, playOpponentMove]
  );

  // Handle square click for click-to-move
  const onSquareClick = useCallback(
    (square: Square) => {
      // Click-to-move accepts attempts in both playing and persistent
      // wrong state, mirroring onPieceDrop's relaxation above.
      if (status !== "playing" && status !== "wrong") return;

      // If no piece selected yet, select this square if it has a user piece
      if (!selectedSquare) {
        const piece = game.get(square);
        if (piece && piece.color === game.turn()) {
          setSelectedSquare(square);
          const moves = game.moves({ square, verbose: true });
          setLegalMoveSquares(moves.map((m) => m.to as Square));
        }
        return;
      }

      // If clicking the same square, deselect
      if (selectedSquare === square) {
        setSelectedSquare(null);
        setLegalMoveSquares([]);
        return;
      }

      // If clicking another own piece, switch selection
      const piece = game.get(square);
      if (piece && piece.color === game.turn()) {
        setSelectedSquare(square);
        const moves = game.moves({ square, verbose: true });
        setLegalMoveSquares(moves.map((m) => m.to as Square));
        return;
      }

      // Try to make the move
      onPieceDrop(selectedSquare, square, "");
    },
    [game, status, selectedSquare, onPieceDrop]
  );

  // Custom pieces using SVG piece sets (invisible in blind mode)
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
    [pieceSet, blindMode]
  );

  // Custom square styles for highlights
  const customSquareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};

    // Highlight last move
    if (lastMoveSquares) {
      styles[lastMoveSquares.from] = { backgroundColor: "rgba(255, 170, 0, 0.4)" };
      styles[lastMoveSquares.to] = { backgroundColor: "rgba(255, 170, 0, 0.5)" };
    }

    // Highlight selected square
    if (selectedSquare) {
      styles[selectedSquare] = { backgroundColor: "rgba(20, 85, 180, 0.5)" };
    }

    // Highlight legal move targets
    for (const sq of legalMoveSquares) {
      const existing = styles[sq] || {};
      styles[sq] = {
        ...existing,
        background: `${existing.backgroundColor || ""} radial-gradient(circle, rgba(0,0,0,0.15) 25%, transparent 25%)`.trim(),
      };
    }

    // Highlight wrong move square
    if (wrongSquare) {
      styles[wrongSquare] = { backgroundColor: "rgba(220, 50, 50, 0.6)" };
    }

    return styles;
  }, [lastMoveSquares, selectedSquare, legalMoveSquares, wrongSquare]);

  // Status indicator text
  const statusText = useMemo(() => {
    if (status === "loading") return "Loading puzzle...";
    if (status === "solved") return "Puzzle solved!";
    if (status === "wrong") return "That's not right — try again.";

    // Determine whose turn it is
    const turn = game.turn();
    return turn === "w" ? "White to move" : "Black to move";
  }, [status, game]);

  const statusColor = useMemo(() => {
    if (status === "solved") return "success.main";
    if (status === "wrong") return "error.main";
    return "text.secondary";
  }, [status]);

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
          bgcolor: status === "solved" ? "success.dark" : status === "wrong" ? "error.dark" : "grey.800",
          display: "flex",
          alignItems: "center",
          gap: 1,
        }}
      >
        {status === "playing" && (
          <Box
            sx={{
              width: 14,
              height: 14,
              borderRadius: "50%",
              bgcolor: game.turn() === "w" ? "#fff" : "#333",
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
            color: status === "solved" || status === "wrong" ? "#fff" : "grey.300",
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
        {/* key={flashKey} forces the overlay to remount on every flash
            trigger so its CSS animation restarts cleanly. Sits
            absolutely positioned over the board with pointer-events:
            none — never blocks drag-and-drop or click-to-move. */}
        <FlashOverlay key={`flash-${flashKey}`} flash={flash} />
        <Chessboard
          id="PracticeBoard"
          position={game.fen()}
          onPieceDrop={onPieceDrop}
          onSquareClick={onSquareClick}
          boardOrientation={boardOrientation}
          boardWidth={boardSize}
          customBoardStyle={{
            borderRadius: "4px",
            boxShadow: "0 2px 10px rgba(0,0,0,0.5)",
          }}
          customSquareStyles={customSquareStyles}
          customPieces={customPieces}
          isDraggablePiece={({ piece }) => {
            // Draggable in playing OR persistent wrong state — same
            // relaxation as onPieceDrop / onSquareClick above so the
            // user can immediately retry without waiting for a timer.
            if (status !== "playing" && status !== "wrong") return false;
            const color = piece[0] === "w" ? "w" : "b";
            return color === game.turn();
          }}
          animationDuration={200}
        />
      </Box>
    </Box>
  );
}
