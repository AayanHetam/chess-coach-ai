import { describe, it, expect, vi, afterEach } from "vitest";

import { getLichessEval, LICHESS_EVAL_TIMEOUT_MS } from "../lichess";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const CLOUD_BODY = {
  depth: 60,
  pvs: [
    { moves: "e2e4 e7e5 g1f3", cp: 20 },
    { moves: "d2d4 d7d5 c2c4", cp: 15 },
    { moves: "c2c4 e7e5 b1c3", cp: 10 },
  ],
};

/**
 * A fetch that answers after `delayMs` and honours AbortSignal the way the
 * real one does, so `AbortSignal.timeout(...)` is what decides the outcome.
 */
const fetchAfter = (delayMs: number) =>
  vi.fn(
    (_url: string, init?: { signal?: AbortSignal }) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => resolve({ json: async () => CLOUD_BODY }),
          delayMs
        );
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new DOMException("The operation was aborted", "TimeoutError"));
        });
      })
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * The wait budget used to be a hardcoded 200ms, measured against a median
 * response time of ~175ms — so about half of all warm responses were aborted
 * just before arriving, and the first request of a session (DNS + TLS, ~770ms
 * measured) never once completed. Each abort discards a depth-55-to-75 answer
 * and falls back to a local search that reaches depth 14-26.
 */
describe("getLichessEval", () => {
  it("keeps a response that arrives after the old 200ms budget", async () => {
    vi.stubGlobal("fetch", fetchAfter(400));

    const result = await getLichessEval(START, 3);

    expect(result.lines).toHaveLength(3);
    expect(result.lines[0].depth).toBe(60);
    expect(result.source).toBe("cloud");
  });

  it("gives up once the caller's budget is spent", async () => {
    vi.stubGlobal("fetch", fetchAfter(400));

    const result = await getLichessEval(START, 3, 150);

    expect(result.lines).toEqual([]);
    expect(result.bestMove).toBe("");
  });

  it("lets the caller widen the budget past the default", async () => {
    vi.stubGlobal("fetch", fetchAfter(400));

    const tight = await getLichessEval(START, 3, 150);
    const generous = await getLichessEval(START, 3, 900);

    expect(tight.lines).toEqual([]);
    expect(generous.lines).toHaveLength(3);
  });

  it("clears the default budget of the endpoint's own cold-start cost", () => {
    // ~770ms measured for the first request of a session; the previous 200ms
    // default could not survive it.
    expect(LICHESS_EVAL_TIMEOUT_MS).toBeGreaterThan(800);
  });
});
