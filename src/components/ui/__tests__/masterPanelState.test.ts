import { describe, expect, it } from "vitest";

import {
  candidatesForPosition,
  isStartPosition,
  masterLineInsight,
  type ExplorerResult,
} from "@/components/ui/MasterGamesTakeover";

/**
 * The Masters panel's rows are a pure function of (last explorer answer,
 * position on the board). These pin the part that used to go wrong between
 * a click and the network answering.
 */

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

const startAnswer: ExplorerResult = {
  fen: START,
  error: false,
  data: {
    source: "tree",
    hasGameCounts: true,
    moves: [
      {
        uci: "e2e4",
        san: "e4",
        count: 1_601_750,
        white: 701_323,
        draws: 275_722,
      },
      {
        uci: "d2d4",
        san: "d4",
        count: 1_089_291,
        white: 504_288,
        draws: 135_760,
      },
    ],
  },
};

describe("candidatesForPosition", () => {
  it("shows the answer's rows once they are for the position on the board", () => {
    const rows = candidatesForPosition(startAnswer, START);
    expect(rows.map((r) => r.san)).toEqual(["e4", "d4"]);
    expect(rows[0].count).toBe(1_601_750);
  });

  it("shows nothing, not the previous position's rows, until the new position is answered", () => {
    // The user clicked e4: the board is AFTER_E4, the last answer is for
    // START. The old panel kept rendering e4 / d4 here (marking one PLAYED
    // against the new ply) and pushed them to the board as arrows.
    expect(candidatesForPosition(startAnswer, AFTER_E4)).toEqual([]);
    expect(candidatesForPosition(null, AFTER_E4)).toEqual([]);
  });

  it("treats an answer with no rows as out of book, not as missing", () => {
    const outOfBook: ExplorerResult = {
      fen: AFTER_E4,
      error: false,
      data: { moves: [], hasGameCounts: false },
    };
    expect(candidatesForPosition(outOfBook, AFTER_E4)).toEqual([]);
  });

  it("uses the offline fallback only for a failed request at the start position", () => {
    const failedAtStart: ExplorerResult = {
      fen: START,
      data: null,
      error: true,
    };
    const rows = candidatesForPosition(failedAtStart, START);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatchObject({ san: "e4", uci: "e2e4" });

    // Anywhere else a failure shows nothing. This used to be keyed on ply 0,
    // so exploring from the start position (ply still 0) with the request
    // failing listed White's first moves as Black's master replies.
    const failedAfterE4: ExplorerResult = {
      fen: AFTER_E4,
      data: null,
      error: true,
    };
    expect(candidatesForPosition(failedAfterE4, AFTER_E4)).toEqual([]);
  });
});

describe("isStartPosition", () => {
  it("ignores the move counters", () => {
    expect(isStartPosition(START)).toBe(true);
    expect(
      isStartPosition(
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 4 3"
      )
    ).toBe(true);
  });

  it("is false for anything else, including the position after one move", () => {
    expect(isStartPosition(AFTER_E4)).toBe(false);
  });
});

describe("masterLineInsight", () => {
  it("writes the game count the way the rows do, never in millions", () => {
    // 391 games used to render as "0.0M games" on the coach's insight card.
    expect(
      masterLineInsight({ san: "Nf3", uci: "g1f3", count: 391 }).eval
    ).toBe("391 games");
    expect(
      masterLineInsight({ san: "e4", uci: "e2e4", count: 1_601_750 }).eval
    ).toBe("2M games");
    expect(
      masterLineInsight({ san: "b3", uci: "b2b3", count: 53_478 }).eval
    ).toBe("53K games");
  });

  it("prefers the engine eval when the source is an engine", () => {
    const insight = masterLineInsight({
      san: "e4",
      uci: "e2e4",
      count: 0,
      eval: 35,
      rank: 2,
      source: "chessdb",
    });
    expect(insight.tag).toBe("e4 — Master line");
    expect(insight.eval).toBe("+0.35");
    expect(insight.classification).toBe("Best move (engine)");
  });

  it("carries no evidence at all when there is none", () => {
    const insight = masterLineInsight({ san: "h4", uci: "h2h4", count: 0 });
    expect(insight.eval).toBeUndefined();
    expect(insight.classification).toBeUndefined();
  });
});
