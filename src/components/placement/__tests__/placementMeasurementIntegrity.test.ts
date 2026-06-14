import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Measurement-integrity guard for the placement test.
 *
 * The placement test measures the user's rating, so the board must NEVER
 * surface a hint, solution reveal, move arrow, or AI coach — any of which
 * would corrupt the measured Elo. The unified PuzzleBoardSurface has no coach
 * concept; the only way a hint could reach a board is the generic
 * `underlaySquareStyles` seam or by mounting a coach panel. This test asserts
 * the placement surfaces touch neither, so a future well-meaning "add a coach
 * to the board" change fails CI here instead of silently corrupting ratings.
 *
 * Source-level (not a render) because the repo's vitest env is node-only.
 * SessionRunner reuses PlacementBoard, so guarding that one file covers both.
 */

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

const FORBIDDEN_ON_MEASUREMENT_BOARD = [
  "underlaySquareStyles", // the coach-overlay seam — must not be wired here
  "coachHighlights",
  "PuzzleCoachPanel",
  "InlinePuzzleCoach",
  "puzzle-chat", // /api/puzzle-chat
  "puzzle-hint", // /api/puzzle-hint
];

describe("placement measurement integrity", () => {
  it("PlacementBoard renders the shared board with NO coach/hint seam", () => {
    const src = read("../PlacementBoard.tsx");
    // It IS on the unified board…
    expect(src).toContain("PuzzleBoardSurface");
    // …but exposes no path for a hint/coach to reach it.
    for (const token of FORBIDDEN_ON_MEASUREMENT_BOARD) {
      expect(src, `PlacementBoard must not reference "${token}"`).not.toContain(
        token,
      );
    }
  });

  it("PlacementTest mounts no coach panel during the measurement", () => {
    const src = read("../PlacementTest.tsx");
    expect(src).not.toContain("PuzzleCoachPanel");
    expect(src).not.toContain("InlinePuzzleCoach");
    expect(src).not.toContain("puzzle-chat");
  });
});
