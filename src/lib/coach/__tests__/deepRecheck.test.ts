/**
 * Pass 2: which moments get a deeper look, and the time-sliced loop that
 * never runs past its deadline. The engine is a fake that answers from the
 * stored depth-20 truth on a fake clock.
 */
import { describe, expect, it } from "vitest";
import type { PositionEval } from "@/types/eval";
import {
  missedMate,
  positionsToRecheck,
  recheckedPair,
  runDeepRecheck,
  selectFlaggedMoments,
  type RecheckEngine,
} from "../deepRecheck";
import { loadGame, positionEvals, type GameId } from "./coachAccuracyFixtures";

/** Answers from the stored truth at `depth`; every search costs `costMs` on the fake clock. */
function fakeEngine(
  game: GameId,
  costMs: number,
  clock: { t: number },
  reach = 20
): RecheckEngine & { calls: Array<{ fen: string; capMs: number }> } {
  const truth = positionEvals(game, 20);
  const fens = loadGame(game).fens;
  const calls: Array<{ fen: string; capMs: number }> = [];
  return {
    name: "fake_stockfish",
    calls,
    async evaluate(fen, _depth, capMs) {
      calls.push({ fen, capMs });
      clock.t += Math.min(costMs, capMs);
      if (costMs > capMs) return null; // ran out of its slice
      const p = truth[fens.indexOf(fen)];
      return {
        ...p,
        lines: p.lines.map((l) => ({ ...l, depth: reach })),
      } as PositionEval;
    },
  };
}

describe("selectFlaggedMoments", () => {
  it("Game B (you are White): the missed mate first, then your worst moves, at most 8", () => {
    const moments = selectFlaggedMoments(positionEvals("gameB", 16), {
      playerColor: "w",
    });
    expect(moments.length).toBeLessThanOrEqual(8);
    expect(moments[0]).toMatchObject({
      move: 28,
      reasons: expect.arrayContaining(["missed_mate"]),
    });
    // The first three are exactly the coach's depth-16 card plan: 15.Qh7+,
    // 19.Nxa8, 12.Ng5 (the server's card floor, mirrored).
    expect(moments.slice(0, 3).map((m) => m.move)).toEqual([28, 36, 22]);
    // The final mating move is not a "missed mate".
    expect(moments.map((m) => m.move)).not.toContain(42);
  });

  it("the Opera Game: depth 16's phantom blunder (15.Bxd7+) is flagged for a deeper look", () => {
    const moments = selectFlaggedMoments(positionEvals("operaGame", 16), {
      playerColor: "w",
    });
    expect(moments.map((m) => m.move)).toContain(28);
  });

  it("re-checks both positions of each moment, each once", () => {
    expect(
      positionsToRecheck([
        { move: 28, reasons: ["missed_mate"], score: 100 },
        { move: 29, reasons: ["swing"], score: 5 },
      ])
    ).toEqual([28, 29, 30]);
  });
});

describe("missedMate", () => {
  it("Game B, 15.Qh7+: White had mate in 3 and no longer has one", () => {
    const p = positionEvals("gameB", 16);
    expect(missedMate(p[28].lines[0], p[29].lines[0], "w")).toEqual({
      mateIn: 3,
    });
  });

  it("a slower mate, or no mate at all, is not a missed mate", () => {
    expect(
      missedMate(
        { pv: [], mate: 3, depth: 20, multiPv: 1 },
        { pv: [], mate: 5, depth: 20, multiPv: 1 },
        "w"
      )
    ).toBeNull();
    expect(
      missedMate(
        { pv: [], cp: 400, depth: 20, multiPv: 1 },
        { pv: [], cp: 0, depth: 20, multiPv: 1 },
        "w"
      )
    ).toBeNull();
    expect(
      missedMate(
        { pv: [], mate: -2, depth: 20, multiPv: 1 },
        { pv: [], cp: 0, depth: 20, multiPv: 1 },
        "b"
      )
    ).toEqual({ mateIn: 2 });
  });
});

describe("runDeepRecheck", () => {
  const game = loadGame("gameB");
  const moments = selectFlaggedMoments(positionEvals("gameB", 16), {
    playerColor: "w",
  });

  it("keeps what reached depth 20 inside the budget and labels the rest as skipped", async () => {
    const clock = { t: 0 };
    const engine = fakeEngine("gameB", 3_000, clock);
    const out = await runDeepRecheck({
      fens: game.fens,
      moments,
      engine,
      budgetMs: 10_000,
      perPositionMs: 4_000,
      now: () => clock.t,
    });
    const order = positionsToRecheck(moments);
    expect(Object.keys(out.positions).map(Number)).toEqual(order.slice(0, 3));
    expect(out.skipped).toEqual(order.slice(3));
    expect(out.elapsedMs).toBeLessThanOrEqual(10_000);
    // No search was given more time than was left.
    let spent = 0;
    for (const c of engine.calls) {
      expect(c.capMs).toBeLessThanOrEqual(10_000 - spent);
      spent += Math.min(3_000, c.capMs);
    }
    expect(out).toMatchObject({
      engine: "fake_stockfish",
      depth: 20,
      moments: moments.map((m) => m.move),
    });
  });

  it("a search that comes back shallower than the target is not kept", async () => {
    const clock = { t: 0 };
    const out = await runDeepRecheck({
      fens: game.fens,
      moments,
      engine: fakeEngine("gameB", 100, clock, 18),
      budgetMs: 10_000,
      now: () => clock.t,
    });
    expect(Object.keys(out.positions)).toEqual([]);
    expect(out.skipped).toHaveLength(positionsToRecheck(moments).length);
  });

  it("a pair is used only when both of its positions reached the depth", async () => {
    const clock = { t: 0 };
    const out = await runDeepRecheck({
      fens: game.fens,
      moments,
      engine: fakeEngine("gameB", 3_000, clock),
      budgetMs: 10_000,
      perPositionMs: 4_000,
      now: () => clock.t,
    });
    const [a, b, c] = positionsToRecheck(moments);
    expect(recheckedPair(out, a)).not.toBeNull(); // a, a+1 = b both kept
    expect(b).toBe(a + 1);
    expect(recheckedPair(out, c)).toBeNull(); // c kept, c+1 skipped
    expect(recheckedPair(null, a)).toBeNull();
  });
});
