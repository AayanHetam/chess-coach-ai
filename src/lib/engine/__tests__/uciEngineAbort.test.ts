import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * A search can be ended by its caller's AbortSignal in any phase, on both
 * search methods. The analysis page's live-eval effect aborts its own
 * search when the board moves on, and a what-if aborts it to take the
 * engine at once: a stop sent to the worker only reaches a search that
 * has begun, while an abort checked between the phases (stop, MultiPV,
 * ucinewgame, the cloud head start) ends one that has not sent its `go`
 * yet. A what-if's own search is ended the same way by a newer what-if,
 * a new game or the page going; and an engine swap rejects whatever was
 * in flight instead of leaving it waiting for good.
 */

const { mockGetEngineWorker } = vi.hoisted(() => ({
  mockGetEngineWorker: vi.fn(),
}));

vi.mock("../worker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../worker")>();
  return { ...actual, getEngineWorker: mockGetEngineWorker };
});

/** The cloud never answers: the head start runs its full 350 ms unless something ends it. */
vi.mock("../../lichess", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lichess")>();
  return {
    ...actual,
    getLichessEval: vi.fn(() => new Promise(() => {})),
  };
});

import {
  EngineSearchAbortedError,
  EngineShutDownError,
  UciEngine,
} from "../uciEngine";
import { createEngineTurn } from "../engineTurn";
import { EngineName } from "@/types/enums";
import {
  resolveWhatIf,
  runWhatIf,
} from "@/components/preview-analysis/coachWhatIf";

const FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
/** Fixture 07 before 8. Nc7+ (b5c7); 8. Qxc1 (d1c1) takes the free queen. */
const FEN_BEFORE_8 =
  "r1b1kbnr/pp1ppppp/2n5/1N6/4P3/5N2/P1P2PPP/2qQKB1R w Kkq - 0 8";

/**
 * A worker whose searches never end on their own: `go` answers one info
 * line (one per asked move for a `searchmoves` search) and then waits for
 * `stop` before it says `bestmove`, the way a real engine does at a depth
 * it has not reached. With `modes.finish` set, a `go` completes at once.
 */
function makeWorker(opts: { finish?: boolean } = {}) {
  const sent: string[] = [];
  const modes = {
    finish: opts.finish ?? false,
    /** Hold the `readyok` to the `isready` that follows a command with this prefix, until `release()`. */
    holdReadyAfter: null as string | null,
    /** The worker stops answering anything, the way a wedged engine does. */
    silent: false,
  };
  let searching = false;
  let holding = false;
  let heldReady = false;
  const release = () => {
    if (!heldReady) return;
    heldReady = false;
    worker.listen("readyok");
  };
  let first = "e2e4";
  const worker = {
    isReady: false,
    uci: (cmd: string) => {
      sent.push(cmd);
      if (modes.holdReadyAfter && cmd.startsWith(modes.holdReadyAfter))
        holding = true;
      queueMicrotask(() => {
        if (modes.silent) return;
        if (cmd === "uci") worker.listen("uciok");
        else if (cmd === "isready") {
          if (holding) {
            holding = false;
            heldReady = true;
          } else worker.listen("readyok");
        } else if (cmd.startsWith("go")) {
          searching = true;
          const m = /searchmoves (.+)$/.exec(cmd);
          if (m) {
            const asked = m[1].split(" ");
            first = asked[0];
            asked.forEach((uci, i) =>
              worker.listen(
                `info depth 5 seldepth 7 multipv ${i + 1} score cp ${
                  200 - i * 300
                } nodes 100 nps 1000 time 1 pv ${uci}`
              )
            );
          } else {
            first = "e2e4";
            worker.listen(
              "info depth 5 seldepth 7 multipv 1 score cp 20 nodes 100 nps 1000 time 1 pv e2e4 e7e5"
            );
          }
          if (modes.finish) {
            searching = false;
            worker.listen(`bestmove ${first}`);
          }
        } else if (cmd === "stop" && searching) {
          searching = false;
          worker.listen(`bestmove ${first}`);
        }
      });
    },
    listen: (_data: string) => {},
    terminate: vi.fn(),
    errored: new Promise<Error>(() => {}),
  };
  return { worker, sent, modes, release };
}

const settle = () => new Promise<void>((r) => setTimeout(r, 0));
async function until(cond: () => boolean, tries = 50) {
  for (let i = 0; i < tries && !cond(); i++) await settle();
  expect(cond()).toBe(true);
}
const goes = (sent: string[]) => sent.filter((c) => c.startsWith("go"));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("evaluatePositionWithUpdate: the caller's abort", () => {
  it("a signal already aborted ends the call before any search is asked for", async () => {
    const { worker, sent } = makeWorker({ finish: true });
    mockGetEngineWorker.mockReturnValue(worker);
    const engine = await UciEngine.create(EngineName.Stockfish17Lite, "x.js");
    const before = sent.length;
    const ac = new AbortController();
    ac.abort();
    await expect(
      engine.evaluatePositionWithUpdate({
        fen: FEN,
        depth: 10,
        multiPv: 1,
        allowCloud: false,
        signal: ac.signal,
      })
    ).rejects.toBeInstanceOf(EngineSearchAbortedError);
    expect(goes(sent.slice(before))).toEqual([]);
  });

  it("an abort during the search stops the engine, the call rejects as aborted, and the next caller gets the engine", async () => {
    const { worker, sent, modes } = makeWorker();
    mockGetEngineWorker.mockReturnValue(worker);
    const engine = await UciEngine.create(EngineName.Stockfish17Lite, "x.js");
    const partials: number[] = [];
    const ac = new AbortController();
    const search = engine.evaluatePositionWithUpdate({
      fen: FEN,
      depth: 10,
      multiPv: 1,
      allowCloud: false,
      signal: ac.signal,
      setPartialEval: (ev) => partials.push(ev.lines[0]?.depth ?? -1),
    });
    await until(() => goes(sent).length > 0);
    await until(() => partials.length > 0);
    ac.abort();
    await expect(search).rejects.toBeInstanceOf(EngineSearchAbortedError);
    // The stop the abort sends, after the search's go (every search also
    // sends one of its own before the go).
    expect(sent.slice(sent.indexOf(goes(sent)[0]))).toContain("stop");

    modes.finish = true;
    const again = await engine.evaluatePositionWithUpdate({
      fen: FEN,
      depth: 10,
      multiPv: 1,
      allowCloud: false,
    });
    expect(again.lines[0]?.cp).toBe(20);
    expect(goes(sent)).toEqual(["go depth 10", "go depth 10"]);
  });

  it("without a signal the search completes as before", async () => {
    const { worker, sent } = makeWorker({ finish: true });
    mockGetEngineWorker.mockReturnValue(worker);
    const engine = await UciEngine.create(EngineName.Stockfish17Lite, "x.js");
    const ev = await engine.evaluatePositionWithUpdate({
      fen: FEN,
      depth: 10,
      multiPv: 1,
      allowCloud: false,
    });
    expect(ev.lines[0]?.cp).toBe(20);
    expect(goes(sent)).toEqual(["go depth 10"]);
  });
});

describe("evaluateMoves: the caller's abort", () => {
  it("a signal already aborted ends the call before any search is asked for", async () => {
    const { worker, sent } = makeWorker({ finish: true });
    mockGetEngineWorker.mockReturnValue(worker);
    const engine = await UciEngine.create(EngineName.Stockfish17Lite, "x.js");
    const before = sent.length;
    const ac = new AbortController();
    ac.abort();
    await expect(
      engine.evaluateMoves({
        fen: FEN_BEFORE_8,
        moves: ["d1c1", "b5c7"],
        depth: 16,
        signal: ac.signal,
      })
    ).rejects.toBeInstanceOf(EngineSearchAbortedError);
    expect(goes(sent.slice(before))).toEqual([]);
  });

  it("an abort during the search stops the engine, the call rejects as aborted, and the next search completes", async () => {
    const { worker, sent, modes } = makeWorker();
    mockGetEngineWorker.mockReturnValue(worker);
    const engine = await UciEngine.create(EngineName.Stockfish17Lite, "x.js");
    const partials: number[] = [];
    const ac = new AbortController();
    const search = engine.evaluateMoves({
      fen: FEN_BEFORE_8,
      moves: ["d1c1", "b5c7"],
      depth: 16,
      signal: ac.signal,
      onPartial: (p) => partials.push(p.depth),
    });
    await until(() => goes(sent).length > 0);
    await until(() => partials.length > 0);
    expect(partials).toEqual([5]);
    ac.abort();
    await expect(search).rejects.toBeInstanceOf(EngineSearchAbortedError);
    // The stop the abort sends, after the search's go (every search also
    // sends one of its own before the go).
    expect(sent.slice(sent.indexOf(goes(sent)[0]))).toContain("stop");

    modes.finish = true;
    const again = await engine.evaluateMoves({
      fen: FEN_BEFORE_8,
      moves: ["d1c1", "b5c7"],
      depth: 16,
    });
    expect(again.missing).toEqual([]);
    expect(again.moves.map((m) => [m.uci, m.cp])).toEqual([
      ["d1c1", 200],
      ["b5c7", -100],
    ]);
    expect(goes(sent)).toEqual([
      "go depth 16 searchmoves d1c1 b5c7",
      "go depth 16 searchmoves d1c1 b5c7",
    ]);
  });

  it("an abort between the phases ends the call before its `go`", async () => {
    const { worker, sent, modes, release } = makeWorker({ finish: true });
    mockGetEngineWorker.mockReturnValue(worker);
    const engine = await UciEngine.create(EngineName.Stockfish17Lite, "x.js");
    const before = sent.length;
    // The MultiPV option goes out before the search; the engine is slow to
    // say it is ready, and the caller aborts while it waits.
    modes.holdReadyAfter = "setoption name MultiPV";
    const ac = new AbortController();
    const search = engine.evaluateMoves({
      fen: FEN_BEFORE_8,
      moves: ["d1c1", "b5c7"],
      depth: 16,
      signal: ac.signal,
    });
    await until(() =>
      sent.slice(before).some((c) => c.startsWith("setoption name MultiPV"))
    );
    await settle();
    expect(goes(sent.slice(before))).toEqual([]);
    ac.abort();
    release();
    await expect(search).rejects.toBeInstanceOf(EngineSearchAbortedError);
    expect(goes(sent.slice(before))).toEqual([]);
  });
});

describe("an abort in the MultiPV phase", () => {
  it("leaves the engine's record of the option matching the worker's, so the next search sets its own", async () => {
    const { worker, sent, modes, release } = makeWorker({ finish: true });
    mockGetEngineWorker.mockReturnValue(worker);
    // The engine starts at MultiPV 3 (the review's and the Lines tab's).
    const engine = await UciEngine.create(EngineName.Stockfish17Lite, "x.js");
    const before = sent.length;
    const multiPvSent = () =>
      sent.slice(before).filter((c) => c.startsWith("setoption name MultiPV"));
    // A two-move what-if lowers it to 2 and is aborted before the worker
    // says it is ready.
    modes.holdReadyAfter = "setoption name MultiPV";
    const ac = new AbortController();
    const aborted = engine.evaluateMoves({
      fen: FEN_BEFORE_8,
      moves: ["d1c1", "b5c7"],
      depth: 16,
      signal: ac.signal,
    });
    await until(() => multiPvSent().length === 1);
    ac.abort();
    await expect(aborted).rejects.toBeInstanceOf(EngineSearchAbortedError);
    modes.holdReadyAfter = null;
    // A three-move search at once: the worker is at 2, so it must ask for 3.
    const next = engine.evaluateMoves({
      fen: FEN_BEFORE_8,
      moves: ["d1c1", "b5c7", "b5d6"],
      depth: 16,
    });
    release();
    await next;
    expect(multiPvSent()).toEqual([
      "setoption name MultiPV value 2",
      "setoption name MultiPV value 3",
    ]);
  });
});

describe("an engine shut down mid-search", () => {
  it("rejects the search in flight instead of leaving it waiting", async () => {
    const { worker, sent } = makeWorker();
    mockGetEngineWorker.mockReturnValue(worker);
    const engine = await UciEngine.create(EngineName.Stockfish17Lite, "x.js");
    const search = engine.evaluateMoves({
      fen: FEN_BEFORE_8,
      moves: ["d1c1", "b5c7"],
      depth: 16,
    });
    await until(() => goes(sent).length > 0);
    engine.shutdown();
    await expect(search).rejects.toBeInstanceOf(EngineShutDownError);
    expect(worker.terminate).toHaveBeenCalled();
    expect(sent[sent.length - 1]).toBe("quit");
  });
});

describe("the cloud head start", () => {
  it("ends at once on an abort, so a what-if asked during it does not pay the 350 ms", async () => {
    const { worker, sent } = makeWorker({ finish: true });
    mockGetEngineWorker.mockReturnValue(worker);
    const engine = await UciEngine.create(EngineName.Stockfish17Lite, "x.js");
    const before = sent.length;
    const ac = new AbortController();
    const search = engine.evaluatePositionWithUpdate({
      fen: FEN,
      depth: 10,
      multiPv: 1,
      allowCloud: true,
      signal: ac.signal,
    });
    await until(() =>
      sent.slice(before).some((c) => c.startsWith("setoption name MultiPV"))
    );
    await settle();
    const t = Date.now();
    ac.abort();
    await expect(search).rejects.toBeInstanceOf(EngineSearchAbortedError);
    expect(Date.now() - t).toBeLessThan(250);
    expect(goes(sent.slice(before))).toEqual([]);
  });

  it("an engine shut down during it rejects the search instead of queueing it for good", async () => {
    const { worker, sent } = makeWorker({ finish: true });
    mockGetEngineWorker.mockReturnValue(worker);
    const engine = await UciEngine.create(EngineName.Stockfish17Lite, "x.js");
    const before = sent.length;
    const search = engine.evaluatePositionWithUpdate({
      fen: FEN,
      depth: 10,
      multiPv: 1,
      allowCloud: true,
    });
    await until(() =>
      sent.slice(before).some((c) => c.startsWith("setoption name MultiPV"))
    );
    await settle();
    engine.shutdown();
    await expect(search).rejects.toBeInstanceOf(EngineShutDownError);
    expect(goes(sent.slice(before))).toEqual([]);
  });
});

describe("a worker that stops answering before the search", () => {
  it("an abort still ends the call while its stop goes unanswered", async () => {
    const { worker, sent, modes } = makeWorker({ finish: true });
    mockGetEngineWorker.mockReturnValue(worker);
    const engine = await UciEngine.create(EngineName.Stockfish17Lite, "x.js");
    const before = sent.length;
    modes.silent = true;
    const ac = new AbortController();
    const search = engine.evaluateMoves({
      fen: FEN_BEFORE_8,
      moves: ["d1c1", "b5c7"],
      depth: 16,
      signal: ac.signal,
    });
    await until(() => sent.slice(before).includes("stop"));
    await settle();
    ac.abort();
    await expect(search).rejects.toBeInstanceOf(EngineSearchAbortedError);
    expect(goes(sent.slice(before))).toEqual([]);
  });

  it("the what-if's bound settles the search and frees the turn, with the real engine", async () => {
    const { worker, modes } = makeWorker({ finish: true });
    mockGetEngineWorker.mockReturnValue(worker);
    const engine = await UciEngine.create(EngineName.Stockfish17Lite, "x.js");
    modes.silent = true;
    const turn = createEngineTurn();
    const ask = resolveWhatIf("why not 8. Qxc1?", {
      sans: ["Nc7+", "Kd8"],
      rootFen: FEN_BEFORE_8,
      viewedPly: 0,
      playerColor: "w",
    })!;
    const result = await runWhatIf({
      ask,
      engine,
      turn,
      timeoutMs: 30,
      onResult: () => {
        throw new Error("should not report");
      },
    });
    expect(result).toBeNull();
    expect(turn.busy()).toBe(false);
    // The next job gets the turn.
    expect(await turn.run(async () => "next")).toBe("next");
  });
});

describe("an engine swapped out mid-sweep", () => {
  it("stops the sweep and starts no worker", async () => {
    const { worker, modes } = makeWorker();
    mockGetEngineWorker.mockReturnValue(worker);
    const engine = await UciEngine.create(EngineName.Stockfish17Lite, "x.js");
    const created = mockGetEngineWorker.mock.calls.length;
    const fens = [FEN, FEN, FEN];
    const sweep = engine.evaluateGame({
      fens,
      uciMoves: ["e2e4", "e7e5"],
      depth: 10,
      perPositionTimeoutMs: 20,
    });
    await settle();
    engine.shutdown();
    modes.finish = true;
    await expect(sweep).rejects.toBeInstanceOf(EngineShutDownError);
    // No worker was started on the shut-down engine.
    for (let i = 0; i < 5; i++) await settle();
    expect(mockGetEngineWorker.mock.calls.length).toBe(created);
  });
});
