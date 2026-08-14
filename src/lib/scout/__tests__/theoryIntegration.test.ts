import { describe, expect, it, vi } from "vitest";
import { Chess } from "chess.js";
import { configFor, generateTheoryLines } from "@/lib/scout/theoryLines";
import { createHistoryLookup, createMaiaProvider } from "@/lib/scout/theoryProviders";
import type { OpeningTreeNode } from "@/types/scout";

const START = new Chess().fen();
const fenAfter = (...sans: string[]) => {
  const c = new Chess();
  for (const s of sans) c.move(s);
  return c.fen();
};
const node = (
  move: string,
  fen: string,
  totalGames: number,
  children: OpeningTreeNode[] = []
): OpeningTreeNode => ({ move, fen, totalGames, wins: 0, draws: 0, losses: 0, children });

// They answer 1.e4 with c5 60% / e5 40%, from 50 real games.
const tree = node("", START, 50, [
  node("e4", fenAfter("e4"), 50, [
    node("c5", fenAfter("e4", "c5"), 30),
    node("e5", fenAfter("e4", "e5"), 20),
  ]),
]);

const engine = async (fen: string) => new Chess(fen).moves().sort()[0];

describe("theory search wired to the real providers", () => {
  it("blends their history with Maia and produces playable lines", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        humanLikeMove: "e7e5",
        confidence: 0.55,
        alternativeMoves: [{ move: "c7c5", probability: 0.45 }],
      }),
    } as unknown as Response);

    const { maia, isAvailable } = createMaiaProvider({ rating: 1600, fetchImpl });
    const res = await generateTheoryLines(
      START,
      "white",
      { history: createHistoryLookup(tree), maia, bestMove: engine },
      configFor("recommended")
    );

    expect(isAvailable()).toBe(true);
    expect(res.lines.length).toBeGreaterThan(1);

    // Every line must be legal chess and end on your move.
    for (const line of res.lines) {
      const board = new Chess();
      for (const m of line.moves) expect(() => board.move(m.san)).not.toThrow();
      expect(line.moves[line.moves.length - 1].side).toBe("you");
    }
  });

  it("degrades to shorter prep — never invented prep — when Maia is down", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 503 } as unknown as Response);

    const { maia, isAvailable } = createMaiaProvider({ rating: 1600, fetchImpl });
    const res = await generateTheoryLines(
      START,
      "white",
      { history: createHistoryLookup(tree), maia, bestMove: engine },
      configFor("recommended")
    );

    expect(isAvailable()).toBe(false);

    // Their book covers 1.e4 only. Past it there is no history and no Maia, so
    // the lines must stop rather than continue on a guess.
    for (const line of res.lines) {
      expect(line.moves.length).toBeLessThanOrEqual(4);
      const board = new Chess();
      for (const m of line.moves) expect(() => board.move(m.san)).not.toThrow();
    }
    expect(res.lines.some(l => l.stoppedBy === "no-model")).toBe(true);
  });

  it("produces nothing at all when there is neither history nor Maia", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 503 } as unknown as Response);
    const { maia } = createMaiaProvider({ rating: 1600, fetchImpl });

    const res = await generateTheoryLines(
      START,
      "white",
      { history: createHistoryLookup(null), maia, bestMove: engine },
      configFor("recommended")
    );

    // One opening move from the engine, then immediately off-model.
    expect(res.lines).toHaveLength(1);
    expect(res.lines[0].stoppedBy).toBe("no-model");
  });
});
