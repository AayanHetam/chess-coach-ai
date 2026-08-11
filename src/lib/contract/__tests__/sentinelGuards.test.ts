import { describe, expect, it } from "vitest";
import { renderLegacyPrompt } from "../serialize";
import { selectInsights } from "../selectInsights";
import type { GameEvalInput } from "../gameEvalSchema";
import { evalFact, lineFact, makeContract, makeInsight } from "./insightFactory";

/**
 * GROUP C — fabricated engine data from client timeout sentinels.
 * (MASTERMIND_CONTEXT/SILENT_SUBSTITUTION_HANDOFF.md §3 Group C.)
 *
 * When the browser Stockfish blows its per-position budget it returns
 * `{pv: [], depth: 0, multiPv: 1, cp: 0}` (uciEngine.ts). That is a
 * "no answer" marker, but it is shaped exactly like a real "dead equal"
 * evaluation, so every renderer that does not check `depth === 0` /
 * `sentinel` turns a timeout into a confident chess claim.
 *
 * This matters more than a normal rendering bug: the CONTRACT is what the
 * output referee validates prose against. A sentence saying "that was a
 * blunder" is judged *backed* if the contract says the move was a blunder —
 * the referee has no way to know the contract's claim came from a timeout.
 * So these fabrications pass validation and are reported as grounded.
 * Cited means consistent-with-the-contract; it never means true.
 *
 * These only bite on slow devices, which is why they are invisible in dev
 * and absent from eval fixtures (which carry real Stockfish evals).
 */

const SENTINEL = { cp: 0, mate: null, depth: 0, sentinel: true, display: "engine data unavailable" };

describe("C3 — a never-evaluated move is not labelled with a classification", () => {
  function promptForMoveTable(over: Record<string, unknown>) {
    const c = makeContract([]);
    c.moveTable = [
      {
        ply: 20,
        moveNumber: 11,
        color: "w",
        san: "Bd3",
        fenBefore: "3q2k1/6p1/8/8/3NP3/8/8/6K1 w - - 0 11",
        fenAfter: "3q2k1/6p1/8/8/3BP3/8/8/6K1 b - - 0 11",
        changeDescription: null,
        classification: "blunder",
        evalAfter: evalFact(SENTINEL),
        bestWas: null,
        ...over,
      },
    ];
    return renderLegacyPrompt(c);
  }

  it("does not print a classification for a sentinel ply", () => {
    // The bug renders BOTH of these in the same block, three lines apart:
    //     Classification: BLUNDER
    //     Eval: engine data unavailable for this move (analysis timed out)
    const out = promptForMoveTable({});
    expect(out).toContain("engine data unavailable");
    expect(out).not.toContain("Classification: BLUNDER");
  });

  it("still prints the classification when the engine actually answered", () => {
    const out = promptForMoveTable({
      evalAfter: evalFact({ cp: -212, display: "-2.12" }),
    });
    expect(out).toContain("Classification: BLUNDER");
  });

  it("prints no classification line when there is no eval at all", () => {
    const out = promptForMoveTable({ evalAfter: null, classification: "blunder" });
    // No eval means nothing corroborates the label; it must not be asserted.
    expect(out).not.toContain("Classification: BLUNDER");
  });
});

describe("C5 — 'Best was' and candidate lines do not render sentinel evals", () => {
  it("does not render a numeric eval for a sentinel best-line", () => {
    const c = makeContract([]);
    c.moveTable = [
      {
        ply: 20,
        moveNumber: 11,
        color: "w",
        san: "Bd3",
        fenBefore: "3q2k1/6p1/8/8/3NP3/8/8/6K1 w - - 0 11",
        fenAfter: "3q2k1/6p1/8/8/3BP3/8/8/6K1 b - - 0 11",
        changeDescription: null,
        classification: null,
        evalAfter: evalFact(SENTINEL),
        bestWas: {
          san: "Ne6",
          line: {
            san: ["Ne6", "Qd7"],
            pvUci: ["d4e6", "d8d7"],
            eval: evalFact(SENTINEL),
          },
        },
      },
    ];
    const out = renderLegacyPrompt(c);
    // The bug prints "Best was: Ne6 (+0.00, depth 0)" three lines below
    // "engine data unavailable" — two contradictory claims, one block.
    expect(out).not.toContain("+0.00, depth 0");
    expect(out).not.toMatch(/Best was: Ne6 \(\+0\.00/);
    // The move itself is still worth naming; only the fake number goes.
    expect(out).toContain("Best was: Ne6");
  });

  it("does not render a numeric eval for a sentinel candidate line", () => {
    const insight = makeInsight({
      lines: [
        lineFact("M1.pv0", ["Ne6"], ["d4e6"], SENTINEL),
        lineFact("M1.pv1", ["Bd3"], ["f1d3"], SENTINEL, true),
      ],
    });
    const out = renderLegacyPrompt(makeContract([insight]));
    expect(out).not.toContain("+0.00");
  });

  it("still renders real candidate evals unchanged", () => {
    const insight = makeInsight({});
    const out = renderLegacyPrompt(makeContract([insight]));
    expect(out).toContain("+3.20");
  });
});

describe("C4 — a sentinel is not selected as the biggest moment of the game", () => {
  /**
   * Scan 1 (TOP MISTAKES) already skips sentinels. Scan 2 (CHESS INTELLIGENCE
   * top-3) did not, so a `cp: 0` sentinel sitting next to a winning position
   * produced a phantom multi-hundred-centipawn "drop" that sorted to rank 1
   * and was rendered under a header that calls it verified analysis.
   */
  const line = (cp: number, depth = 16) => ({ pv: ["e2e4"], cp, depth, multiPv: 1 });
  const moveHistory = ["e4", "e5", "Nf3", "Nc6"];

  /**
   * A comfortably winning game for White (+6.20 throughout) with ONE position
   * the engine never finished.
   *
   * The sentinel must sit at index 1 for this to reproduce. The drop for ply
   * `i` is computed from positions[i] vs positions[i+1], so a `cp: 0` at
   * index 1 fabricates a 620cp swing TWICE — once as ply 0's collapse into
   * it, once as ply 1's recovery out of it. (Putting it at index 2 yields two
   * NEGATIVE drops, which the `drop > 50` filter discards for unrelated
   * reasons — a fixture that would have made these tests pass vacuously.)
   */
  function evalWithSentinel(): GameEvalInput {
    const positions = [0, 1, 2, 3, 4].map(() => ({
      bestMove: "e2e4",
      lines: [line(620)],
    }));
    positions[1] = { bestMove: "e2e4", lines: [line(0, 0)] };
    return { positions };
  }

  it("the fixture really does fabricate a drop (guards against a vacuous test)", () => {
    // If Scan 1's guard were removed, these plies WOULD be selected. Asserting
    // that here means the two tests below cannot pass just because the fixture
    // produces nothing interesting.
    const withoutSentinelFlag: GameEvalInput = {
      positions: evalWithSentinel().positions.map((p) => ({
        ...p,
        lines: [{ ...p.lines[0], depth: 16 }], // same cp: 0, but not a sentinel
      })),
    };
    const { intelligenceTop3 } = selectInsights(moveHistory, withoutSentinelFlag, "w");
    expect(intelligenceTop3.length).toBeGreaterThan(0);
  });

  it("excludes the phantom drops created by a sentinel", () => {
    const { intelligenceTop3 } = selectInsights(moveHistory, evalWithSentinel(), "w");
    const plies = intelligenceTop3.map((i) => i.ply);
    expect(plies).not.toContain(0);
    expect(plies).not.toContain(1);
  });

  it("finds nothing at all when the only 'drop' in the game is a sentinel", () => {
    const { intelligenceTop3, topMistakes } = selectInsights(
      moveHistory,
      evalWithSentinel(),
      "w"
    );
    expect(intelligenceTop3).toHaveLength(0);
    // Scan 1's existing guard — asserted so a refactor can't remove it quietly.
    expect(topMistakes).toHaveLength(0);
  });

  it("still finds a real mistake when the engine answered", () => {
    const positions = [
      { bestMove: "e2e4", lines: [line(620)] },
      { bestMove: "e2e4", lines: [line(-50)] }, // White threw it away at ply 0
      { bestMove: "e2e4", lines: [line(-60)] },
      { bestMove: "e2e4", lines: [line(-70)] },
      { bestMove: "e2e4", lines: [line(-80)] },
    ];
    const { intelligenceTop3 } = selectInsights(moveHistory, { positions }, "w");
    expect(intelligenceTop3.length).toBeGreaterThan(0);
  });
});
