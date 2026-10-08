import { describe, expect, it } from "vitest";

import {
  buildCandidatesFromApi,
  candidatesForPosition,
  coachQuestionFor,
  describePosition,
  engineVerdict,
  formatCount,
  formatEval,
  isStartPosition,
  lossVersusBest,
  masterLineInsight,
  nextCandidateIndex,
  positionSummary,
  replayPreviewMove,
  resultSplit,
  shareOf,
  type ExplorerResult,
  type MasterCandidate,
} from "@/components/ui/MasterGamesPanel";

/**
 * The Masters panel is a pure function of (last explorer answer, position on
 * the board). The repo's vitest env is node with no DOM, so what is pinned
 * here is everything the panel computes before it draws.
 */

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

const row = (
  partial: Partial<MasterCandidate> & { san: string }
): MasterCandidate => ({
  uci: "",
  count: 0,
  ...partial,
});

describe("buildCandidatesFromApi", () => {
  it("keeps a real count below the old 1000-game guess threshold", () => {
    // The regression: counts used to be zeroed when the row sum was under
    // 1000, which is most of the tree past the opening.
    const [c] = buildCandidatesFromApi(
      {
        source: "tree",
        hasGameCounts: true,
        moves: [
          {
            uci: "e2e4",
            san: "e4",
            count: 391,
            white: 160,
            draws: 120,
            black: 111,
          },
        ],
      },
      START
    );
    expect(c.count).toBe(391);
    expect(c.whiteWins).toBe(160);
    expect(c.source).toBe("tree");
  });

  it("reports no games and no result split for an engine-only source", () => {
    const [c] = buildCandidatesFromApi(
      {
        source: "chessdb",
        hasGameCounts: false,
        moves: [{ uci: "e2e4", eval: 21, rank: 2, winrate: 50.4 }],
      },
      START
    );
    expect(c.count).toBe(0);
    expect(c.whiteWins).toBeUndefined();
    expect(c.eval).toBe(21);
    // chessdb sends no SAN; it is derived from the position.
    expect(c.san).toBe("e4");
  });

  it("sums a lichess-shaped colour split into a count", () => {
    const [c] = buildCandidatesFromApi(
      {
        source: "lichess",
        moves: [
          {
            uci: "e2e4",
            san: "e4",
            white: 1_400_000,
            draws: 900_000,
            black: 500_000,
          },
        ],
      },
      START
    );
    expect(c.count).toBe(2_800_000);
  });

  it("treats a body without rows as no rows", () => {
    expect(
      buildCandidatesFromApi({ moves: undefined as never }, START)
    ).toEqual([]);
  });
});

describe("candidatesForPosition", () => {
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

  it("shows the answer's rows once they are for the position on the board", () => {
    expect(candidatesForPosition(startAnswer, START).map((r) => r.san)).toEqual(
      ["e4", "d4"]
    );
  });

  it("shows nothing, not the previous position's rows, until the new position is answered", () => {
    expect(candidatesForPosition(startAnswer, AFTER_E4)).toEqual([]);
    expect(candidatesForPosition(null, AFTER_E4)).toEqual([]);
  });

  it("treats an answer with no rows as out of book", () => {
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
    const failedAfterE4: ExplorerResult = {
      fen: AFTER_E4,
      data: null,
      error: true,
    };
    expect(candidatesForPosition(failedAfterE4, AFTER_E4)).toEqual([]);
  });
});

describe("isStartPosition / describePosition", () => {
  it("recognises the start position whatever the counters say", () => {
    expect(isStartPosition(START)).toBe(true);
    expect(
      isStartPosition(
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 4 3"
      )
    ).toBe(true);
    expect(isStartPosition(AFTER_E4)).toBe(false);
  });

  it("reads move number and side to move from the FEN, not from a ply", () => {
    // ceil(ply/2)||1 used to say "Move 1" at ply 2; the FEN knows better,
    // and stays right while the board is off the mainline.
    expect(describePosition(START)).toEqual({
      moveNumber: 1,
      sideToMove: "White",
    });
    expect(describePosition(AFTER_E4)).toEqual({
      moveNumber: 1,
      sideToMove: "Black",
    });
    expect(
      describePosition(
        "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2"
      )
    ).toEqual({ moveNumber: 2, sideToMove: "White" });
  });
});

describe("shares and results", () => {
  const rows = [
    row({ san: "e4", count: 600, whiteWins: 300, draws: 100, blackWins: 200 }),
    row({ san: "d4", count: 300, whiteWins: 100, draws: 100, blackWins: 100 }),
  ];

  it("divides shares by the games that reached the position, not by the rows shown", () => {
    // A capped list would otherwise make a rare branch look common.
    const s = positionSummary(rows, 1_000)!;
    expect(s.games).toBe(1_000);
    expect(shareOf(600, s.games)).toBeCloseTo(0.6);
    // With no arrival count the rows are all there is.
    expect(positionSummary(rows)!.games).toBe(900);
    // A total below the row sum is corrupt; the rows win.
    expect(positionSummary(rows, 10)!.games).toBe(900);
  });

  it("aggregates the position's results across its rows", () => {
    const s = positionSummary(rows, 1_000)!;
    expect(s.split!.white).toBeCloseTo(400 / 900);
    expect(s.split!.draws).toBeCloseTo(200 / 900);
    expect(s.split!.black).toBeCloseTo(300 / 900);
  });

  it("is null for engine rows, which have no games", () => {
    expect(positionSummary([row({ san: "e4", eval: 30, rank: 2 })])).toBeNull();
    expect(resultSplit(row({ san: "e4", eval: 30 }))).toBeNull();
  });

  it("splits one move's games into fractions that sum to one", () => {
    const split = resultSplit(rows[0])!;
    expect(split.white + split.draws + split.black).toBeCloseTo(1);
    expect(split.white).toBeCloseTo(0.5);
  });
});

describe("engine rows", () => {
  const engineRows = [
    row({ san: "Qf6", eval: -4, rank: 2 }),
    row({ san: "Nf6", eval: 0, rank: 1 }),
    row({ san: "Qe7", eval: 27, rank: 0 }),
  ];

  it("names chessdb's ranks: 2 top, 1 playable, 0 inferior", () => {
    expect(engineVerdict(engineRows[0])).toBe("top");
    expect(engineVerdict(engineRows[1])).toBe("playable");
    expect(engineVerdict(engineRows[2])).toBe("inferior");
    expect(engineVerdict(row({ san: "e4", count: 5 }))).toBeNull();
  });

  it("measures the loss against the best row from the mover's side", () => {
    // Evals are from White's side; with Black to move the LOWEST is best.
    expect(lossVersusBest(engineRows[0], engineRows, "Black")).toBe(0);
    expect(lossVersusBest(engineRows[1], engineRows, "Black")).toBe(4);
    expect(lossVersusBest(engineRows[2], engineRows, "Black")).toBe(31);
    // Same rows with White to move: the HIGHEST is best.
    expect(lossVersusBest(engineRows[2], engineRows, "White")).toBe(0);
    expect(lossVersusBest(engineRows[0], engineRows, "White")).toBe(31);
    expect(
      lossVersusBest(row({ san: "e4", count: 5 }), engineRows, "White")
    ).toBeNull();
  });

  it("formats evals in pawns and mates as mate distances", () => {
    expect(formatEval(35)).toBe("+0.35");
    expect(formatEval(-274)).toBe("-2.74");
    expect(formatEval(0)).toBe("0.00");
    expect(formatEval(29_995)).toBe("#3");
    expect(formatEval(-29_998)).toBe("#-1");
  });
});

describe("formatCount", () => {
  it("keeps one decimal under ten million so 1.4M and 1.6M differ", () => {
    expect(formatCount(1_601_750)).toBe("1.6M");
    expect(formatCount(1_400_000)).toBe("1.4M");
    expect(formatCount(12_000_000)).toBe("12M");
    expect(formatCount(53_478)).toBe("53K");
    expect(formatCount(1_500)).toBe("1.5K");
    expect(formatCount(391)).toBe("391");
    expect(formatCount(0)).toBe("0");
  });
});

describe("what goes to the coach", () => {
  it("writes the game count the way the rows do, never in millions of a decimal", () => {
    // 391 games used to render as "0.0M games" on the insight card.
    expect(masterLineInsight(row({ san: "Nf3", count: 391 })).eval).toBe(
      "391 games"
    );
    expect(masterLineInsight(row({ san: "e4", count: 1_601_750 })).eval).toBe(
      "1.6M games"
    );
  });

  it("carries the result split for a master row and the verdict for an engine row", () => {
    const master = masterLineInsight(
      row({ san: "e4", count: 100, whiteWins: 50, draws: 30, blackWins: 20 })
    );
    expect(master.tag).toBe("e4 — Master line");
    expect(master.classification).toBe("White 50% · draw 30% · Black 20%");
    const engine = masterLineInsight(
      row({ san: "e4", eval: 35, rank: 2, source: "chessdb" })
    );
    expect(engine.eval).toBe("+0.35");
    expect(engine.classification).toBe("Engine's top choice");
    expect(masterLineInsight(row({ san: "h4" })).eval).toBeUndefined();
  });

  it("asks a question that carries the evidence the row shows", () => {
    const q = coachQuestionFor(
      row({
        san: "d6",
        count: 68_000,
        whiteWins: 34_000,
        draws: 17_000,
        blackWins: 17_000,
      }),
      "Black"
    );
    expect(q).toContain("Tell me about d6 from this position");
    expect(q).toContain("68K master games");
    expect(q).toContain("White won 50%");
    expect(q).toContain("Black need");
    const e = coachQuestionFor(row({ san: "Qf6", eval: -4, rank: 2 }), "Black");
    expect(e).toContain("the engine gives -0.04, top choice");
  });
});

describe("replayPreviewMove", () => {
  it("chains moves on the previously displayed FEN", () => {
    const first = replayPreviewMove(START, "e2e4")!;
    expect(first.san).toBe("e4");
    const second = replayPreviewMove(first.fen, "e7e5")!;
    expect(second.san).toBe("e5");
    expect(second.fen.split(" ")[1]).toBe("w");
  });

  it("returns null for an illegal or malformed move instead of throwing", () => {
    expect(replayPreviewMove(START, "e7e5")).toBeNull();
    expect(replayPreviewMove(START, "")).toBeNull();
    expect(replayPreviewMove(START, "e2")).toBeNull();
  });
});

describe("nextCandidateIndex", () => {
  it("wraps at both ends and is 0 for an empty list", () => {
    expect(nextCandidateIndex(4, 5, 1)).toBe(0);
    expect(nextCandidateIndex(0, 5, -1)).toBe(4);
    expect(nextCandidateIndex(2, 5, 1)).toBe(3);
    expect(nextCandidateIndex(0, 0, 1)).toBe(0);
  });
});
