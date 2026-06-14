"use client";

import { useCallback, useMemo, useState } from "react";
import { Chess, Square } from "chess.js";
import { Box } from "@mui/material";
import { Chessboard } from "react-chessboard";
import type {
  CustomPieces,
  CustomSquareStyles,
  Piece,
} from "react-chessboard/dist/chessboard/types";
import { FlashOverlay, type FlashState } from "./FlashOverlay";
import {
  DEFAULT_PUZZLE_THEME,
  composePuzzleSquareStyles,
  type BoardTheme,
} from "./boardTheme";

/**
 * The single, shared puzzle board renderer. Every puzzle-solving surface
 * (preview/puzzles, /practice, puzzle-rush, daily, placement, the curriculum
 * drill, in-chat inline puzzles) renders through this so they all share the
 * exact "Puzzle Coach" look — ember squares, orange last-move/selection, white
 * legal-target dots, the red/green flash ring.
 *
 * Ownership split (matches usePuzzleBoardState's contract):
 *   • This component owns ONLY the VISUAL board + click-to-move UX:
 *     selection state, legal-target dots/capture rings, last-move + wrong
 *     highlighting, the flash overlay, piece-set rendering, board sizing.
 *   • The PARENT owns all chess/solve state and grading. The board never
 *     validates a solution, never calls updatePuzzleStats, never touches a
 *     puzzle source. It just reports attempted moves to `onPieceDrop` and
 *     paints what the parent tells it (fen, lastMove, wrongSquare, flash).
 *
 * There is deliberately NO "coach" prop here. A surface that wants to paint
 * coach-driven square overlays (only /preview/puzzles) passes them through the
 * generic `underlaySquareStyles` — so a measurement surface like the placement
 * test has, by construction, no code path that can surface a hint on the board.
 */

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

/** Build react-chessboard customPieces from a piece-set id (the SVG set the
 *  user picked). Shared so each surface stops re-implementing this reduce. */
function buildCustomPieces(pieceSet: string): CustomPieces {
  return PIECE_CODES.reduce<CustomPieces>((acc, piece) => {
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
  }, {});
}

export interface PuzzleBoardSurfaceProps {
  /** Position to render (the parent's chess state, or a demo-walk fen). */
  fen: string;
  orientation: "white" | "black";
  /** Pieces are draggable/clickable + legal dots show when true. */
  interactive: boolean;
  /**
   * Move sink. The board calls this with every attempted move (drag or click);
   * the parent applies/validates it and returns true to keep the visual
   * position or false to snap back. The board itself does NOT judge legality
   * or correctness — the sink (usePuzzleBoardState.onPieceDrop, or a page
   * adapter) owns that, so each surface keeps its own move semantics.
   */
  onPieceDrop: (from: string, to: string, piece: string) => boolean;
  /** Most-recent move, highlighted in the theme's last-move color. */
  lastMove?: { from: string; to: string } | null;
  /** Square a wrong move landed on, flashed in the theme's wrong color. */
  wrongSquare?: string | null;
  /** User piece set id; omit to use react-chessboard's default pieces. */
  pieceSet?: string;
  /** Explicit pixel width; omit to fill the container fluidly (preview-style). */
  boardWidth?: number;
  /** Per-move animation; rush passes a low value so speed mode stays snappy. */
  animationMs?: number;
  /** Styles painted UNDER all built-in cues — the seam coach overlays use. */
  underlaySquareStyles?: Record<string, React.CSSProperties>;
  /** Optional flash ring (red/green). Pass the hook's {flash, flashKey}. */
  flash?: { state: FlashState; flashKey: number } | null;
  /** Visual tokens; defaults to the ember "Puzzle Coach" look. */
  theme?: BoardTheme;
  boardId?: string;
}

/** chess.js piece → react-chessboard code ("wP", "bN", …), or "" if empty. */
function pieceCodeAt(game: Chess, square: Square): string {
  const p = game.get(square);
  return p ? `${p.color}${p.type.toUpperCase()}` : "";
}

export function PuzzleBoardSurface({
  fen,
  orientation,
  interactive,
  onPieceDrop,
  lastMove,
  wrongSquare,
  pieceSet,
  boardWidth,
  animationMs,
  underlaySquareStyles,
  flash,
  theme = DEFAULT_PUZZLE_THEME,
  boardId = "PuzzleBoardSurface",
}: PuzzleBoardSurfaceProps) {
  const game = useMemo(() => {
    try {
      return new Chess(fen);
    } catch {
      return new Chess();
    }
  }, [fen]);

  const [selected, setSelected] = useState<Square | null>(null);

  // Only the side to move may be picked up (the student always plays the side
  // to move in a puzzle). Null when the board is non-interactive.
  const movableColor: "w" | "b" | null = interactive ? game.turn() : null;
  const isOwnPiece = useCallback(
    (piece: string) => !!movableColor && piece.startsWith(movableColor),
    [movableColor],
  );

  // Legal targets for the selected square, split into quiet vs capture.
  const { dotSquares, captureSquares } = useMemo(() => {
    const dots: Square[] = [];
    const captures: Square[] = [];
    if (!selected) return { dotSquares: dots, captureSquares: captures };
    try {
      for (const m of game.moves({ square: selected, verbose: true })) {
        if (m.captured) captures.push(m.to as Square);
        else dots.push(m.to as Square);
      }
    } catch {
      /* no piece / not its turn */
    }
    return { dotSquares: dots, captureSquares: captures };
  }, [game, selected]);

  const customPieces = useMemo(
    () => (pieceSet ? buildCustomPieces(pieceSet) : undefined),
    [pieceSet],
  );

  const squareStyles = useMemo<CustomSquareStyles>(
    () =>
      composePuzzleSquareStyles(theme, {
        underlay: underlaySquareStyles,
        lastMove,
        wrongSquare,
        dotSquares,
        captureSquares,
        selected,
      }) as CustomSquareStyles,
    [
      underlaySquareStyles,
      lastMove,
      wrongSquare,
      dotSquares,
      captureSquares,
      selected,
      theme,
    ],
  );

  const handleDrop = useCallback(
    (source: Square, target: Square, piece: Piece): boolean => {
      setSelected(null);
      if (!isOwnPiece(piece)) return false;
      return onPieceDrop(source, target, piece);
    },
    [isOwnPiece, onPieceDrop],
  );

  const onSquareClick = useCallback(
    (square: Square, piece: Piece | undefined) => {
      if (!interactive) return;
      if (selected) {
        if (square === selected) {
          setSelected(null);
          return;
        }
        // Clicking another own piece switches the selection (you can't
        // legally land on your own piece anyway).
        if (piece && isOwnPiece(piece)) {
          setSelected(square);
          return;
        }
        onPieceDrop(selected, square, pieceCodeAt(game, selected));
        setSelected(null);
        return;
      }
      if (piece && isOwnPiece(piece)) setSelected(square);
    },
    [interactive, selected, isOwnPiece, onPieceDrop, game],
  );

  const onPieceDragBegin = useCallback((_p: Piece, sq: Square) => {
    setSelected(sq);
  }, []);
  const onPieceDragEnd = useCallback(() => setSelected(null), []);
  const isDraggablePiece = useCallback(
    ({ piece }: { piece: Piece }) => isOwnPiece(piece),
    [isOwnPiece],
  );

  const board = (
    <Chessboard
      id={boardId}
      position={fen}
      boardOrientation={orientation}
      {...(boardWidth ? { boardWidth } : {})}
      onPieceDrop={handleDrop}
      onSquareClick={onSquareClick}
      onPieceDragBegin={onPieceDragBegin}
      onPieceDragEnd={onPieceDragEnd}
      isDraggablePiece={isDraggablePiece}
      customSquareStyles={squareStyles}
      customPieces={customPieces}
      customLightSquareStyle={{ backgroundColor: theme.light }}
      customDarkSquareStyle={{ backgroundColor: theme.dark }}
      autoPromoteToQueen
      animationDuration={animationMs ?? 220}
      customBoardStyle={{
        borderRadius: theme.radius,
        boxShadow: "0 0 0 1px rgba(255,255,255,0.06)",
      }}
    />
  );

  return (
    <Box
      sx={{
        position: "relative",
        width: boardWidth ?? "100%",
        mx: boardWidth ? "auto" : undefined,
      }}
    >
      {flash && (
        <FlashOverlay key={`flash-${flash.flashKey}`} flash={flash.state} />
      )}
      {board}
    </Box>
  );
}
