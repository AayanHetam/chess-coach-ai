import { describe, expect, it } from "vitest";
import { enhancedAnalysisSchema } from "../schemas";

/**
 * Bounds on the request body, which on a cost-bearing route is the thing the
 * caller controls and the server pays for.
 *
 * `moveHistory` was `z.array(z.string())` — unbounded count of unbounded
 * strings — and the contract builder replays it move by move, so an oversized
 * one buys CPU as well as prompt tokens. These caps are deliberately far above
 * any real game (the longest recorded master game is ~269 moves = 538 plies),
 * so they can only ever reject something that was never chess.
 */
describe("enhancedAnalysisSchema bounds moveHistory", () => {
  const moves = (n: number, san = "e4") => Array.from({ length: n }, () => san);

  it("accepts a game longer than any ever played", () => {
    const parsed = enhancedAnalysisSchema.safeParse({ moveHistory: moves(600) });
    expect(parsed.success).toBe(true);
  });

  it("rejects an absurd number of plies", () => {
    const parsed = enhancedAnalysisSchema.safeParse({ moveHistory: moves(5000) });
    expect(parsed.success).toBe(false);
  });

  it("rejects a single oversized move string", () => {
    const parsed = enhancedAnalysisSchema.safeParse({
      moveHistory: ["e4", "x".repeat(5000)],
    });
    expect(parsed.success).toBe(false);
  });

  it("still accepts the longest real SAN shapes", () => {
    const parsed = enhancedAnalysisSchema.safeParse({
      moveHistory: ["e4", "exd8=Q+", "Qa1xb2+", "O-O-O#", "Ngxf3"],
    });
    expect(parsed.success).toBe(true);
  });
});
