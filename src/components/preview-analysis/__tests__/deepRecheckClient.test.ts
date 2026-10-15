/**
 * The browser adapter for pass 2: a capped search on the review engine,
 * stopped at the cap, never asking the cloud, and quiet once called off.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UciEngine } from "@/lib/engine/uciEngine";
import type {
  EvaluatePositionWithUpdateParams,
  PositionEval,
} from "@/types/eval";
import { uciRecheckEngine } from "../deepRecheckClient";

const at = (depth: number): PositionEval => ({
  lines: [{ pv: ["e2e4"], cp: 30, depth, multiPv: 1 }],
});

/** A fake engine that deepens one ply per second until stopped or done. */
function fakeEngine(finishAtDepth: number) {
  const calls: EvaluatePositionWithUpdateParams[] = [];
  let stop: (() => void) | null = null;
  const engine = {
    stopAllCurrentJobs: vi.fn(async () => stop?.()),
    evaluatePositionWithUpdate: vi.fn(
      (params: EvaluatePositionWithUpdateParams) => {
        calls.push(params);
        return new Promise<PositionEval>((resolve) => {
          let depth = 0;
          const tick = setInterval(() => {
            depth += 1;
            params.setPartialEval?.(at(depth));
            if (depth >= finishAtDepth) {
              clearInterval(tick);
              resolve(at(depth));
            }
          }, 1000);
          stop = () => {
            clearInterval(tick);
            resolve(at(depth));
          };
        });
      }
    ),
  };
  return { engine: engine as unknown as UciEngine, calls, spy: engine };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("uciRecheckEngine", () => {
  it("searches the review engine to the target depth, cloud off", async () => {
    vi.useFakeTimers();
    const { engine, calls, spy } = fakeEngine(20);
    const pending = uciRecheckEngine(engine, "stockfish_17_lite").evaluate(
      "fen",
      20,
      30_000
    );
    await vi.advanceTimersByTimeAsync(20_000);
    const result = await pending;
    expect(result?.lines[0].depth).toBe(20);
    expect(calls[0]).toMatchObject({
      fen: "fen",
      depth: 20,
      multiPv: 3,
      allowCloud: false,
    });
    expect(spy.stopAllCurrentJobs).not.toHaveBeenCalled();
  });

  it("stops at the cap and returns the depth it reached", async () => {
    vi.useFakeTimers();
    const { engine, spy } = fakeEngine(20);
    const pending = uciRecheckEngine(engine, "stockfish_17_lite").evaluate(
      "fen",
      20,
      6_500
    );
    await vi.advanceTimersByTimeAsync(7_000);
    const result = await pending;
    expect(spy.stopAllCurrentJobs).toHaveBeenCalledTimes(1);
    expect(result?.lines[0].depth).toBe(6);
  });

  it("called off mid-search: stops it once, starts nothing after, and no later cap stops the engine", async () => {
    vi.useFakeTimers();
    const { engine, calls, spy } = fakeEngine(20);
    const recheck = uciRecheckEngine(engine, "stockfish_17_lite");
    const pending = recheck.evaluate("fen", 20, 6_500);
    await vi.advanceTimersByTimeAsync(3_000);
    recheck.cancel();
    expect(spy.stopAllCurrentJobs).toHaveBeenCalledTimes(1);
    expect((await pending)?.lines[0].depth).toBe(3);
    expect(await recheck.evaluate("next", 20, 6_500)).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it("a stop that is lost or rejected is not repeated by the cap, which would land in the next review", async () => {
    vi.useFakeTimers();
    const { engine } = fakeEngine(20);
    // A plain function, not vi.fn: a mock would observe the rejection itself
    // and hide one the adapter failed to handle.
    let stops = 0;
    (engine as { stopAllCurrentJobs: () => Promise<void> }).stopAllCurrentJobs =
      () => {
        stops += 1;
        return Promise.reject(new Error("superseded"));
      };
    const recheck = uciRecheckEngine(engine, "stockfish_17_lite");
    const pending = recheck.evaluate("fen", 20, 6_500);
    await vi.advanceTimersByTimeAsync(3_000);
    recheck.cancel();
    await vi.advanceTimersByTimeAsync(20_000);
    await pending;
    expect(stops).toBe(1);
  });

  it("called off after the search finished: the engine is left alone", async () => {
    vi.useFakeTimers();
    const { engine, spy } = fakeEngine(5);
    const recheck = uciRecheckEngine(engine, "stockfish_17_lite");
    const pending = recheck.evaluate("fen", 5, 6_500);
    await vi.advanceTimersByTimeAsync(5_000);
    await pending;
    recheck.cancel();
    expect(spy.stopAllCurrentJobs).not.toHaveBeenCalled();
  });
});
