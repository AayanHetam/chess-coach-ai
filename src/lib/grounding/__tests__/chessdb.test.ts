import { describe, it, expect, afterEach } from "vitest";

import {
  queryChessdb,
  chessdbResultToContext,
  __setFetchForTesting,
  __resetFetchForTesting,
  __clearChessdbCache,
  type ChessdbResult,
} from "../chessdb";

const result = (partial: Partial<ChessdbResult>): ChessdbResult => ({
  fen: "test-fen",
  best_move: null,
  score_cp: null,
  outcome: "unknown",
  source: "live",
  ...partial,
});

const mockScore = (score: number) => {
  __setFetchForTesting((async () =>
    new Response(JSON.stringify({ status: "ok", move: "e2e4", score }), {
      status: 200,
    })) as typeof fetch);
};

afterEach(() => {
  __resetFetchForTesting();
  __clearChessdbCache();
});

// Regression: the old mapping labeled every |cp| < 200 "draw", and that label
// was injected verbatim into the LLM prompt — "+1.50 pawns (draw for side to
// move)" taught the model factually wrong outcomes.
describe("queryChessdb outcome classification", () => {
  it("classifies |score| < 50 as draw", async () => {
    mockScore(20);
    const r = await queryChessdb("fen-a");
    expect(r?.outcome).toBe("draw");
  });

  it("classifies a clear-but-not-decisive edge (+150) as unclear, NOT draw", async () => {
    mockScore(150);
    const r = await queryChessdb("fen-b");
    expect(r?.outcome).toBe("unclear");
  });

  it("classifies -150 as unclear", async () => {
    mockScore(-150);
    const r = await queryChessdb("fen-c");
    expect(r?.outcome).toBe("unclear");
  });

  it("keeps win at >= 200 and loss at <= -200", async () => {
    mockScore(200);
    expect((await queryChessdb("fen-d"))?.outcome).toBe("win");
    mockScore(-200);
    expect((await queryChessdb("fen-e"))?.outcome).toBe("loss");
  });
});

describe("chessdbResultToContext", () => {
  it("never labels a +1.50 position a draw", () => {
    const ctx = chessdbResultToContext(result({ score_cp: 150, outcome: "unclear" }));
    expect(ctx).toContain("+1.50 pawns");
    expect(ctx).toContain("somewhat better for the side to move");
    expect(ctx).not.toContain("draw");
  });

  it("labels near-equality as roughly equal", () => {
    const ctx = chessdbResultToContext(result({ score_cp: -20, outcome: "draw" }));
    expect(ctx).toContain("roughly equal");
  });

  it("labels decisive scores as winning/losing", () => {
    expect(chessdbResultToContext(result({ score_cp: 320, outcome: "win" })))
      .toContain("winning for the side to move");
    expect(chessdbResultToContext(result({ score_cp: -250, outcome: "loss" })))
      .toContain("losing for the side to move");
  });

  it("labels a negative sub-decisive edge as somewhat worse", () => {
    const ctx = chessdbResultToContext(result({ score_cp: -90, outcome: "unclear" }));
    expect(ctx).toContain("somewhat worse for the side to move");
  });

  it("returns empty string when unknown", () => {
    expect(chessdbResultToContext(result({}))).toBe("");
  });
});
