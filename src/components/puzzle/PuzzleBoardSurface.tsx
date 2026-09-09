"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, Square } from "chess.js";
import { Box, Typography } from "@mui/material";
import { Chessboard } from "react-chessboard";
import { isMoveStartKey, parseKeyboardMove } from "@/lib/puzzle/keyboardMove";
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
 * exact "Puzzle Coach" look — warm walnut squares, ember last-move/selection,
 * warm-ink legal-target dots, the red/green flash ring (tokens in boardTheme.ts).
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
          // A hairline shadow hugging the piece silhouette (drop-shadow works
          // on the rendered alpha, so it follows the SVG, not the square).
          // It lifts white piece bodies off the light square — the one pairing
          // no square colour can fix (~1.3:1 body contrast on every board on
          // every site; the stroke does the work). Paint-only: no layout,
          // and react-chessboard's drag layer renders the same function, so
          // the drag ghost matches. Kept ≤1px so it never reads as 3D.
          filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.42))",
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
   * Tap handler for a board that is not accepting moves. When set, tapping a
   * square calls this instead of doing nothing.
   *
   * Two callers, both of which need the board inert for moves but live:
   *   - confirm-move renders the STAGED position, so a second drag would
   *     report squares that don't exist in the real position — a tap takes
   *     the move back instead, which is what everyone tries first;
   *   - Eliminate mode marks squares as ruled out rather than moving.
   *
   * The parent decides which meaning applies; the board just reports the tap.
   */
  onInactiveSquareTap?: (square: Square) => void;
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
  /** Square a correct move just landed on, painted green for reinforcement. */
  correctSquare?: string | null;
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

/**
 * May this piece be picked up?
 *
 * Normally: only the side to move, and only while the board accepts moves.
 *
 * The `dragFrom` exception is load-bearing, not a nicety. react-chessboard
 * attaches react-dnd's drag connector conditionally —
 * `ref={arePiecesDraggable && canDrag ? drag : null}` — so the instant this
 * returns false react-dnd runs its connector cleanup, and that cleanup ends
 * with `node.setAttribute('draggable', 'false')` (see connectDragSource in
 * react-dnd-html5-backend). Doing that to the element the browser is
 * CURRENTLY dragging is the documented way to lose the drag: the backend's
 * own comment reads "the drag source node disappeared from DOM, so the
 * browser didn't dispatch the dragend event".
 *
 * Nothing then ends the drag. `dragend` and `drop` are bound on the root, so a
 * drop that lands on a square still cleans up (handleTopDrop calls endDrag) —
 * but a release ANYWHERE ELSE fires neither, and the monitor stays stuck in
 * the dragging state. The source piece keeps `opacity: 0` (so it vanishes off
 * the board) while CustomDragLayer, which is `position: fixed`, carries on
 * painting it wherever the pointer last was — a piece stranded beside the
 * board. `onPieceDragEnd` never fires either, so the square keeps its
 * selection ring and legal-move dots. The backend's only rescue is a
 * `mousemove` listener armed 1000ms after the drag began, which is why the
 * stranded piece sits there long enough to screenshot. (Reported on /puzzles
 * by GM Pavel Skatchkov, 2026-09-09: a rook left floating beside the board
 * when playing Rd1-d8.)
 *
 * And the "interactive" input flips under a drag from six directions at once:
 * /puzzles derives it from `status !== "solved" && !staged && !activeDemo &&
 * !choiceModeActive && !eliminateMode && !!puzzle`, several of which move on
 * timers (playOpponentReply) or synchronously inside `onPieceDrop` itself.
 * `movableColor` also follows `game.turn()`, which flips under the hand
 * holding the piece. So the piece being dragged keeps its grip until the drag
 * actually ends; legality is still enforced at drop time by `handleDrop`,
 * which is where it belongs.
 *
 * Pure and exported so the invariant is pinned by a test rather than by a
 * comment — there is no jsdom in this suite to drive a real drag.
 */
export function isPieceDraggable({
  piece,
  sourceSquare,
  movableColor,
  dragFrom,
}: {
  piece: string;
  sourceSquare: string;
  /** Side that may move, or null when the board is inert. */
  movableColor: "w" | "b" | null;
  /** Square a drag is currently in flight from, or null. */
  dragFrom: string | null;
}): boolean {
  if (dragFrom !== null && sourceSquare === dragFrom) return true;
  return !!movableColor && piece.startsWith(movableColor);
}

export function PuzzleBoardSurface({
  fen,
  orientation,
  interactive,
  onInactiveSquareTap,
  onPieceDrop,
  lastMove,
  wrongSquare,
  correctSquare,
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
        correctSquare,
        dotSquares,
        captureSquares,
        selected,
      }) as CustomSquareStyles,
    [
      underlaySquareStyles,
      lastMove,
      wrongSquare,
      correctSquare,
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
      if (!interactive) {
        // Inert for moves, but the parent may still want the tap (take-back,
        // or marking the square as ruled out).
        onInactiveSquareTap?.(square);
        return;
      }
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
    [interactive, onInactiveSquareTap, selected, isOwnPiece, onPieceDrop, game],
  );

  // Square a drag is in flight from. A ref, not state: it is read during
  // render (via isDraggablePiece) and must be up to date the moment the drag
  // starts, without scheduling a render of its own.
  const dragFromRef = useRef<string | null>(null);

  const endDrag = useCallback(() => {
    dragFromRef.current = null;
    setSelected(null);
  }, []);

  const onPieceDragBegin = useCallback((_p: Piece, sq: Square) => {
    dragFromRef.current = sq;
    setSelected(sq);
  }, []);
  const onPieceDragEnd = useCallback(() => endDrag(), [endDrag]);

  // Belt and braces for the drags react-dnd never reports back: a pointer
  // released outside the window, or a drop the browser cancels. Without this
  // the board would keep showing a selection ring and legal-move dots for a
  // piece nobody is holding any more.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.addEventListener("dragend", endDrag);
    window.addEventListener("drop", endDrag);
    return () => {
      window.removeEventListener("dragend", endDrag);
      window.removeEventListener("drop", endDrag);
    };
  }, [endDrag]);

  const isDraggablePiece = useCallback(
    ({ piece, sourceSquare }: { piece: Piece; sourceSquare: Square }) =>
      isPieceDraggable({
        piece,
        sourceSquare,
        movableColor,
        dragFrom: dragFromRef.current,
      }),
    [movableColor],
  );

  // ── Keyboard move entry ──────────────────────────────────────────────
  // Every other input path is pointer-shaped (drag, tap-tap), which locked
  // keyboard-only users out of ANY surface that renders this board — the
  // course trainer's probes could not be answered at all. The container is
  // focusable; typing a plausible move character ("e", "N", "0", …) opens a
  // small overlay input, Enter parses SAN/UCI and feeds the SAME
  // `onPieceDrop` sink a drag uses — grading semantics are untouched by
  // construction, on every surface at once. No layout change: the overlay
  // floats over the board, so height-measuring layouts (the /puzzles
  // one-screen lock) see nothing new.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [kbText, setKbText] = useState<string | null>(null); // null = closed
  const [kbError, setKbError] = useState<string | null>(null);

  const closeKbEntry = useCallback(() => {
    setKbText(null);
    setKbError(null);
    containerRef.current?.focus();
  }, []);

  const commitKbEntry = useCallback(() => {
    if (kbText == null) return;
    const parsed = parseKeyboardMove(fen, kbText);
    if (!parsed.ok) {
      setKbError(parsed.error);
      return;
    }
    setSelected(null);
    // The sink applies/validates exactly as if the piece had been dragged;
    // a false return means the parent rejected it, and the parent's own
    // feedback (flash, wrong-square paint) already covers that.
    onPieceDrop(parsed.from, parsed.to, parsed.piece);
    closeKbEntry();
  }, [kbText, fen, onPieceDrop, closeKbEntry]);

  const handleContainerKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!interactive || kbText != null) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isMoveStartKey(e.key)) {
        e.preventDefault();
        setKbError(null);
        setKbText(e.key);
      }
    },
    [interactive, kbText],
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
      // The rendered position and whether it accepts input, exposed for
      // end-to-end tests. The puzzle feed is random, so a test otherwise has
      // no way to know which piece is movable — it would have to guess by
      // clicking squares and watching for a repaint, which the board gives it
      // no reliable signal for. Two attributes make the board fully drivable
      // and are also the first thing you want in a bug report.
      data-board-fen={fen}
      data-board-interactive={interactive ? "true" : "false"}
      ref={containerRef}
      // Focusable only while it accepts moves — a demo playback or a staged
      // position should not be a tab stop pretending otherwise.
      tabIndex={interactive ? 0 : -1}
      role="group"
      aria-label={
        interactive
          ? "Chess board. Type a move in algebraic notation — like e4, Nf3 or O-O — then press Enter."
          : "Chess board"
      }
      onKeyDown={handleContainerKeyDown}
      sx={{
        position: "relative",
        width: boardWidth ?? "100%",
        mx: boardWidth ? "auto" : undefined,
        outline: "none",
        borderRadius: theme.radius,
        "&:focus-visible": {
          boxShadow: "0 0 0 2px rgba(255,122,26,0.55)",
        },
        // Sighted keyboard users get the affordance the aria-label gives a
        // screen reader — only while the board itself has the focus ring.
        "& .cm-kb-hint": { opacity: 0, transition: "opacity 180ms ease" },
        "&:focus-visible .cm-kb-hint": { opacity: 1 },
      }}
    >
      {flash && (
        <FlashOverlay key={`flash-${flash.flashKey}`} flash={flash.state} />
      )}
      {board}
      {interactive && kbText == null && (
        <Typography
          className="cm-kb-hint"
          aria-hidden
          sx={{
            position: "absolute",
            left: "50%",
            bottom: 8,
            transform: "translateX(-50%)",
            px: 1.25,
            py: 0.4,
            borderRadius: "999px",
            fontSize: "0.7rem",
            fontWeight: 600,
            color: "rgba(255,240,224,0.85)",
            background: "rgba(12,10,8,0.82)",
            border: "1px solid rgba(255,122,26,0.35)",
            pointerEvents: "none",
            whiteSpace: "nowrap",
            zIndex: 4,
          }}
        >
          Type a move — e4, Nf3, O-O
        </Typography>
      )}
      {kbText != null && (
        <Box
          data-testid="board-keyboard-entry"
          sx={{
            position: "absolute",
            left: "50%",
            bottom: 8,
            transform: "translateX(-50%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 0.5,
            zIndex: 5,
          }}
        >
          <Box
            component="input"
            autoFocus
            value={kbText}
            aria-label="Your move, in algebraic notation. Press Enter to play it, Escape to cancel."
            aria-invalid={kbError ? true : undefined}
            spellCheck={false}
            autoComplete="off"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setKbError(null);
              setKbText(e.target.value);
            }}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              // The container must not see these — "e" would re-open, Escape
              // could bubble into a dialog.
              e.stopPropagation();
              if (e.key === "Enter") commitKbEntry();
              else if (e.key === "Escape") closeKbEntry();
            }}
            onBlur={closeKbEntry}
            sx={{
              width: 128,
              px: 1.25,
              py: 0.6,
              borderRadius: "0.6rem",
              border: kbError
                ? "1px solid rgba(239,68,68,0.65)"
                : "1px solid rgba(255,122,26,0.45)",
              background: "rgba(12,10,8,0.92)",
              color: "rgba(255,240,224,0.95)",
              fontFamily: "Monaco, Menlo, monospace",
              fontSize: "0.85rem",
              textAlign: "center",
              outline: "none",
              "&:focus": { boxShadow: "0 0 0 2px rgba(255,122,26,0.35)" },
            }}
          />
          {kbError && (
            <Typography
              role="alert"
              sx={{
                px: 1,
                py: 0.25,
                borderRadius: "0.5rem",
                fontSize: "0.68rem",
                color: "#FFB4A8",
                background: "rgba(12,10,8,0.88)",
                border: "1px solid rgba(239,68,68,0.4)",
                whiteSpace: "nowrap",
              }}
            >
              {kbError}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}
