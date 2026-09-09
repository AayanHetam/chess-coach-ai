import { describe, it, expect } from "vitest";
import { createStore } from "jotai";
import {
  answerModeAtom,
  confirmMovesAtom,
  hideSolveTimerAtom,
} from "../puzzlePrefs";

/**
 * The shipped defaults for a device that has never toggled anything — i.e.
 * what a first-time visitor (the GM's case) actually gets. atomWithStorage
 * only consults storage on mount, so a fresh store reads the initial value.
 */
describe("puzzle prefs defaults", () => {
  it("does not stage moves by default — a drop is graded on the spot", () => {
    // Flipped 2026-09-08 after GM Alex Colovic's review; see puzzlePrefs.ts.
    expect(createStore().get(confirmMovesAtom)).toBe(false);
  });

  it("answers on the board, with the solve clock showing", () => {
    expect(createStore().get(answerModeAtom)).toBe("board");
    expect(createStore().get(hideSolveTimerAtom)).toBe(false);
  });
});
