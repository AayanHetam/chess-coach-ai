/**
 * The strip under the board with the depth-20 re-check (COACH_CLAIM_VERIFIER):
 * a re-checked move reads its deeper pair — evals, the engine's move, the
 * verdict — and every eval is labelled with its depth. Real games, stored
 * engine truth; depth 16 stands in for the browser's pass 1.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { MoveClassification } from "@/types/enums";
import type { PositionEval } from "@/types/eval";
import {
  positionsToRecheck,
  selectFlaggedMoments,
  type GameEvalRecheck,
} from "@/lib/coach/deepRecheck";
import {
  loadGame,
  positionEvals,
  type GameId,
} from "@/lib/coach/__tests__/coachAccuracyFixtures";
import { analyzeMoveAt } from "../moveAnalysis";

function recheckFor(game: GameId): GameEvalRecheck {
  const moments = selectFlaggedMoments(positionEvals(game, 16), {
    playerColor: "w",
  });
  const deep = positionEvals(game, 20);
  const positions: GameEvalRecheck["positions"] = {};
  for (const idx of positionsToRecheck(moments))
    positions[String(idx)] = { lines: deep[idx].lines };
  return {
    engine: "stockfish_17_1",
    depth: 20,
    positions,
    skipped: [],
    moments: moments.map((m) => m.move),
    budgetMs: 15_000,
    elapsedMs: 9_000,
  };
}

/** Pass 1 with the browser's label on one move. */
function passOne(
  game: GameId,
  ply: number,
  label: MoveClassification
): PositionEval[] {
  const p = positionEvals(game, 16);
  p[ply] = { ...p[ply], moveClassification: label };
  return p;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the strip with the re-check", () => {
  it("the Opera Game: 15.Bxd7+ stops reading as a blunder once depth 20 has looked", () => {
    const opera = loadGame("operaGame");
    const shallow = analyzeMoveAt(
      opera.sans,
      passOne("operaGame", 29, MoveClassification.Blunder),
      29,
      undefined,
      "w"
    )!;
    expect(shallow.classification).toBe(MoveClassification.Blunder);
    expect(shallow.depthLabel).toBe("d16");
    const deep = analyzeMoveAt(
      opera.sans,
      passOne("operaGame", 29, MoveClassification.Blunder),
      29,
      undefined,
      "w",
      recheckFor("operaGame")
    )!;
    expect(deep.classification).toBe(MoveClassification.Best);
    expect(deep.bestSan).toBeNull();
    expect(deep.depthLabel).toBe("d20");
    expect(deep.sentence).not.toMatch(/went wrong|real ground|slip/);
  });

  it("Game B, 12.Ng5: the move it names at depth 20 is 12.Rb1, and the knight is not blamed", () => {
    const b = loadGame("gameB");
    const a = analyzeMoveAt(
      b.sans,
      passOne("gameB", 23, MoveClassification.Inaccuracy),
      23,
      undefined,
      "w",
      recheckFor("gameB")
    )!;
    expect(a.bestSan).toBe("Rb1");
    expect(a.depthLabel).toBe("d20");
    expect(a.sentence).toMatch(/The engine preferred 12\. Rb1/);
    expect(a.sentence).not.toMatch(/hanging|en prise|can now be taken/);
  });

  it("Game B, 15.Qh7+: 'You had mate in 3 with 15. Nxe6+'", () => {
    const b = loadGame("gameB");
    const a = analyzeMoveAt(
      b.sans,
      passOne("gameB", 29, MoveClassification.Inaccuracy),
      29,
      undefined,
      "w",
      recheckFor("gameB")
    )!;
    expect(a.missedMateIn).toBe(3);
    expect(a.sentence).toMatch(/You had mate in 3 with 15\. Nxe6\+\.$/);
  });

  it("a 'great' move that was not the engine's first choice is not called the move the engine rates highest", () => {
    const b = loadGame("gameB");
    const a = analyzeMoveAt(
      b.sans,
      passOne("gameB", 23, MoveClassification.Great),
      23,
      undefined,
      "w"
    )!;
    expect(a.bestSan).toBe("Bd3");
    expect(a.sentence).not.toMatch(/rates highest/);
    expect(a.sentence).toMatch(/A strong move\. The engine preferred 12\. Bd3/);
  });

  it("with the flag off, the re-check is ignored and nothing is labelled", () => {
    vi.stubEnv("COACH_CLAIM_VERIFIER", "0");
    vi.stubEnv("NEXT_PUBLIC_COACH_CLAIM_VERIFIER", "0");
    const opera = loadGame("operaGame");
    const a = analyzeMoveAt(
      opera.sans,
      passOne("operaGame", 29, MoveClassification.Blunder),
      29,
      undefined,
      "w",
      recheckFor("operaGame")
    )!;
    expect(a.classification).toBe(MoveClassification.Blunder);
    expect(a.depthLabel).toBeNull();
    expect(a.missedMateIn).toBeNull();
  });
});
