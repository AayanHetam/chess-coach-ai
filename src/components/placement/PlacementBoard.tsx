import { useMemo } from "react";
import { Box } from "@mui/material";
import { useAtomValue } from "jotai";
import { pieceSetAtom } from "@/components/board/states";
import { useScreenSize } from "@/hooks/useScreenSize";
import {
  usePuzzleBoardState,
  type PuzzleInput,
} from "@/hooks/usePuzzleBoardState";
import { PuzzleBoardSurface } from "@/components/puzzle/PuzzleBoardSurface";

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

  const board = usePuzzleBoardState({ puzzle, onSolved, onWrong });

  const boardSize = useMemo(() => {
    const w = screen.width || 0;
    const h = screen.height || 0;
    if (w <= 0 || h <= 0) return 360;
    return Math.max(Math.min(w - 48, h - 280, 520), 280);
  }, [screen]);

  if (!puzzle) {
    return <Box sx={{ width: boardSize, height: boardSize }} />;
  }

  // Shared Puzzle Coach board. Deliberately NO coach overlay/underlay — the
  // placement test is a measurement instrument, so there is no code path that
  // can surface a hint here. (SessionRunner reuses this component; same rule.)
  return (
    <PuzzleBoardSurface
      boardId="PlacementBoard"
      fen={board.game.fen()}
      orientation={board.boardOrientation}
      interactive={board.status === "playing" || board.status === "wrong"}
      onPieceDrop={board.onPieceDrop}
      lastMove={board.lastMoveSquares}
      wrongSquare={board.wrongSquare}
      flash={{ state: board.flash, flashKey: board.flashKey }}
      boardWidth={boardSize}
      pieceSet={pieceSet}
      animationMs={200}
    />
  );
}
