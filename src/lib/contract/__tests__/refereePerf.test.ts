/**
 * PR-CI-3 gate: block-hold p95 < 100ms (plan §5 latency table).
 *
 * The "block hold" is the deterministic referee pass a completed [INSIGHT]
 * block pays before flushing in enforced mode (and the shadow-mode cost
 * today). Deterministic + synthetic: 60 realistic card bodies (SAN
 * sequences, squares, eval figures, tactical keywords, stage-9 trigger
 * phrases) through refereeInsight, asserting the p95 of measured wall time
 * stays well under the 100ms budget. Pure CPU regex work — headroom is
 * enormous (single-digit ms typical); the assertion exists so a future
 * accidentally-quadratic check trips CI before it trips serving.
 */
import { describe, it, expect } from "vitest";
import { refereeInsight } from "@/lib/contract/referee";
import { renderInsightBlock } from "@/lib/contract/insightGrammar";
import { makeInsight } from "./insightFactory";

/** Deterministic pseudo-random card bodies (no Math.random — stable runs). */
function syntheticBody(i: number): string {
  const squares = ["d4", "e6", "g7", "h5", "a3", "c6", "f2", "b7"];
  const sq = (k: number) => squares[(i + k) % squares.length];
  return [
    `You played Bd3 here, but the engine screams Ne6 — after Ne6 Qd7 Nxg7 the knight forks queen and king.`,
    `The eval swings from +1.38 to -2.12 in one move; the better path kept you at +3.20.`,
    `Notice the pawn on ${sq(0)} and the pressure against ${sq(1)}; your rook on ${sq(2)} attacks the base of the chain.`,
    `Some say this is a skewer, others a pin, but really the piece on ${sq(3)} was simply hanging.`,
    `There is a forced mate in ${((i * 7) % 9) + 2} if you find the right squares — completely winning, a decisive advantage.`,
    `Obviously you should just take; the position is theoretically winning per tablebase.`,
    `A long line to consider: Qh5 g6 Qxe5 f6 Qe2 with total domination on the dark squares around ${sq(4)}.`,
  ]
    .slice(0, (i % 5) + 3)
    .join(" ");
}

describe("block-hold budget (plan §5: deterministic checks per block, p95 < 100ms)", () => {
  it("p95 of refereeInsight wall time over 60 synthetic blocks is < 100ms", () => {
    const insight = makeInsight();
    const samples: number[] = [];
    for (let i = 0; i < 60; i++) {
      const block = renderInsightBlock(insight, syntheticBody(i));
      const result = refereeInsight(block, insight, {
        userRating: 1500,
        correlationId: `perf-${i}`,
      });
      samples.push(result.elapsedMs);
      // Sanity: the synthetic bad bodies actually exercise the checks
      // (fabrication-heavy prose must produce findings, or we're timing a
      // no-op).
      if (i % 5 !== 0) expect(result.findings.length).toBeGreaterThan(0);
    }
    const sorted = [...samples].sort((a, b) => a - b);
    const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1];
    const max = sorted[sorted.length - 1];
    // eslint-disable-next-line no-console
    console.log(`block-hold: p95=${p95}ms max=${max}ms over ${samples.length} blocks`);
    expect(p95).toBeLessThan(100);
  });
});
