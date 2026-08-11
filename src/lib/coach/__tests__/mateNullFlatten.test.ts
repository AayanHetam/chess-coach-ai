import { describe, expect, it } from "vitest";
import { buildCompactGameContext } from "../compactGameContext";
import { selectInsights } from "@/lib/contract/selectInsights";
import type { GameEvalInput } from "@/lib/contract/gameEvalSchema";

/**
 * C6 (SILENT_SUBSTITUTION_HANDOFF §3 Group C) — `mate: null` flattens to
 * "mate for Black".
 *
 * Eight sites flatten an eval with `mate !== undefined ? (mate > 0 ? 9999 :
 * -9999) : (cp ?? 0)`. With `mate: null` that test is TRUE (null !== undefined)
 * and `null > 0` is FALSE, so the position scores **−9999** — a forced loss for
 * White — and the formatter prints the literal string `Mnull`. A quiet +0.30
 * position becomes "Black is mating".
 *
 * Latent, not live: the first-party producer emits `undefined`. But `gameEval`
 * is `z.any()` at the request boundary, so ANY client — a replay tool, a future
 * import path, a hand-rolled payload, JSON that round-tripped through a store
 * that normalises undefined to null — can deliver this shape. `positionFacts.ts`
 * already types `mate?: number | null`, so half the codebase expects it.
 *
 * The fix is `typeof mate === "number"` at every site. These tests assert the
 * *behaviour*, so they hold whichever way a future refactor spells it.
 */

const MOVES = ["e4", "e5", "Nf3", "Nc6"];

/** A quiet, roughly level game — with `mate: null` spelled out everywhere. */
function evalWithMateNull(): GameEvalInput {
  const line = (cp: number) => ({
    pv: ["e2e4"],
    cp,
    // The whole point: present-but-null, which is neither `undefined` nor a number.
    mate: null as unknown as number | undefined,
    depth: 16,
    multiPv: 1,
  });
  return {
    positions: [
      { bestMove: "e2e4", lines: [line(30)] },
      { bestMove: "e2e4", lines: [line(25)] },
      { bestMove: "e2e4", lines: [line(20)] },
      { bestMove: "e2e4", lines: [line(28)] },
      { bestMove: "e2e4", lines: [line(22)] },
    ],
  };
}

describe("C6 — a null mate is 'no mate', not 'mate for Black'", () => {
  it("never renders the literal string Mnull", () => {
    const out = buildCompactGameContext(MOVES, evalWithMateNull(), "w");
    expect(out).not.toContain("Mnull");
  });

  it("does not narrate a quiet game as a forced loss", () => {
    // Flattening to -9999 makes every ply look like a ~100-pawn swing, so the
    // compact context fills up with fabricated blunders in a level game.
    const out = buildCompactGameContext(MOVES, evalWithMateNull(), "w");
    expect(out).not.toContain("BLUNDER");
    expect(out).not.toContain("99.99");
    expect(out).not.toContain("M-");
  });

  it("still renders the real centipawn evals", () => {
    // The narrative reports the eval AFTER each move, so positions[0] (+0.30)
    // is never printed — the first line is positions[1]. Asserting +0.30 here
    // would have failed for a reason that has nothing to do with C6.
    const out = buildCompactGameContext(MOVES, evalWithMateNull(), "w");
    expect(out).toContain("Move 1 (White): e4 — eval +0.25");
    expect(out).toContain("Current eval: +0.22");
  });

  it("selects no insights from a level game whose mate fields are null", () => {
    const sel = selectInsights(MOVES, evalWithMateNull(), "w");
    expect(sel.topMistakes).toHaveLength(0);
    expect(sel.intelligenceTop3).toHaveLength(0);
  });

  it("does not fabricate a blunder when only ONE position carries mate: null", () => {
    // The genuinely dangerous shape, and the one a uniform fixture hides: when
    // every position flattens to -9999 the drops cancel out and nothing looks
    // wrong. Mix a single null in among real evals and the swing against its
    // neighbours is ~100 pawns — a fabricated forced loss, then a fabricated
    // resurrection on the very next ply.
    const good = (cp: number) => ({ pv: ["e2e4"], cp, depth: 16, multiPv: 1 });
    const nulled = {
      pv: ["e2e4"],
      cp: 25,
      mate: null as unknown as number | undefined,
      depth: 16,
      multiPv: 1,
    };
    const positions = [
      { bestMove: "e2e4", lines: [good(30)] },
      { bestMove: "e2e4", lines: [nulled] },
      { bestMove: "e2e4", lines: [good(20)] },
      { bestMove: "e2e4", lines: [good(28)] },
      { bestMove: "e2e4", lines: [good(22)] },
    ];
    const out = buildCompactGameContext(MOVES, { positions }, "w");
    expect(out).not.toContain("BLUNDER");
    expect(out).not.toContain("Mnull");

    const sel = selectInsights(MOVES, { positions }, "w");
    expect(sel.topMistakes).toHaveLength(0);
    expect(sel.intelligenceTop3).toHaveLength(0);
  });

  it("still honours a REAL mate score", () => {
    const line = (cp: number | undefined, mate?: number) => ({
      pv: ["e2e4"],
      ...(cp === undefined ? {} : { cp }),
      ...(mate === undefined ? {} : { mate }),
      depth: 16,
      multiPv: 1,
    });
    const positions = [
      { bestMove: "e2e4", lines: [line(30)] },
      { bestMove: "e2e4", lines: [line(undefined, -3)] }, // White gets mated
      { bestMove: "e2e4", lines: [line(undefined, -2)] },
      { bestMove: "e2e4", lines: [line(undefined, -2)] },
      { bestMove: "e2e4", lines: [line(undefined, -1)] },
    ];
    const out = buildCompactGameContext(MOVES, { positions }, "w");
    // A genuine mate must still flatten and narrate — the guard must reject
    // null, not weaken mate handling generally.
    expect(out).toContain("BLUNDER");
  });

  it("treats an absent mate exactly as before (no regression)", () => {
    const line = (cp: number) => ({ pv: ["e2e4"], cp, depth: 16, multiPv: 1 });
    const positions = [
      { bestMove: "e2e4", lines: [line(30)] },
      { bestMove: "e2e4", lines: [line(25)] },
      { bestMove: "e2e4", lines: [line(20)] },
      { bestMove: "e2e4", lines: [line(28)] },
      { bestMove: "e2e4", lines: [line(22)] },
    ];
    const withUndefined = buildCompactGameContext(MOVES, { positions }, "w");
    const withNull = buildCompactGameContext(MOVES, evalWithMateNull(), "w");
    expect(withNull).toBe(withUndefined);
  });
});
