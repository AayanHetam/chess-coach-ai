import { describe, expect, it, vi } from "vitest";
import { Chess } from "chess.js";
import {
  createHistoryLookup,
  createMaiaProvider,
  uciToSan,
} from "@/lib/scout/theoryProviders";
import type { OpeningTreeNode } from "@/types/scout";

const START = new Chess().fen();

function fenAfter(...sans: string[]): string {
  const c = new Chess();
  for (const s of sans) c.move(s);
  return c.fen();
}

function node(
  move: string,
  fen: string,
  totalGames: number,
  children: OpeningTreeNode[] = []
): OpeningTreeNode {
  return { move, fen, totalGames, wins: 0, draws: 0, losses: 0, children };
}

describe("createHistoryLookup", () => {
  const tree = node("", START, 100, [
    node("e4", fenAfter("e4"), 60, [node("e5", fenAfter("e4", "e5"), 40)]),
    node("d4", fenAfter("d4"), 40),
  ]);

  it("reports n(v) and the raw child counts at a position", () => {
    const lookup = createHistoryLookup(tree);
    const at = lookup(START)!;

    expect(at.games).toBe(100);
    expect(at.moves).toEqual([
      { move: "e4", probability: 60 },
      { move: "d4", probability: 40 },
    ]);
  });

  it("returns null for positions they never reached", () => {
    const lookup = createHistoryLookup(tree);
    expect(lookup(fenAfter("Nf3"))).toBeNull();
  });

  it("returns null for a leaf — no children means no move evidence", () => {
    const lookup = createHistoryLookup(tree);
    expect(lookup(fenAfter("d4"))).toBeNull();
  });

  it("matches transpositions by ignoring the move counters", () => {
    // 1.Nf3 d5 2.d4 and 1.d4 d5 2.Nf3 reach the same position with different
    // halfmove/fullmove counters. Without normalisation this is a cache miss,
    // which loses real history and multiplies model calls.
    const viaNf3 = fenAfter("Nf3", "d5", "d4");
    const viaD4 = fenAfter("d4", "d5", "Nf3");
    expect(viaNf3).not.toBe(viaD4);

    const t = node("", START, 10, [node("x", viaNf3, 10, [node("y", START, 5)])]);
    const lookup = createHistoryLookup(t);
    expect(lookup(viaD4)).not.toBeNull();
  });

  it("survives an absent tree", () => {
    expect(createHistoryLookup(null)(START)).toBeNull();
  });
});

describe("uciToSan", () => {
  it("converts a legal UCI move", () => {
    expect(uciToSan(START, "e2e4")).toBe("e4");
    expect(uciToSan(START, "g1f3")).toBe("Nf3");
  });

  it("handles promotion", () => {
    const fen = "8/P7/8/8/8/8/8/K6k w - - 0 1";
    expect(uciToSan(fen, "a7a8q")).toBe("a8=Q+");
  });

  it("returns null rather than throwing on an illegal or malformed move", () => {
    expect(uciToSan(START, "e2e5")).toBeNull();
    expect(uciToSan(START, "zz")).toBeNull();
    expect(uciToSan(START, "")).toBeNull();
  });
});

describe("createMaiaProvider — fail closed", () => {
  const ok = (body: unknown) =>
    vi.fn().mockResolvedValue({ ok: true, json: async () => body } as unknown as Response);

  it("normalises the response into legal SAN", async () => {
    const fetchImpl = ok({
      humanLikeMove: "e2e4",
      confidence: 0.5,
      alternativeMoves: [
        { move: "d2d4", probability: 0.3 },
        { move: "g1f3", probability: 0.2 },
      ],
    });
    const { maia } = createMaiaProvider({ rating: 1600, fetchImpl });

    expect(await maia(START)).toEqual([
      { move: "e4", probability: 0.5 },
      { move: "d4", probability: 0.3 },
      { move: "Nf3", probability: 0.2 },
    ]);
  });

  it("returns NO opinion — never a guess — when the service errors", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 503 } as unknown as Response);
    const { maia, isAvailable } = createMaiaProvider({ rating: 1600, fetchImpl });

    expect(await maia(START)).toEqual([]);
    // The whole point: an outage must be visible, not silently degrade into
    // prep that looks complete.
    expect(isAvailable()).toBe(false);
  });

  it("returns no opinion when the network throws", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    const { maia, isAvailable } = createMaiaProvider({ rating: 1600, fetchImpl });

    expect(await maia(START)).toEqual([]);
    expect(isAvailable()).toBe(false);
  });

  it("drops moves it cannot resolve to a legal move here", async () => {
    const fetchImpl = ok({
      humanLikeMove: "e2e4",
      confidence: 0.6,
      alternativeMoves: [
        { move: "e2e5", probability: 0.3 }, // illegal
        { move: "Qh5xx", probability: 0.1 }, // nonsense
      ],
    });
    const { maia } = createMaiaProvider({ rating: 1600, fetchImpl });

    expect(await maia(START)).toEqual([{ move: "e4", probability: 0.6 }]);
  });

  it("memoizes by position, including transpositions", async () => {
    const fetchImpl = ok({ humanLikeMove: "e2e4", confidence: 1, alternativeMoves: [] });
    const { maia, callCount } = createMaiaProvider({ rating: 1600, fetchImpl });

    await maia(START);
    await maia(START);
    expect(callCount()).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("stays available when the service answers normally", async () => {
    const fetchImpl = ok({ humanLikeMove: "e2e4", confidence: 1, alternativeMoves: [] });
    const { maia, isAvailable } = createMaiaProvider({ rating: 1600, fetchImpl });

    await maia(START);
    expect(isAvailable()).toBe(true);
  });
});
