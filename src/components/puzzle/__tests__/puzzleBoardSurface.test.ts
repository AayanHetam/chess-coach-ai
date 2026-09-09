import { describe, it, expect } from "vitest";
import {
  composePuzzleSquareStyles,
  DEFAULT_PUZZLE_THEME,
  type SquareStyleParts,
} from "../boardTheme";
import { isPieceDraggable } from "../PuzzleBoardSurface";

const T = DEFAULT_PUZZLE_THEME;

describe("composePuzzleSquareStyles", () => {
  it("paints both last-move squares in the theme color", () => {
    const s = composePuzzleSquareStyles(T, {
      lastMove: { from: "e2", to: "e4" },
    });
    expect(s.e2.background).toBe(T.lastMove);
    expect(s.e4.background).toBe(T.lastMove);
  });

  it("paints the wrong square, overriding last-move on a collision", () => {
    const s = composePuzzleSquareStyles(T, {
      lastMove: { from: "d4", to: "e5" },
      wrongSquare: "e5",
    });
    // e5 is both the last-move target and the wrong square — wrong wins.
    expect(s.e5.background).toBe(T.wrong);
    expect(s.d4.background).toBe(T.lastMove);
  });

  it("layers user cues ON TOP of the underlay (e.g. coach overlay)", () => {
    const parts: SquareStyleParts = {
      underlay: { e4: { background: "rgba(0,0,255,0.4)" } },
      lastMove: { from: "e2", to: "e4" },
    };
    const s = composePuzzleSquareStyles(T, parts);
    // e4 had a coach underlay but the last-move highlight paints over it.
    expect(s.e4.background).toBe(T.lastMove);
  });

  it("keeps a pure underlay square when no user cue collides", () => {
    const s = composePuzzleSquareStyles(T, {
      underlay: { a1: { background: "rgba(255,0,0,0.4)" } },
      lastMove: { from: "e2", to: "e4" },
    });
    expect(s.a1.background).toBe("rgba(255,0,0,0.4)");
  });

  it("renders quiet dots and capture rings distinctly", () => {
    const s = composePuzzleSquareStyles(T, {
      dotSquares: ["e4", "e5"],
      captureSquares: ["d5"],
    });
    expect(s.e4.background).toBe(T.legalDot);
    expect(s.e5.background).toBe(T.legalDot);
    expect(s.d5.boxShadow).toBe(T.legalCaptureShadow);
  });

  it("paints the selected source square last (on top of its own dot)", () => {
    const s = composePuzzleSquareStyles(T, {
      selected: "e2",
      dotSquares: ["e2"],
    });
    expect(s.e2.background).toBe(T.selected);
  });

  it("returns an empty map when nothing is highlighted", () => {
    expect(composePuzzleSquareStyles(T, {})).toEqual({});
  });
});

describe("isPieceDraggable", () => {
  it("lets the side to move pick its own pieces up", () => {
    expect(
      isPieceDraggable({
        piece: "wR",
        sourceSquare: "d1",
        movableColor: "w",
        dragFrom: null,
      })
    ).toBe(true);
  });

  it("refuses the opponent's pieces", () => {
    expect(
      isPieceDraggable({
        piece: "bR",
        sourceSquare: "d8",
        movableColor: "w",
        dragFrom: null,
      })
    ).toBe(false);
  });

  it("refuses everything while the board is inert", () => {
    expect(
      isPieceDraggable({
        piece: "wR",
        sourceSquare: "d1",
        movableColor: null,
        dragFrom: null,
      })
    ).toBe(false);
  });

  // The regression. react-chessboard attaches react-dnd's drag connector as
  // `ref={canDrag ? drag : null}`, and react-dnd's connector cleanup sets
  // `draggable="false"` on the node. Doing that to the element the browser is
  // mid-drag on means the browser never dispatches `dragend`, so nothing ends
  // the drag unless the release happens to land on a drop target: the source
  // piece stays `opacity: 0` (gone from the board) and the fixed-position drag
  // layer keeps painting it beside the board. /puzzles flips its interactive
  // input from six directions, some on timers and some synchronously inside
  // onPieceDrop, so the piece in flight MUST keep its grip until the drag ends.
  it("keeps the in-flight piece draggable after the board goes inert", () => {
    expect(
      isPieceDraggable({
        piece: "wR",
        sourceSquare: "d1",
        movableColor: null, // the solving move already flipped this
        dragFrom: "d1",
      })
    ).toBe(true);
  });

  it("keeps it draggable even once the turn has flipped to the opponent", () => {
    expect(
      isPieceDraggable({
        piece: "wR",
        sourceSquare: "d1",
        movableColor: "b",
        dragFrom: "d1",
      })
    ).toBe(true);
  });

  it("does not widen the exception to any other square", () => {
    expect(
      isPieceDraggable({
        piece: "wR",
        sourceSquare: "a1",
        movableColor: null,
        dragFrom: "d1",
      })
    ).toBe(false);
  });
});
