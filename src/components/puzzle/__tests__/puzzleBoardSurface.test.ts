import { describe, it, expect } from "vitest";
import {
  composePuzzleSquareStyles,
  DEFAULT_PUZZLE_THEME,
  type SquareStyleParts,
} from "../boardTheme";

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
