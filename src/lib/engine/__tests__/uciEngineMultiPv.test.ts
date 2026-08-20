import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * MultiPV=1 must be a legal request.
 *
 * `setMultiPv` validated `multiPv < 2 || multiPv > 10` — a bound inherited
 * from the Lines-tab selector, whose smallest offering is 2. But MultiPV=1 is
 * the engine's OWN default and exactly what every single-line consumer asks
 * for: PuzzleAnalysisPanel and surpriseEngineService both call
 * `evaluatePositionWithUpdate({ multiPv: 1 })`.
 *
 * The result was the puzzle Analyse stall shipped to every user: the call
 * threw `Invalid MultiPV value : 1` before the search — and before the cloud
 * head-start, so Lichess couldn't mask it — the panel's catch() swallowed the
 * error, and 25s later the stall message rendered. The engine itself was
 * healthy the whole time (verified by raw UCI against the prod worker).
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

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/**
 * A worker that speaks enough UCI for the full engine lifecycle: handshake,
 * setoption acks, and a fixed depth-12 answer to any `go`.
 */
function makeUciWorker() {
  const sent: string[] = [];
  const worker = {
    isReady: false,
    uci: (cmd: string) => {
      sent.push(cmd);
      queueMicrotask(() => {
        if (cmd === "uci") worker.listen("uciok");
        else if (cmd === "isready") worker.listen("readyok");
        else if (cmd.startsWith("go")) {
          worker.listen(
            "info depth 12 seldepth 16 multipv 1 score cp 34 nodes 1000 nps 100000 time 10 pv e2e4 e7e5",
          );
          worker.listen("bestmove e2e4 ponder e7e5");
        }
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

describe("evaluatePositionWithUpdate with multiPv: 1", () => {
  it("resolves with a line instead of throwing before the search starts", async () => {
    const { worker, sent } = makeUciWorker();
    mockGetEngineWorker.mockReturnValue(worker);

    const engine = await UciEngine.create(EngineName.Stockfish17Lite, "x.js");
    const evaluation = await engine.evaluatePositionWithUpdate({
      fen: START_FEN,
      depth: 12,
      multiPv: 1,
      allowCloud: false,
    });

    expect(evaluation.lines).toHaveLength(1);
    expect(evaluation.lines[0]).toMatchObject({ depth: 12, cp: 34 });
    expect(evaluation.bestMove).toBe("e2e4");
    // And it must actually TELL the engine, not just skip validation — the
    // handshake sets MultiPV 3, so a silent pass-through would search 3 lines.
    expect(sent).toContain("setoption name MultiPV value 1");
  });

  it("still rejects genuinely invalid MultiPV values", async () => {
    const { worker } = makeUciWorker();
    mockGetEngineWorker.mockReturnValue(worker);

    const engine = await UciEngine.create(EngineName.Stockfish17Lite, "x.js");
    await expect(
      engine.evaluatePositionWithUpdate({
        fen: START_FEN,
        multiPv: 0,
        allowCloud: false,
      }),
    ).rejects.toThrow(/Invalid MultiPV/);
    await expect(
      engine.evaluatePositionWithUpdate({
        fen: START_FEN,
        multiPv: 11,
        allowCloud: false,
      }),
    ).rejects.toThrow(/Invalid MultiPV/);
  });
});
