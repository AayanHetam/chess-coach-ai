import { describe, expect, it, vi, beforeEach } from "vitest";
import { Chess } from "chess.js";

/**
 * `evaluateMoves`: the asked moves scored in ONE search at ONE depth, with
 * UCI `searchmoves` and MultiPV equal to their number. The fake worker
 * below answers a `go … searchmoves a b` the way Stockfish does: one info
 * line per asked move per depth, slots numbered by score (so the order
 * changes between depths), scores from the side to move, then `bestmove`.
 */

const { mockGetEngineWorker } = vi.hoisted(() => ({
  mockGetEngineWorker: vi.fn(),
}));

vi.mock("../worker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../worker")>();
  return { ...actual, getEngineWorker: mockGetEngineWorker };
});

import { UciEngine } from "../uciEngine";
import {
  parseMovesResults,
  normaliseAskedMoves,
  legalUciMoves,
} from "../helpers/parseMovesResults";
import { EngineName } from "@/types/enums";

// Fixture 07 before 8.Nc7+: White to move, the queen on c1 is Black's and hanging.
const MOVES =
  "e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Qb6 Nf3 Qxb2 Na3 Qxa1 Nb5 Qxc1 Nc7+ Kd8".split(
    " "
  );
function fenAfter(n: number): string {
  const g = new Chess();
  MOVES.slice(0, n).forEach((m) => g.move(m));
  return g.fen();
}
const WHITE_TO_MOVE = fenAfter(14); // 8.Nc7+ (b5c7) or 8.Qxc1 (d1c1)
// After 1.e4 e5 2.Nf3: Black to move, with ...Nc6 (b8c6) and ...d6 (d7d6) both legal.
const BLACK_TO_MOVE =
  "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2";

/** Side-to-move scores per asked move per depth, as the engine would say them. */
type Script = Record<
  string,
  Array<{
    depth: number;
    cp?: number;
    mate?: number;
    pv: string[];
    bound?: string;
  }>
>;

function makeSearchmovesWorker(
  script: Script,
  bestmove: string,
  opts: { dropMove?: string } = {}
) {
  const sent: string[] = [];
  const worker = {
    isReady: false,
    uci: (cmd: string) => {
      sent.push(cmd);
      queueMicrotask(() => {
        if (cmd === "uci") worker.listen("uciok");
        else if (cmd === "isready") worker.listen("readyok");
        else if (cmd.startsWith("go")) {
          const m = /searchmoves (.+)$/.exec(cmd);
          const asked = m ? m[1].split(" ") : [];
          const depths = Array.from(
            new Set(asked.flatMap((u) => (script[u] ?? []).map((l) => l.depth)))
          ).sort((a, b) => a - b);
          for (const depth of depths) {
            // Slots are numbered by score at this depth: best first for the mover.
            const atDepth = asked
              .filter((u) => u !== opts.dropMove)
              .map((u) => ({
                uci: u,
                line: (script[u] ?? []).find((l) => l.depth === depth),
              }))
              .filter((x) => x.line)
              .sort(
                (a, b) =>
                  (b.line!.cp ?? (b.line!.mate! > 0 ? 9999 : -9999)) -
                  (a.line!.cp ?? (a.line!.mate! > 0 ? 9999 : -9999))
              );
            atDepth.forEach(({ line }, i) => {
              const score =
                line!.mate !== undefined
                  ? `mate ${line!.mate}`
                  : `cp ${line!.cp}`;
              const bound = line!.bound ? ` ${line!.bound}` : "";
              worker.listen(
                `info depth ${depth} seldepth ${depth + 4} multipv ${i + 1} score ${score}${bound} nodes 1000 nps 100000 time 10 pv ${line!.pv.join(" ")}`
              );
            });
          }
          worker.listen(`bestmove ${bestmove} ponder e7e5`);
        }
      });
    },
    listen: (_data: string) => {},
    terminate: vi.fn(),
    errored: new Promise<Error>(() => {}),
  };
  return { worker, sent };
}

const WHITE_SCRIPT: Script = {
  d1c1: [
    { depth: 8, cp: 280, pv: ["d1c1", "a8b8", "c1f4"] },
    { depth: 12, cp: 284, pv: ["d1c1", "a8b8", "c1f4", "f7f6"] },
  ],
  b5c7: [
    { depth: 8, cp: -150, pv: ["b5c7", "e8d8", "c7a8"] },
    { depth: 12, cp: -211, pv: ["b5c7", "e8d8", "c7a8", "a1d1"] },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("evaluateMoves: the search it issues", () => {
  it("sets MultiPV to the number of moves, clears the table, and restricts the root with searchmoves", async () => {
    const { worker, sent } = makeSearchmovesWorker(WHITE_SCRIPT, "d1c1");
    mockGetEngineWorker.mockReturnValue(worker);
    const engine = await UciEngine.create(EngineName.Stockfish17Lite, "x.js");

    const result = await engine.evaluateMoves({
      fen: WHITE_TO_MOVE,
      moves: ["b5c7", "d1c1"],
      depth: 12,
    });

    expect(sent).toContain("setoption name MultiPV value 2");
    const goIndex = sent.findIndex((c) => c.startsWith("go "));
    expect(sent[goIndex]).toBe("go depth 12 searchmoves b5c7 d1c1");
    expect(sent[goIndex - 1]).toBe(`position fen ${WHITE_TO_MOVE}`);
    // The table is cleared after the handshake's own ucinewgame, right before this search.
    const lastNewGame = sent.lastIndexOf("ucinewgame");
    expect(lastNewGame).toBeGreaterThan(sent.indexOf("uciok") === -1 ? 0 : 0);
    expect(lastNewGame).toBeLessThan(goIndex);
    expect(sent.slice(lastNewGame, goIndex)).toEqual([
      "ucinewgame",
      "isready",
      `position fen ${WHITE_TO_MOVE}`,
    ]);
    expect(result.cold).toBe(true);
    expect(result.source).toBe("local");
  });

  it("rejects an illegal move, an empty list and more than ten moves before any command is sent", async () => {
    const { worker, sent } = makeSearchmovesWorker(WHITE_SCRIPT, "d1c1");
    mockGetEngineWorker.mockReturnValue(worker);
    const engine = await UciEngine.create(EngineName.Stockfish17Lite, "x.js");
    const sentBefore = sent.length;

    await expect(
      engine.evaluateMoves({ fen: WHITE_TO_MOVE, moves: ["e2e4"] })
    ).rejects.toThrow(/not legal/);
    await expect(
      engine.evaluateMoves({ fen: WHITE_TO_MOVE, moves: [] })
    ).rejects.toThrow(/no moves/);
    const eleven = legalUciMoves(WHITE_TO_MOVE).slice(0, 11);
    expect(eleven).toHaveLength(11);
    await expect(
      engine.evaluateMoves({ fen: WHITE_TO_MOVE, moves: eleven })
    ).rejects.toThrow(/at most 10/);
    expect(sent.length).toBe(sentBefore);
  });
});

describe("evaluateMoves: what comes back", () => {
  it("keys each line by its first move, not its slot, and orders by the mover's preference", async () => {
    const { worker } = makeSearchmovesWorker(WHITE_SCRIPT, "d1c1");
    mockGetEngineWorker.mockReturnValue(worker);
    const engine = await UciEngine.create(EngineName.Stockfish17Lite, "x.js");

    const result = await engine.evaluateMoves({
      fen: WHITE_TO_MOVE,
      moves: ["b5c7", "d1c1"],
      depth: 12,
    });

    expect(result.moves.map((m) => m.uci)).toEqual(["d1c1", "b5c7"]);
    expect(result.moves[0]).toEqual({
      uci: "d1c1",
      san: "Qxc1",
      cp: 284,
      mate: undefined,
      depth: 12,
      pv: ["d1c1", "a8b8", "c1f4", "f7f6"],
    });
    expect(result.moves[1]).toMatchObject({
      uci: "b5c7",
      san: "Nc7+",
      cp: -211,
      depth: 12,
    });
    expect(result.depth).toBe(12);
    expect(result.missing).toEqual([]);
    expect(result.bestMove).toBe("d1c1");
  });

  it("flips scores to White-relative when Black is to move, mates included", async () => {
    const script: Script = {
      b8c6: [{ depth: 12, cp: 150, pv: ["b8c6", "f1b5", "a7a6"] }], // good for Black (the mover)
      d7d6: [{ depth: 12, mate: -3, pv: ["d7d6", "f1c4"] }], // Black gets mated in 3
    };
    const { worker } = makeSearchmovesWorker(script, "b8c6");
    mockGetEngineWorker.mockReturnValue(worker);
    const engine = await UciEngine.create(EngineName.Stockfish17Lite, "x.js");

    const result = await engine.evaluateMoves({
      fen: BLACK_TO_MOVE,
      moves: ["d7d6", "b8c6"],
      depth: 12,
    });

    const nc6 = result.moves.find((m) => m.uci === "b8c6")!;
    const d6 = result.moves.find((m) => m.uci === "d7d6")!;
    expect(nc6.cp).toBe(-150); // Black ahead by 1.5 reads as -1.50 for White
    expect(d6.mate).toBe(3); // White mates in 3
    expect(result.moves.map((m) => m.uci)).toEqual(["b8c6", "d7d6"]); // the mover's best first
    expect(nc6.san).toBe("Nc6");
  });

  it("reports an asked move the engine never scored as missing rather than inventing it", async () => {
    const { worker } = makeSearchmovesWorker(WHITE_SCRIPT, "d1c1", {
      dropMove: "b5c7",
    });
    mockGetEngineWorker.mockReturnValue(worker);
    const engine = await UciEngine.create(EngineName.Stockfish17Lite, "x.js");

    const result = await engine.evaluateMoves({
      fen: WHITE_TO_MOVE,
      moves: ["b5c7", "d1c1"],
      depth: 12,
    });

    expect(result.moves.map((m) => m.uci)).toEqual(["d1c1"]);
    expect(result.missing).toEqual(["b5c7"]);
  });

  it("fires a partial at each completed depth, only once every asked move has a line", async () => {
    const script: Script = {
      d1c1: WHITE_SCRIPT.d1c1,
      // Nc7+ gets no line at depth 8, so no partial may fire there.
      b5c7: [{ depth: 12, cp: -211, pv: ["b5c7", "e8d8", "c7a8", "a1d1"] }],
    };
    const { worker } = makeSearchmovesWorker(script, "d1c1");
    mockGetEngineWorker.mockReturnValue(worker);
    const engine = await UciEngine.create(EngineName.Stockfish17Lite, "x.js");
    const partials: number[] = [];

    await engine.evaluateMoves({
      fen: WHITE_TO_MOVE,
      moves: ["b5c7", "d1c1"],
      depth: 12,
      onPartial: (p) => {
        expect(p.missing).toEqual([]);
        partials.push(p.depth);
      },
    });
    expect(partials).toEqual([12]);

    const { worker: full } = makeSearchmovesWorker(WHITE_SCRIPT, "d1c1");
    mockGetEngineWorker.mockReturnValue(full);
    const engine2 = await UciEngine.create(EngineName.Stockfish17Lite, "x.js");
    const depths: number[] = [];
    await engine2.evaluateMoves({
      fen: WHITE_TO_MOVE,
      moves: ["b5c7", "d1c1"],
      depth: 12,
      onPartial: (p) => depths.push(p.depth),
    });
    expect(depths).toEqual([8, 12]);
  });
});

describe("parseMovesResults", () => {
  it("ignores bound lines, slots for moves that were not asked, and keeps the deepest line per move", () => {
    const lines = [
      "info depth 10 multipv 1 score cp 100 lowerbound nodes 1 nps 1 time 1 pv d1c1 a8b8",
      "info depth 10 multipv 1 score cp 90 nodes 1 nps 1 time 1 pv d1c1 a8b8",
      "info depth 11 multipv 1 score cp 95 nodes 1 nps 1 time 1 pv d1c1 a8b8 c1f4",
      "info depth 11 multipv 2 score cp 5 nodes 1 nps 1 time 1 pv a3c4",
      "bestmove d1c1",
    ];
    const r = parseMovesResults(lines, WHITE_TO_MOVE, ["d1c1", "b5c7"]);
    expect(r.moves).toEqual([
      {
        uci: "d1c1",
        san: "Qxc1",
        cp: 95,
        mate: undefined,
        depth: 11,
        pv: ["d1c1", "a8b8", "c1f4"],
      },
    ]);
    expect(r.missing).toEqual(["b5c7"]);
    expect(r.depth).toBe(11);
    expect(r.bestMove).toBe("d1c1");
  });

  it("normalises the asked moves: case, whitespace, duplicates", () => {
    expect(
      normaliseAskedMoves(WHITE_TO_MOVE, [" D1C1 ", "d1c1", "b5c7"])
    ).toEqual(["d1c1", "b5c7"]);
  });

  it("an empty search is an empty result, depth 0", () => {
    const r = parseMovesResults(["bestmove (none)"], WHITE_TO_MOVE, ["d1c1"]);
    expect(r.moves).toEqual([]);
    expect(r.depth).toBe(0);
    expect(r.bestMove).toBeUndefined();
    expect(r.missing).toEqual(["d1c1"]);
  });
});
