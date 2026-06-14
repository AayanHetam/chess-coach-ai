import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * In-chat inline puzzles are throwaway reps — low-signal, theme-clustered,
 * possibly repeated — so they must NEVER move the single global ELO. Today
 * that's guaranteed only by NOT wiring usePuzzleBoardState's onSolved/onWrong
 * callbacks. This guard makes that contract explicit so a future "wire grading
 * for consistency" change fails CI instead of silently polluting the rating.
 *
 * Source-level (repo vitest is node-only). Migrating the board to the shared
 * PuzzleBoardSurface doesn't change this — the board never grades — but we pin
 * it here regardless.
 */

const src = readFileSync(
  new URL("../InlinePuzzleSet.tsx", import.meta.url),
  "utf8",
);

describe("inline in-chat puzzles never grade the global ELO", () => {
  it("does not import or call updatePuzzleStats", () => {
    expect(src).not.toContain("updatePuzzleStats");
    expect(src).not.toContain("puzzleStatsAtom");
  });

  it("does not wire the hook's grading callbacks (onSolved/onWrong)", () => {
    expect(src).not.toContain("onSolved");
    expect(src).not.toContain("onWrong");
  });

  it("renders on the shared board", () => {
    expect(src).toContain("PuzzleBoardSurface");
  });
});
