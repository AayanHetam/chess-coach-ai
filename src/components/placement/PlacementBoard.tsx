import { useCallback, useMemo, useState } from "react";
import { Chessboard } from "react-chessboard";
import { Square } from "chess.js";
import { Box } from "@mui/material";
import { useAtomValue } from "jotai";
import { pieceSetAtom } from "@/components/board/states";
import { Piece, CustomPieces } from "react-chessboard/dist/chessboard/types";
import { useScreenSize } from "@/hooks/useScreenSize";
import {
  usePuzzleBoardState,
  type PuzzleInput,
} from "@/hooks/usePuzzleBoardState";
import { FlashOverlay } from "@/components/puzzle/FlashOverlay";

const PIECE_CODES: Piece[] = [
  "wP",
  "wB",
  "wN",
  "wR",
  "wQ",
  "wK",
  "bP",
  "bB",
  "bN",
  "bR",
  "bQ",
  "bK",
];

interface PlacementBoardProps {
  puzzle: PuzzleInput | null;
  /** Fired when the puzzle is fully solved (no prior wrong attempt). */
  onSolved: (puzzleId: string) => void;
  /** Fired on the first wrong attempt (placement grades first-try). */
  onWrong: (puzzleId: string) => void;
}

/**
 * Lightweight, prop-driven puzzle board for the placement test. Reuses the
 * shared `usePuzzleBoardState` solve/grade loop + react-chessboard rendering,
 * but deliberately does NOT touch `puzzleStatsAtom` / practice atoms — the
 * placement test seeds the live rating once at the end, not per puzzle.
 */
export default function PlacementBoard({
  puzzle,
  onSolved,
  onWrong,
}: PlacementBoardProps) {
  const pieceSet = useAtomValue(pieceSetAtom);
  const screen = useScreenSize();
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [legalMoveSquares, setLegalMoveSquares] = useState<Square[]>([]);

  const board = usePuzzleBoardState({ puzzle, onSolved, onWrong });

  const boardSize = useMemo(() => {
    const w = screen.width || 0;
    const h = screen.height || 0;
    if (w <= 0 || h <= 0) return 360;
    return Math.max(Math.min(w - 48, h - 280, 520), 280);
  }, [screen]);

  const onSquareClick = useCallback(
    (square: Square) => {
      if (board.status !== "playing" && board.status !== "wrong") return;
      if (!selectedSquare) {
        const piece = board.game.get(square);
        if (piece && piece.color === board.game.turn()) {
          setSelectedSquare(square);
          setLegalMoveSquares(
            board.game
              .moves({ square, verbose: true })
              .map((m) => m.to as Square)
          );
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
        setLegalMoveSquares(
          board.game.moves({ square, verbose: true }).map((m) => m.to as Square)
        );
        return;
      }
      board.onPieceDrop(selectedSquare, square, "");
      setSelectedSquare(null);
      setLegalMoveSquares([]);
    },
    [board, selectedSquare]
  );

  const customPieces = useMemo(
    () =>
      PIECE_CODES.reduce<CustomPieces>((acc, piece) => {
        acc[piece] = ({ squareWidth }: { squareWidth: number }) => (
          <Box
            width={squareWidth}
            height={squareWidth}
            sx={{
              backgroundImage: `url(/piece/${pieceSet}/${piece}.svg)`,
              backgroundSize: "contain",
            }}
          />
        );
        return acc;
      }, {}),
    [pieceSet]
  );

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
        background:
          `${existing.backgroundColor || ""} radial-gradient(circle, rgba(0,0,0,0.15) 25%, transparent 25%)`.trim(),
      };
    }
    return styles;
  }, [board.customSquareStyles, selectedSquare, legalMoveSquares]);

  if (!puzzle) {
    return <Box sx={{ width: boardSize, height: boardSize }} />;
  }

  return (
    <Box
      sx={{
        position: "relative",
        width: boardSize,
        mx: "auto",
        "& .board-container": { borderRadius: "6px" },
      }}
    >
      <FlashOverlay key={`flash-${board.flashKey}`} flash={board.flash} />
      <Chessboard
        id="PlacementBoard"
        position={board.game.fen()}
        onPieceDrop={board.onPieceDrop}
        onSquareClick={onSquareClick}
        boardOrientation={board.boardOrientation}
        boardWidth={boardSize}
        customBoardStyle={{
          borderRadius: "6px",
          boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
        }}
        customSquareStyles={customSquareStyles}
        customPieces={customPieces}
        isDraggablePiece={board.isDraggablePiece}
        animationDuration={200}
      />
    </Box>
  );
}
