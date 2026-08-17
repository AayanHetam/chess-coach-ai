import { describe, it, expect, vi } from "vitest";

import { createBestEvalPublisher } from "../bestEvalPublisher";
import type { EvalSource, PositionEval } from "@/types/eval";

const evalAt = (
  depth: number,
  lineCount = 3,
  source: EvalSource = "local"
): PositionEval => ({
  bestMove: "e2e4",
  source,
  lines: Array.from({ length: lineCount }, (_, i) => ({
    pv: ["e2e4"],
    cp: 20 - i,
    depth,
    multiPv: i + 1,
  })),
});

const publishedDepths = (spy: ReturnType<typeof vi.fn>) =>
  spy.mock.calls.map(([e]) => (e as PositionEval).lines[0].depth);

/**
 * The local engine streams depth 1, 2, 3 … while a cloud answer worth depth 60
 * can arrive at any point in that sequence. Publishing in arrival order would
 * walk the on-screen evaluation backwards.
 */
describe("createBestEvalPublisher", () => {
  it("publishes each deepening local update", () => {
    const setPartialEval = vi.fn();
    const publisher = createBestEvalPublisher(setPartialEval);

    publisher.offer(evalAt(12));
    publisher.offer(evalAt(16));
    publisher.offer(evalAt(22));

    expect(publishedDepths(setPartialEval)).toEqual([12, 16, 22]);
    expect(publisher.best()?.lines[0].depth).toBe(22);
  });

  it("never walks backwards when the cloud lands mid-search", () => {
    const setPartialEval = vi.fn();
    const publisher = createBestEvalPublisher(setPartialEval);

    publisher.offer(evalAt(14, 3, "local"));
    publisher.offer(evalAt(60, 3, "cloud")); // cloud arrives late but deeper
    publisher.offer(evalAt(15, 3, "local")); // local keeps deepening underneath
    publisher.offer(evalAt(26, 3, "local")); // …and finishes, still shallower

    // The shallower local updates after the cloud answer are dropped, not shown.
    expect(publishedDepths(setPartialEval)).toEqual([14, 60]);
    expect(publisher.best()?.source).toBe("cloud");
  });

  it("keeps the local search when the cloud answer is shallower", () => {
    const setPartialEval = vi.fn();
    const publisher = createBestEvalPublisher(setPartialEval);

    publisher.offer(evalAt(30, 3, "local"));
    publisher.offer(evalAt(20, 3, "cloud"));

    expect(publishedDepths(setPartialEval)).toEqual([30]);
    expect(publisher.best()?.source).toBe("local");
  });

  it("prefers the wider result when depth ties", () => {
    const setPartialEval = vi.fn();
    const publisher = createBestEvalPublisher(setPartialEval);

    publisher.offer(evalAt(24, 1));
    publisher.offer(evalAt(24, 5));

    expect(setPartialEval).toHaveBeenCalledTimes(2);
    expect(publisher.best()?.lines).toHaveLength(5);
  });

  it("ignores empty and missing evaluations", () => {
    const setPartialEval = vi.fn();
    const publisher = createBestEvalPublisher(setPartialEval);

    publisher.offer(null);
    publisher.offer(undefined);
    publisher.offer({ bestMove: "", lines: [] });

    expect(setPartialEval).not.toHaveBeenCalled();
    expect(publisher.best()).toBeNull();
  });

  it("still tracks the best answer with no subscriber attached", () => {
    const publisher = createBestEvalPublisher();

    publisher.offer(evalAt(18, 3, "local"));
    publisher.offer(evalAt(55, 3, "cloud"));

    expect(publisher.best()?.lines[0].depth).toBe(55);
  });
});
