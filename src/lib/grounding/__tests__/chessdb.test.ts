import { describe, it, expect, afterEach } from "vitest";

import {
  queryChessdb,
  chessdbResultToContext,
  chessdbWhiteView,
  __setFetchForTesting,
  __resetFetchForTesting,
  __clearChessdbCache,
  type ChessdbResult,
} from "../chessdb";

// Positions and the bodies production chessdb served for them on 2026-10-08
// (`cdb.php?action=queryscore&board=<fen>&json=1`). The old fixture mocked
// {status, move, score} — a shape this action never sends, which is how the
// parser reported every lookup as "unknown" with a green suite.
const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
const AFTER_E4_F6 = "rnbqkbnr/ppppp1pp/5p2/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";
const AFTER_F3_E5_G4 = "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2"; // ...Qh4# is on
const KQK_WHITE_TO_MOVE = "8/8/8/4k3/8/8/8/4K2Q w - - 0 1";
const KQK_BLACK_TO_MOVE = "8/8/8/4k3/8/8/8/4K2Q b - - 0 1";
const UNHELD = "1r2r1k1/1p3p1p/pq1p2pB/3P4/2P1n3/1P3N1P/P4QP1/4RRK1 b - - 0 27";
const FOOLS_MATE = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3";

const LIVE = {
  afterE4: { status: "ok", eval: 0, ply: 1 },
  afterE4F6: { status: "ok", eval: 184, ply: 2 },
  mateInOne: { status: "ok", eval: 29999, ply: 3 },
  kqkWhiteToMove: { status: "ok", eval: 24988 },
  kqkBlackToMove: { status: "ok", eval: -24983 },
  unknown: { status: "unknown" },
  checkmate: { status: "checkmate" },
  invalid: { status: "invalid board" },
};

let requested: URL[] = [];

/** Answer every queryscore with `body` and record each request URL. queue's
 * reply is never read, so it gets an empty object. */
const serve = (body: unknown) => {
  __setFetchForTesting((async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    requested.push(url);
    const payload = url.searchParams.get("action") === "queue" ? {} : body;
    return new Response(typeof payload === "string" ? payload : JSON.stringify(payload), { status: 200 });
  }) as typeof fetch);
};

const queued = () => requested.filter((u) => u.searchParams.get("action") === "queue");

const result = (partial: Partial<ChessdbResult>): ChessdbResult => ({
  fen: AFTER_E4_F6,
  score_cp: null,
  mate: null,
  tablebase: false,
  outcome: "unknown",
  source: "live",
  ...partial,
});

afterEach(() => {
  __resetFetchForTesting();
  __clearChessdbCache();
  requested = [];
});

describe("queryChessdb against the live queryscore shape", () => {
  it("asks chessdb over https for queryscore as JSON", async () => {
    serve(LIVE.afterE4);
    await queryChessdb(AFTER_E4);
    const [url] = requested;
    expect(url.origin + url.pathname).toBe("https://www.chessdb.cn/cdb.php");
    expect(url.searchParams.get("action")).toBe("queryscore");
    expect(url.searchParams.get("board")).toBe(AFTER_E4);
    expect(url.searchParams.get("json")).toBe("1");
  });

  it("reads `eval` as side-to-move centipawns for a held position", async () => {
    serve(LIVE.afterE4);
    expect(await queryChessdb(AFTER_E4)).toEqual({
      fen: AFTER_E4,
      score_cp: 0,
      mate: null,
      tablebase: false,
      outcome: "draw",
      source: "live",
    });
    serve(LIVE.afterE4F6);
    const r = await queryChessdb(AFTER_E4_F6);
    expect(r?.score_cp).toBe(184);
    expect(r?.outcome).toBe("unclear");
    expect(queued()).toHaveLength(0);
  });

  it("decodes the engine-mate band ±(30000 − plies) into full moves", async () => {
    serve(LIVE.mateInOne);
    expect(await queryChessdb(AFTER_F3_E5_G4)).toMatchObject({
      score_cp: null,
      mate: 1,
      tablebase: false,
      outcome: "win",
    });
    // queryall scores 2.g4?? (allowing ...Qh4#) in 1.f3 e5 at -29998: mated in 2 plies = 1 move.
    serve({ status: "ok", eval: -29998 });
    expect(await queryChessdb("fen-mated-next-move w - - 0 1")).toMatchObject({ mate: -1, outcome: "loss" });
  });

  it("decodes the tablebase band ±(25000 − n) as a result with no distance", async () => {
    serve(LIVE.kqkWhiteToMove);
    expect(await queryChessdb(KQK_WHITE_TO_MOVE)).toMatchObject({
      score_cp: null,
      mate: null,
      tablebase: true,
      outcome: "win",
    });
    serve(LIVE.kqkBlackToMove);
    expect(await queryChessdb(KQK_BLACK_TO_MOVE)).toMatchObject({ tablebase: true, outcome: "loss" });
  });

  it("queues a position chessdb does not hold", async () => {
    serve(LIVE.unknown);
    const r = await queryChessdb(UNHELD);
    expect(r).toMatchObject({ score_cp: null, mate: null, tablebase: false, outcome: "unknown" });
    expect(queued().map((u) => u.searchParams.get("board"))).toEqual([UNHELD]);
  });

  it("does not queue a checkmated or invalid board", async () => {
    serve(LIVE.checkmate);
    expect((await queryChessdb(FOOLS_MATE))?.outcome).toBe("unknown");
    serve(LIVE.invalid);
    expect((await queryChessdb("notafen"))?.outcome).toBe("unknown");
    expect(queued()).toHaveLength(0);
  });

  it("treats a non-JSON body as a failed lookup", async () => {
    serve("eval:0\u0000"); // the plain-text form, served without json=1
    expect(await queryChessdb(AFTER_E4)).toBeNull();
  });
});

// Regression: the old mapping labeled every |cp| < 200 "draw", and that label
// was injected verbatim into the LLM prompt — "+1.50 pawns (draw for side to
// move)" taught the model factually wrong outcomes.
describe("queryChessdb outcome classification", () => {
  const scored = async (score: number, fen: string) => {
    serve({ status: "ok", eval: score });
    return (await queryChessdb(fen))?.outcome;
  };

  it("classifies |score| < 50 as draw", async () => {
    expect(await scored(20, "fen-a w")).toBe("draw");
  });

  it("classifies a clear-but-not-decisive edge (+150) as unclear, NOT draw", async () => {
    expect(await scored(150, "fen-b w")).toBe("unclear");
  });

  it("classifies -150 as unclear", async () => {
    expect(await scored(-150, "fen-c w")).toBe("unclear");
  });

  it("keeps win at >= 200 and loss at <= -200", async () => {
    expect(await scored(200, "fen-d w")).toBe("win");
    expect(await scored(-200, "fen-e w")).toBe("loss");
  });
});

describe("chessdbWhiteView", () => {
  it("flips a Black-to-move score to White's point of view", () => {
    const view = chessdbWhiteView(result({ fen: AFTER_E4, score_cp: 150, outcome: "unclear" }));
    expect(view).toEqual({ cp: -150, mate: null, verdict: "Black is somewhat better" });
  });

  it("keeps a White-to-move score as is", () => {
    expect(chessdbWhiteView(result({ score_cp: 184, outcome: "unclear" }))?.cp).toBe(184);
  });

  it("reports a flipped 0 as 0, not -0", () => {
    expect(chessdbWhiteView(result({ fen: AFTER_E4, score_cp: 0, outcome: "draw" }))?.cp).toBe(0);
  });

  it("names the mating side", () => {
    expect(chessdbWhiteView(result({ fen: AFTER_F3_E5_G4, mate: 1, outcome: "win" }))).toEqual({
      cp: null,
      mate: -1,
      verdict: "forced mate in 1 for Black",
    });
  });

  it("names the tablebase winner", () => {
    const view = chessdbWhiteView(result({ fen: KQK_BLACK_TO_MOVE, tablebase: true, outcome: "loss" }));
    expect(view).toEqual({ cp: null, mate: null, verdict: "tablebase win for White" });
  });

  it("grounds nothing without a side to move", () => {
    expect(chessdbWhiteView(result({ fen: "no-side", score_cp: 30, outcome: "draw" }))).toBeNull();
  });
});

describe("chessdbResultToContext", () => {
  it("never labels a +1.50 position a draw", () => {
    const ctx = chessdbResultToContext(result({ score_cp: 150, outcome: "unclear" }));
    expect(ctx).toContain("+1.50 pawns");
    expect(ctx).toContain("White is somewhat better");
    expect(ctx).not.toContain("draw");
  });

  it("quotes a Black-to-move score with White's sign", () => {
    const ctx = chessdbResultToContext(result({ fen: AFTER_E4, score_cp: 150, outcome: "unclear" }));
    expect(ctx).toBe("ChessDB cloud-eval: -1.50 pawns (Black is somewhat better).");
  });

  it("labels near-equality as roughly equal", () => {
    const ctx = chessdbResultToContext(result({ score_cp: -20, outcome: "draw" }));
    expect(ctx).toContain("roughly equal");
  });

  it("labels decisive scores as winning", () => {
    expect(chessdbResultToContext(result({ score_cp: 320, outcome: "win" })))
      .toContain("White is winning");
    expect(chessdbResultToContext(result({ score_cp: -250, outcome: "loss" })))
      .toContain("Black is winning");
  });

  it("labels a negative sub-decisive edge as somewhat better for the other side", () => {
    const ctx = chessdbResultToContext(result({ score_cp: -90, outcome: "unclear" }));
    expect(ctx).toContain("Black is somewhat better");
  });

  it("states a forced result without a pawn figure", () => {
    expect(chessdbResultToContext(result({ fen: AFTER_F3_E5_G4, mate: 1, outcome: "win" })))
      .toBe("ChessDB cloud-eval: forced mate in 1 for Black.");
    expect(chessdbResultToContext(result({ fen: KQK_WHITE_TO_MOVE, tablebase: true, outcome: "win" })))
      .toBe("ChessDB cloud-eval: tablebase win for White.");
  });

  it("returns empty string when unknown", () => {
    expect(chessdbResultToContext(result({}))).toBe("");
  });
});
