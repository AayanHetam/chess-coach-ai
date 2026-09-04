// A player must never fall off their own leaderboard. Ranks are shared between
// tied scores, display positions are not, so "rank <= rows shown" is not the
// same question as "can they see themselves" — and the two diverge exactly
// where the board is most crowded.

import { describe, expect, it } from "vitest";
import { shouldShowOwnRank } from "../RushLeaderboard";

const row = (handle: string, score: number) => ({ handle, score });
const ten = Array.from({ length: 10 }, (_, i) => row(`p${i}`, 30 - i));

describe("shouldShowOwnRank", () => {
  it("says nothing about a reader with no score", () => {
    expect(shouldShowOwnRank(ten, "ana", null)).toBe(false);
  });

  it("stays quiet when the reader is already on the board", () => {
    expect(
      shouldShowOwnRank([...ten.slice(0, 9), row("ana", 5)], "ana", 10)
    ).toBe(false);
  });

  it("speaks up when the reader is below the last visible row", () => {
    expect(shouldShowOwnRank(ten, "ana", 214)).toBe(true);
  });

  it("speaks up for a tied reader pushed off the board by the tie", () => {
    // Nine better scores, then three players tied on 20: all rank 10, but the
    // third of them is displayed 12th and is not among the ten rows shown.
    const board = [
      ...Array.from({ length: 9 }, (_, i) => row(`p${i}`, 30 - i)),
      row("tie1", 20),
    ];
    expect(shouldShowOwnRank(board, "ana", 10)).toBe(true);
  });

  it("falls back to showing the row when the reader has no handle to match", () => {
    expect(shouldShowOwnRank(ten, null, 4)).toBe(true);
  });
});
