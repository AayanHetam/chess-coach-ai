import { describe, it, expect } from "vitest";

import {
  toPuzzleContext,
  toPuzzleContexts,
  pickPracticeTheme,
  toStoreTheme,
  isThemeAvailable,
  makeSetId,
  type SimilarPuzzleRow,
} from "../puzzleHandoff";

const row = (over: Partial<SimilarPuzzleRow> = {}): SimilarPuzzleRow => ({
  puzzleId: "0EiQ3",
  fen: "5r1k/1pR1Q1p1/p6p/3p3n/5q2/5P1P/PP4P1/5B1K w - - 0 29",
  moves: "c7b7 h5g3 h1g1 f4d4",
  rating: 1500,
  themes: ["fork", "knight-fork"],
  ...over,
});

describe("toPuzzleContext", () => {
  it("maps a store row into what /puzzles consumes", () => {
    const p = toPuzzleContext(row());
    expect(p).toEqual({
      id: "0EiQ3",
      fen: "5r1k/1pR1Q1p1/p6p/3p3n/5q2/5P1P/PP4P1/5B1K w - - 0 29",
      solution: ["c7b7", "h5g3", "h1g1", "f4d4"],
      rating: 1500,
      themes: ["fork", "knight-fork"],
    });
  });

  it("drops a row with no solver move", () => {
    // Lichess convention: move 0 is the opponent's setup. A single move means
    // there is nothing for the user to play — an unsolvable board.
    expect(toPuzzleContext(row({ moves: "c7b7" }))).toBeNull();
    expect(toPuzzleContext(row({ moves: "" }))).toBeNull();
  });

  it("drops a row missing an id or position", () => {
    expect(toPuzzleContext(row({ puzzleId: "" }))).toBeNull();
    expect(toPuzzleContext(row({ fen: "" }))).toBeNull();
  });

  it("omits a rating outside the schema's range rather than clamping", () => {
    // The schema rejects out-of-range ratings, and a clamped rating would be
    // a fabricated difficulty.
    expect(toPuzzleContext(row({ rating: 99 }))?.rating).toBeUndefined();
    expect(toPuzzleContext(row({ rating: undefined }))?.rating).toBeUndefined();
  });
});

describe("toPuzzleContexts", () => {
  it("keeps order and drops unusable rows", () => {
    const out = toPuzzleContexts([
      row({ puzzleId: "a" }),
      row({ puzzleId: "b", moves: "c7b7" }), // unsolvable
      row({ puzzleId: "c" }),
    ]);
    expect(out.map((p) => p.id)).toEqual(["a", "c"]);
  });

  it("de-duplicates by id", () => {
    // /puzzles grades one result per puzzle id, so a duplicate would silently
    // shorten the set below the count shown to the user.
    const out = toPuzzleContexts([row({ puzzleId: "a" }), row({ puzzleId: "a" })]);
    expect(out).toHaveLength(1);
  });

  it("survives an empty or missing batch", () => {
    expect(toPuzzleContexts([])).toEqual([]);
    expect(toPuzzleContexts(undefined as never)).toEqual([]);
  });
});

describe("pickPracticeTheme", () => {
  it("prefers an explicitly typed theme", () => {
    expect(
      pickPracticeTheme({
        explicit: "skewer",
        mistakeMotifs: ["fork"],
        coachConcepts: ["pin"],
      })
    ).toBe("skewer");
  });

  it("falls back to the motif detected at the mistake, then the coach's concept", () => {
    expect(
      pickPracticeTheme({ mistakeMotifs: ["fork"], coachConcepts: ["pin"] })
    ).toBe("fork");
    expect(pickPracticeTheme({ coachConcepts: ["pin"] })).toBe("pin");
  });

  it("returns null with nothing to go on, rather than guessing", () => {
    // A set built on a guessed theme trains the wrong pattern, so the command
    // has to ask instead.
    expect(pickPracticeTheme({})).toBeNull();
    expect(pickPracticeTheme({ mistakeMotifs: ["", "  "] })).toBeNull();
  });
});

describe("store vocabulary", () => {
  it("translates the keys the store spells differently", () => {
    // Measured against the live corpus: mateIn2 returns nothing, mate-in-2
    // returns a full set.
    expect(toStoreTheme("mateIn2")).toBe("mate-in-2");
    expect(toStoreTheme("mateIn3")).toBe("mate-in-3");
  });

  it("passes through keys the store already understands", () => {
    // The API normalises camelCase itself for these.
    expect(toStoreTheme("backRankMate")).toBe("backRankMate");
    expect(toStoreTheme("fork")).toBe("fork");
  });

  it("flags themes with no puzzles behind them", () => {
    expect(isThemeAvailable("xRayAttack")).toBe(false);
    expect(isThemeAvailable("x-ray-attack")).toBe(false);
    expect(isThemeAvailable("fork")).toBe(true);
  });
});

describe("makeSetId", () => {
  it("is stable for the same inputs and varies by position", () => {
    expect(makeSetId("fork", 24, 1000)).toBe(makeSetId("fork", 24, 1000));
    expect(makeSetId("fork", 24, 1000)).not.toBe(makeSetId("fork", 25, 1000));
  });
});
