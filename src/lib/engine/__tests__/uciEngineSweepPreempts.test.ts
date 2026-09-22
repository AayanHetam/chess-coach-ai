import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * A whole-game sweep must stop a search that is already running.
 *
 * `evaluatePositionWithUpdate` (the eval bar and Lines tab) refuses to preempt
 * a sweep, but nothing made a sweep preempt a live search. The live search
 * does not clear the engine's `isReady`, and the sweep's `ucinewgame` handshake
 * talks to each worker directly, past its busy flag. So a sweep started during
 * a live search queued its first `go` behind the running one, took THAT
 * search's `bestmove` as the first position's answer, and every position after
 * it read the reply meant for the one before, until a per-position timeout
 * parked it partway. Seen live: analyze a game, then load another one while
 * the eval bar is still deepening the displayed position.
 *
 * The fake worker below hangs its first `go` the way a deep search does,
 * answers `stop` the way Stockfish does (a `bestmove`), and answers every later
 * `go` at once. The invariant is that no `position` or `go` reaches the worker
 * while a search is still in flight.
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

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

function makeWorker() {
  const sent: string[] = [];
  let searching = false;
  let hangNext = true;
  /** `position` or `go` sent while a search was still running. */
  let violations = 0;
  const worker = {
    isReady: false,
    uci: (cmd: string) => {
      sent.push(cmd);
      if (cmd === "uci") {
        queueMicrotask(() => worker.listen("uciok"));
      } else if (cmd === "isready") {
        queueMicrotask(() => worker.listen("readyok"));
      } else if (cmd === "stop") {
        if (searching) {
          searching = false;
          queueMicrotask(() => worker.listen("bestmove e2e4"));
        }
      } else if (cmd.startsWith("position")) {
        if (searching) violations++;
      } else if (cmd.startsWith("go")) {
        if (searching) {
          violations++;
          // Stockfish would finish the old search first; answer it so the
          // test fails on the invariant instead of hanging.
          searching = false;
          queueMicrotask(() => worker.listen("bestmove e2e4"));
        }
        if (hangNext) {
          hangNext = false;
          searching = true;
          return;
        }
        queueMicrotask(() => {
          worker.listen("info depth 16 multipv 1 score cp 20 pv e2e4 e7e5");
          worker.listen("bestmove e2e4");
        });
      }
    },
    listen: (_data: string) => {},
    terminate: vi.fn(),
    errored: new Promise<Error>(() => {}),
  };
  return {
    worker,
    sent,
    violations: () => violations,
    searching: () => searching,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("evaluateGame while a live search is running", () => {
  it("stops the live search before its own handshake and reads its own replies", async () => {
    const fake = makeWorker();
    mockGetEngineWorker.mockReturnValue(fake.worker);
    const engine = await UciEngine.create(EngineName.Stockfish17Lite, "x.js");

    // The eval bar's search on the displayed position: a deep one that has
    // not answered yet.
    const live = engine.evaluatePositionWithUpdate({
      fen: START,
      depth: 18,
      multiPv: 1,
      allowCloud: false,
    });
    live.catch(() => {
      /* superseded by the sweep, which is the point */
    });
    await vi.waitFor(() => {
      expect(fake.sent).toContain("go depth 18");
    });
    expect(fake.searching()).toBe(true);

    // The user loads a game: the sweep starts on the same worker.
    const sweep = await engine.evaluateGame({
      fens: [START, AFTER_E4],
      uciMoves: ["e2e4"],
      depth: 16,
      multiPv: 1,
      workersNb: 1,
    });

    // The live search was stopped before the sweep said a word to the
    // worker, and nothing was sent into a running search.
    const liveGo = fake.sent.indexOf("go depth 18");
    const after = fake.sent.slice(liveGo + 1);
    expect(after.indexOf("stop")).toBeGreaterThanOrEqual(0);
    expect(after.indexOf("stop")).toBeLessThan(after.indexOf("ucinewgame"));
    expect(fake.violations()).toBe(0);

    // Each position got the reply to its own `go`, not the live search's
    // (cp is White's view, so Black to move reads the same reply negated).
    expect(sweep.positions).toHaveLength(2);
    expect(sweep.positions[0].lines[0]).toMatchObject({ cp: 20, depth: 16 });
    expect(sweep.positions[1].lines[0]).toMatchObject({ cp: -20, depth: 16 });
    await expect(live).rejects.toThrow(/superseded/);
  });
});
