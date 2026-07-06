import { describe, it, expect } from "vitest";

import { deriveProbPlaysBest, type MaiaLikelyMove } from "../maia";

// Starting position; SF best e2e4 → SAN "e4".
const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const moves = (pairs: Array<[string, number]>): MaiaLikelyMove[] =>
  pairs.map(([move, probability]) => ({ move, probability }));

// The /predict endpoint returns the top human-like move + up to 4 alternatives
// (SAN, falling back to UCI when the service's own conversion fails). This
// helper derives prob_plays_best for the SF best move from that list.
describe("deriveProbPlaysBest", () => {
  it("returns the top move's confidence when SF best IS the human-like move", () => {
    const prob = deriveProbPlaysBest(START_FEN, "e2e4", moves([["e4", 0.42], ["d4", 0.2]]));
    expect(prob).toBe(0.42);
  });

  it("finds the SF best move among alternatives", () => {
    const prob = deriveProbPlaysBest(START_FEN, "e2e4", moves([["d4", 0.3], ["Nf3", 0.2], ["e4", 0.18]]));
    expect(prob).toBe(0.18);
  });

  it("matches when the service returned UCI instead of SAN", () => {
    const prob = deriveProbPlaysBest(START_FEN, "e2e4", moves([["d4", 0.3], ["e2e4", 0.25]]));
    expect(prob).toBe(0.25);
  });

  it("ignores check/mate/annotation decorations when matching", () => {
    // Position where Qh5 gives check: use a contrived list with decorations.
    const prob = deriveProbPlaysBest(START_FEN, "e2e4", moves([["e4!?", 0.33]]));
    expect(prob).toBe(0.33);
  });

  it("uses the min-probability upper bound when absent and bound < VIS_LOW", () => {
    // SF best not in the top 5; smallest returned prob 0.04 < 0.15 threshold —
    // any true value below the bound classifies identically (NONE).
    const prob = deriveProbPlaysBest(
      START_FEN,
      "a2a3",
      moves([["e4", 0.4], ["d4", 0.3], ["Nf3", 0.1], ["c4", 0.06], ["g3", 0.04]]),
    );
    expect(prob).toBe(0.04);
  });

  it("fails closed (null) when absent and the bound cannot classify", () => {
    // Smallest returned prob 0.2 ≥ 0.15: the true probability could be in any
    // bucket below MED — guessing would fabricate grounding.
    const prob = deriveProbPlaysBest(START_FEN, "a2a3", moves([["e4", 0.5], ["d4", 0.2]]));
    expect(prob).toBeNull();
  });

  it("fails closed on an empty candidate list", () => {
    expect(deriveProbPlaysBest(START_FEN, "e2e4", [])).toBeNull();
  });

  it("still matches via UCI when the FEN is unparseable (SAN conversion impossible)", () => {
    const prob = deriveProbPlaysBest("not-a-fen", "e2e4", moves([["e2e4", 0.3]]));
    expect(prob).toBe(0.3);
  });
});
