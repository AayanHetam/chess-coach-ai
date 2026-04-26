import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/neo4j", () => ({
  isNeo4jConfigured: vi.fn(() => true),
  executeRead: vi.fn(),
}));

import { executeRead } from "@/lib/neo4j";
import { getReinforcements } from "../conceptRetrieval";

const mockedExecuteRead = vi.mocked(executeRead);

const ANCHOR_FEN =
  "r1bq1rk1/ppp2ppp/2n2n2/2bpp3/4P3/2NP1N2/PPP1BPPP/R1BQ1RK1 w - - 0 8";

beforeEach(() => {
  mockedExecuteRead.mockReset();
});

describe("getReinforcements — themes contract", () => {
  it("concept-path: every returned puzzle carries themes from HAS_THEME projection", async () => {
    mockedExecuteRead.mockResolvedValueOnce([
      {
        puzzleId: "abc123",
        fen: ANCHOR_FEN,
        moves: "e2e4 e7e5",
        rating: 1500,
        themes: ["fork", "pin", "middlegame"],
        concepts: [{ id: "double-attack", confidence: 0.9 }],
        maxConfidence: 0.9,
      },
    ]);

    const result = await getReinforcements({
      anchorFen: ANCHOR_FEN,
      anchorConcepts: ["double-attack"],
      userElo: 1500,
      limit: 1,
    });

    expect(result.fallbackUsed).toBe("concept");
    expect(result.puzzles).toHaveLength(1);
    expect(Array.isArray(result.puzzles[0].themes)).toBe(true);
    expect(result.puzzles[0].themes).toEqual(["fork", "pin", "middlegame"]);
  });

  it("theme-fallback path: every returned puzzle carries themes from HAS_THEME projection", async () => {
    mockedExecuteRead.mockResolvedValueOnce([
      {
        puzzleId: "xyz789",
        fen: ANCHOR_FEN,
        moves: "g1f3 b8c6",
        rating: 1450,
        themes: ["exposed-king", "attack"],
        overlap: 1,
      },
    ]);

    const result = await getReinforcements({
      anchorFen: ANCHOR_FEN,
      anchorConcepts: [],
      themes: ["exposed-king"],
      userElo: 1500,
      limit: 1,
    });

    expect(result.fallbackUsed).toBe("theme");
    expect(result.puzzles).toHaveLength(1);
    expect(Array.isArray(result.puzzles[0].themes)).toBe(true);
    expect(result.puzzles[0].themes).toEqual(["exposed-king", "attack"]);
  });
});
