import { describe, it, expect } from "vitest";

import { buildCandidatesFromApi } from "../MasterGamesTakeover";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/**
 * How the explorer response becomes rows.
 *
 * Whether a response carries game counts used to be GUESSED, with
 * `total > 1000` — the reasoning being that only a real games database
 * returns thousands. Every genuine position played fewer than 1000 times in
 * the corpus was therefore zeroed and rendered as "no data", which is most of
 * the tree past the opening. The API now states it (`hasGameCounts`).
 */
describe("buildCandidatesFromApi — game counts vs engine analysis", () => {
  it("keeps a real count below the old 1000-game guess threshold", () => {
    const [candidate] = buildCandidatesFromApi(
      {
        source: "tree",
        hasGameCounts: true,
        moves: [
          { uci: "e2e4", san: "e4", count: 391, white: 160, draws: 120, black: 111 },
        ],
      },
      START
    );
    // The regression: this was silently 0 because 391 < 1000.
    expect(candidate.count).toBe(391);
    expect(candidate.whiteWins).toBe(160);
  });

  it("reports no games for an engine-only source, and no result split", () => {
    const [candidate] = buildCandidatesFromApi(
      {
        source: "chessdb",
        hasGameCounts: false,
        // chessdb returns no counts at all. It used to be handed a
        // synthesized 750/250 split here, which rendered as ~1000 master
        // games at every off-tree position.
        moves: [{ uci: "e2e4", eval: 21, rank: 2, winrate: 50.4 }],
      },
      START
    );
    expect(candidate.count).toBe(0);
    expect(candidate.whiteWins).toBeUndefined();
    expect(candidate.draws).toBeUndefined();
    expect(candidate.blackWins).toBeUndefined();
    // The engine data itself still comes through — that is what gets shown.
    expect(candidate.eval).toBe(21);
    expect(candidate.winrate).toBeCloseTo(50.4);
  });

  it("derives SAN when the source only sends UCI", () => {
    const [candidate] = buildCandidatesFromApi(
      { source: "chessdb", hasGameCounts: false, moves: [{ uci: "g1f3" }] },
      START
    );
    expect(candidate.san).toBe("Nf3");
  });

  it("treats a response with no flag as carrying counts (older cached bodies)", () => {
    const [candidate] = buildCandidatesFromApi(
      {
        source: "tree",
        moves: [
          { uci: "e2e4", san: "e4", count: 12, white: 5, draws: 4, black: 3 },
        ],
      },
      START
    );
    expect(candidate.count).toBe(12);
  });
});
