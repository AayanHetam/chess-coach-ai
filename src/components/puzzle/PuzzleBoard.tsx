"use client";

import { useCallback, useMemo, useState } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import type {
  CustomSquareStyles,
  Piece,
  Square,
} from "react-chessboard/dist/chessboard/types";

/**
 * react-chessboard wrapper for the Puzzle Coach.
 *
 * Replaces ChessgroundBoard for /preview/puzzles. Same library
 * (react-chessboard) that /analysis and /play already use, so drag,
 * click-to-move, snap-back on illegal drop, and promotions all behave the
 * way users expect from the rest of the app.
 *
 * Parent owns the chess state. We just:
 *   - Validate legality via a chess.js probe on every attempt.
 *   - Show legal-target dots whenever a piece is selected (click) or being
 *     dragged.
 *   - Fire `onMove(from, to, promotion?)` for legal moves. Parent returns
 *     true to keep the visual position (move accepted, fen will sync), false
 *     to snap back (wrong move — parent should set `wrongSquare` to flash).
 */

interface PuzzleBoardProps {
  fen: string;
  orientation: "white" | "black";
  /** Pieces are draggable + clickable when true. */
  interactive: boolean;
  /** Highlights both squares of the most recent move (ember orange). */
  lastMove?: [string, string] | null;
  /** Flashes red on the square the user just dropped on after a wrong move. */
  wrongSquare?: string | null;
  /**
   * Called when the user attempts a legal chess move. Return true to accept
   * (board keeps the visual position; the parent's `fen` change will sync on
   * next render) or false to revert (board snaps back). Promotion is "q" |
   * "r" | "b" | "n" — currently always "q" since the board auto-queens.
   */
  onMove: (from: string, to: string, promotion?: string) => boolean;
}

const LAST_MOVE_BG = "rgba(255, 122, 26, 0.42)";
const WRONG_BG = "rgba(239, 68, 68, 0.55)";
const SELECTED_BG = "rgba(255, 122, 26, 0.30)";
const LEGAL_DOT_BG =
  "radial-gradient(circle, rgba(255,255,255,0.32) 22%, transparent 26%)";
const LEGAL_CAPTURE_SHADOW = "inset 0 0 0 3px rgba(255,255,255,0.45)";
const LIGHT_SQUARE = "#F0D9B5";
const DARK_SQUARE = "#5C4630";

export function PuzzleBoard({
  fen,
  orientation,
  interactive,
  lastMove,
  wrongSquare,
  onMove,
}: PuzzleBoardProps) {
  const game = useMemo(() => {
    try {
      return new Chess(fen);
    } catch {
      return new Chess();
    }
  }, [fen]);

  const [selected, setSelected] = useState<Square | null>(null);

  // The side whose turn it is. We only allow that color to move (matches
  // the existing puzzle behavior — student always plays the side to move).
  const movableColor: "w" | "b" | null = interactive ? game.turn() : null;

  const isOwnPiece = useCallback(
    (piece: string) => {
      if (!movableColor) return false;
      return piece.startsWith(movableColor);
    },
    [movableColor],
  );

  // Legal targets for the currently selected source square. Split into
  // captures vs. quiet moves so we can render rings vs. dots.
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
      /* selected square has no piece / not its turn */
    }
    return { dotSquares: dots, captureSquares: captures };
  }, [game, selected]);

  const customSquareStyles = useMemo<CustomSquareStyles>(() => {
    const styles: Partial<Record<Square, React.CSSProperties>> = {};
    const set = (sq: Square, patch: React.CSSProperties) => {
      styles[sq] = { ...(styles[sq] ?? {}), ...patch };
    };
    if (lastMove) {
      set(lastMove[0] as Square, { background: LAST_MOVE_BG });
      set(lastMove[1] as Square, { background: LAST_MOVE_BG });
    }
    if (wrongSquare) {
      set(wrongSquare as Square, { background: WRONG_BG });
    }
    for (const sq of dotSquares) set(sq, { background: LEGAL_DOT_BG });
    for (const sq of captureSquares) set(sq, { boxShadow: LEGAL_CAPTURE_SHADOW });
    if (selected) set(selected, { background: SELECTED_BG });
    return styles as CustomSquareStyles;
  }, [lastMove, wrongSquare, dotSquares, captureSquares, selected]);

  // Validate legality, then delegate to parent. Returns the parent's verdict
  // so react-chessboard knows whether to keep the visual position or snap
  // back. For non-promotion moves we pass undefined; auto-queen handles
  // promotions internally via chess.js's default.
  const attemptMove = useCallback(
    (from: string, to: string, promotion?: string): boolean => {
      if (!interactive) return false;
      const probe = new Chess(fen);
      try {
        const result = probe.move({
          from,
          to,
          promotion: promotion ?? "q",
        });
        if (!result) return false;
      } catch {
        return false;
      }
      return onMove(from, to, promotion);
    },
    [fen, interactive, onMove],
  );

  const onPieceDrop = useCallback(
    (source: Square, target: Square, piece: Piece): boolean => {
      setSelected(null);
      if (!isOwnPiece(piece)) return false;
      return attemptMove(source, target);
    },
    [attemptMove, isOwnPiece],
  );

  const onSquareClick = useCallback(
    (square: Square, piece: Piece | undefined) => {
      if (selected) {
        const ok = attemptMove(selected, square);
        if (ok) {
          setSelected(null);
        } else if (piece && isOwnPiece(piece) && square !== selected) {
          // Clicked a different own piece — switch selection rather than
          // leave a stale dot.
          setSelected(square);
        } else {
          setSelected(null);
        }
        return;
      }
      if (piece && isOwnPiece(piece)) {
        setSelected(square);
      }
    },
    [attemptMove, isOwnPiece, selected],
  );

  const onPieceDragBegin = useCallback(
    (_piece: Piece, sourceSquare: Square) => {
      setSelected(sourceSquare);
    },
    [],
  );

  const onPieceDragEnd = useCallback(() => {
    setSelected(null);
  }, []);

  const isDraggablePiece = useCallback(
    ({ piece }: { piece: Piece }) => isOwnPiece(piece),
    [isOwnPiece],
  );

  return (
    <Chessboard
      id="PuzzleBoard"
      position={fen}
      boardOrientation={orientation}
      onPieceDrop={onPieceDrop}
      onSquareClick={onSquareClick}
      onPieceDragBegin={onPieceDragBegin}
      onPieceDragEnd={onPieceDragEnd}
      isDraggablePiece={isDraggablePiece}
      customSquareStyles={customSquareStyles}
      customLightSquareStyle={{ backgroundColor: LIGHT_SQUARE }}
      customDarkSquareStyle={{ backgroundColor: DARK_SQUARE }}
      autoPromoteToQueen
      animationDuration={220}
      customBoardStyle={{
        borderRadius: "0.85rem",
        boxShadow: "0 0 0 1px rgba(255,255,255,0.06)",
      }}
    />
  );
}
