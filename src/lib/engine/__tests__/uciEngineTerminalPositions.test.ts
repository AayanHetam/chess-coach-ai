import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * A terminal position must short-circuit, not go to search.
 *
 * Stockfish answers `go` on a checkmated or stalemated board with
 * `bestmove (none)` and ZERO info lines — correct UCI, nothing to parse, so
 * the caller gets an eval with no lines and looks stalled. `evaluateGame` has
 * always short-circuited these positions; `evaluatePositionWithUpdate` did
 * not, so the puzzle Analyse panel stalled on every puzzle whose solution
 * ends in mate — the board's final FEN after "Show solution" IS the mated
 * position. Captured live on prod (puzzle #0JFtK's session):
 * `go depth 16` → `bestmove (none)`, then the stall message.
 */

const { mockGetEngineWorker } = vi.hoisted(() => ({
  mockGetEngineWorker: vi.fn(),
}));

vi.mock("../worker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../worker")>();
  return { ...actual, getEngineWorker: mockGetEngineWorker };
});

import { UciEngine } from "../uciEngine";
import { EngineName } from "@/types/enums";

// Captured from the live prod session: White queen g7 defended by the c3
// bishop, Black king g8 out of squares. Black to move, checkmated.
const MATE_FEN = "6k1/6Q1/1p2q2p/8/6P1/2B4P/1P2bp1K/8 b - - 0 46";
// Black to move, no legal moves, not in check.
const STALEMATE_FEN = "k7/8/1Q6/8/8/8/8/7K b - - 0 1";

/** Speaks the handshake; answers any `go` the way Stockfish answers a dead position. */
function makeUciWorker() {
  const sent: string[] = [];
  const worker = {
    isReady: false,
    uci: (cmd: string) => {
      sent.push(cmd);
      queueMicrotask(() => {
        if (cmd === "uci") worker.listen("uciok");
        else if (cmd === "isready") worker.listen("readyok");
        else if (cmd.startsWith("go")) worker.listen("bestmove (none)");
      });
    },
    listen: (_data: string) => {},
    terminate: vi.fn(),
    errored: new Promise<Error>(() => {}),
  };
  return { worker, sent };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("evaluatePositionWithUpdate on terminal positions", () => {
  it("returns a mate line for a checkmated board without asking the engine", async () => {
    const { worker, sent } = makeUciWorker();
    mockGetEngineWorker.mockReturnValue(worker);

    const engine = await UciEngine.create(EngineName.Stockfish17Lite, "x.js");
    const partials: unknown[] = [];
    const evaluation = await engine.evaluatePositionWithUpdate({
      fen: MATE_FEN,
      multiPv: 1,
      allowCloud: false,
      setPartialEval: (ev) => partials.push(ev),
    });

    // Black is the side checkmated → positive mate, same sign convention as
    // evaluateGame's own short-circuit.
    expect(evaluation.lines).toEqual([
      { pv: [], depth: 0, multiPv: 1, mate: 1 },
    ]);
    // Streaming consumers hear about it too — the panel renders from
    // setPartialEval, not only from the resolved value.
    expect(partials).toHaveLength(1);
    // And the engine was never asked: `go` on this board yields
    // `bestmove (none)`, which is the whole failure being prevented.
    expect(sent.filter((c) => c.startsWith("go"))).toEqual([]);
    expect(sent.filter((c) => c.startsWith("position"))).toEqual([]);
  });

  it("returns cp 0 for a stalemated board without asking the engine", async () => {
    const { worker, sent } = makeUciWorker();
    mockGetEngineWorker.mockReturnValue(worker);

    const engine = await UciEngine.create(EngineName.Stockfish17Lite, "x.js");
    const evaluation = await engine.evaluatePositionWithUpdate({
      fen: STALEMATE_FEN,
      multiPv: 1,
      allowCloud: false,
    });

    expect(evaluation.lines).toEqual([{ pv: [], depth: 0, multiPv: 1, cp: 0 }]);
    expect(sent.filter((c) => c.startsWith("go"))).toEqual([]);
  });
});
