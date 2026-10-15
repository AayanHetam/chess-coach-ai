/**
 * The browser adapter for pass 2: a capped search on the review engine,
 * stopped at the cap, never asking the cloud.
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
});
