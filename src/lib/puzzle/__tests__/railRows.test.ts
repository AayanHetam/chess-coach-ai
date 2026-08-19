import { describe, expect, it } from "vitest";
import { buildRailRows } from "@/lib/puzzle/railRows";
import type { PuzzleContext } from "@/lib/validation/puzzleChatSchemas";
import type { SessionResult } from "@/lib/puzzleSession";

function puzzle(id: string, over: Partial<PuzzleContext> = {}): PuzzleContext {
  return {
    id,
    fen: "8/8/8/8/8/8/8/K6k w - - 0 1",
    solution: ["a1a2"],
    themes: ["endgame"],
    rating: 1122,
    ...over,
  } as PuzzleContext;
}

function result(
  id: string,
  solved: boolean,
  over: Partial<SessionResult> = {}
): SessionResult {
  return {
    id,
    ratingBefore: 1200,
    ratingAfter: 1210,
    solved,
    theme: "endgame",
    timeMs: 5000,
    puzzle: puzzle(id),
    ...over,
  };
}

const base = { upcoming: [], upcomingLimit: 8 };

describe("buildRailRows — one row per puzzle", () => {
  it("does not list the current puzzle twice once it is graded", () => {
    // The reported bug: solve a puzzle and the rail shows "Endgame 1122" with
    // a green check AND "Endgame 1122" as the active row. One puzzle, two
    // lines, because a solved puzzle stays `currentPuzzle` until you press
    // "New puzzle".
    const rows = buildRailRows({
      ...base,
      results: [result("p1", true)],
      currentPuzzle: puzzle("p1"),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].state).toBe("solved");
    expect(rows[0].isCurrent).toBe(true);
  });

  it("keeps the graded outcome AND the you-are-here highlight", () => {
    // Both facts survive on the single row — dropping the current row outright
    // would fix the duplicate but lose the position indicator.
    const rows = buildRailRows({
      ...base,
      results: [result("p1", false)],
      currentPuzzle: puzzle("p1"),
    });
    expect(rows[0].state).toBe("failed");
    expect(rows[0].isCurrent).toBe(true);
  });

  it("still shows a current row for an ungraded puzzle", () => {
    const rows = buildRailRows({
      ...base,
      results: [],
      currentPuzzle: puzzle("p1"),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].state).toBe("current");
    expect(rows[0].isCurrent).toBe(true);
  });

  it("marks exactly one row as current, ever", () => {
    const rows = buildRailRows({
      ...base,
      results: [result("p1", true), result("p2", false)],
      currentPuzzle: puzzle("p2"),
      upcoming: [puzzle("p3"), puzzle("p4")],
    });
    expect(rows.filter((r) => r.isCurrent)).toHaveLength(1);
    expect(rows.filter((r) => r.isCurrent)[0].key).toContain("p2");
  });

  it("highlights the LATEST attempt when a puzzle was retried", () => {
    // The re-practice queue can put the same puzzle back. Marking every past
    // attempt current would highlight several rows and duplicate aria-current.
    const rows = buildRailRows({
      ...base,
      results: [result("p1", false), result("p2", true), result("p1", true)],
      currentPuzzle: puzzle("p1"),
    });
    const current = rows.filter((r) => r.isCurrent);
    expect(current).toHaveLength(1);
    expect(current[0].state).toBe("solved"); // the retry, not the first miss
    expect(rows).toHaveLength(3);
  });
});

describe("buildRailRows — ordering and content", () => {
  it("reads graded, then current, then queued", () => {
    const rows = buildRailRows({
      ...base,
      results: [result("p1", true)],
      currentPuzzle: puzzle("p2"),
      upcoming: [puzzle("p3")],
    });
    expect(rows.map((r) => r.state)).toEqual(["solved", "current", "upcoming"]);
  });

  it("only queued rows are jumpable", () => {
    // A consumed puzzle cannot be brought back, so those rows must be inert
    // rather than misleadingly clickable.
    const rows = buildRailRows({
      ...base,
      results: [result("p1", true)],
      currentPuzzle: puzzle("p2"),
      upcoming: [puzzle("p3")],
    });
    expect(rows.find((r) => r.state === "solved")?.jumpId).toBeUndefined();
    expect(rows.find((r) => r.state === "current")?.jumpId).toBeUndefined();
    expect(rows.find((r) => r.state === "upcoming")?.jumpId).toBe("p3");
  });

  it("honours the upcoming limit so the rail is not a wall", () => {
    const rows = buildRailRows({
      results: [],
      currentPuzzle: null,
      upcoming: Array.from({ length: 20 }, (_, i) => puzzle(`q${i}`)),
      upcomingLimit: 3,
    });
    expect(rows).toHaveLength(3);
  });

  it("falls back to the result's theme when the puzzle blob is missing", () => {
    const r = result("p1", true);
    const rows = buildRailRows({
      ...base,
      results: [{ ...r, puzzle: undefined as unknown as PuzzleContext }],
      currentPuzzle: null,
    });
    expect(rows[0].label).toBe("Endgame");
  });

  it("produces unique keys when the same puzzle appears twice", () => {
    // Duplicate React keys are their own class of rendering bug.
    const rows = buildRailRows({
      ...base,
      results: [result("p1", false), result("p1", true)],
      currentPuzzle: null,
    });
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });

  it("handles an empty session", () => {
    expect(
      buildRailRows({ results: [], currentPuzzle: null, ...base })
    ).toEqual([]);
  });
});
