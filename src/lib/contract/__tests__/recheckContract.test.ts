/**
 * The depth-20 re-check on the server (COACH_CLAIM_VERIFIER): a move whose
 * two positions were re-checked is judged by the deeper pair — in card
 * selection, its card's evals and lines, the move table — and every eval
 * says which engine and depth produced it. Real games, stored engine truth.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.hoisted(() => {
  delete process.env.LC0_API_URL;
  delete process.env.MAIA_API_URL;
});

import { buildCoachContract } from "@/lib/contract/builder";
import { serializeForVerbalizer } from "@/lib/contract/serialize";
import { renderTemplateCardBody } from "@/lib/contract/templateCard";
import { selectCardInsights } from "@/lib/prompts/verbalizerPrompt";
import {
  __resetFetchForTesting,
  __setFetchForTesting,
} from "@/lib/grounding/chessdb";
import {
  positionsToRecheck,
  selectFlaggedMoments,
  type GameEvalRecheck,
} from "@/lib/coach/deepRecheck";
import {
  loadGame,
  positionEvals,
  truthAt,
  type GameId,
} from "@/lib/coach/__tests__/coachAccuracyFixtures";

/** What the browser would send after re-checking the flagged moments with the stored depth-20 truth. */
function recheckFor(game: GameId, drop: number[] = []): GameEvalRecheck {
  const moments = selectFlaggedMoments(positionEvals(game, 16), {
    playerColor: "w",
  });
  const deep = positionEvals(game, 20);
  const positions: GameEvalRecheck["positions"] = {};
  for (const idx of positionsToRecheck(moments)) {
    if (!drop.includes(idx))
      positions[String(idx)] = {
        lines: deep[idx].lines,
        bestMove: deep[idx].bestMove,
      };
  }
  return {
    engine: "stockfish_17_1",
    depth: 20,
    positions,
    skipped: drop,
    moments: moments.map((m) => m.move),
    budgetMs: 15_000,
    elapsedMs: 9_000,
  };
}

function build(game: GameId, recheck?: GameEvalRecheck) {
  return buildCoachContract({
    moveHistory: loadGame(game).sans,
    gameEval: {
      positions: positionEvals(game, 16),
      settings: { engine: "stockfish_17_lite", depth: 16, multiPv: 3 },
      ...(recheck ? { recheck } : {}),
    } as never,
    playerColor: "w",
  });
}

beforeAll(() => {
  __setFetchForTesting(async () => {
    throw new Error("network disabled");
  });
});
afterAll(() => {
  __resetFetchForTesting();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the Opera Game: depth 16's phantom blunder", () => {
  it("is carded at depth 16 alone — 15.Bxd7+ 'blunder'", async () => {
    const contract = await build("operaGame");
    expect(
      selectCardInsights(contract).map((i) => `${i.moveNumber}.${i.playedSan}`)
    ).toEqual(["15.Bxd7+"]);
  }, 60_000);

  it("is gone once the flagged moments are re-checked at depth 20: Morphy's move was the best one", async () => {
    const contract = await build("operaGame", recheckFor("operaGame"));
    expect(
      contract.insights.find((i) => i.playedSan === "Bxd7+")
    ).toBeUndefined();
    expect(selectCardInsights(contract).map((i) => i.playedSan)).not.toContain(
      "Bxd7+"
    );
  }, 60_000);

  it("with the flag off, the re-check is ignored and nothing changes", async () => {
    vi.stubEnv("COACH_CLAIM_VERIFIER", "0");
    const withRecheck = await build("operaGame", recheckFor("operaGame"));
    const without = await build("operaGame");
    expect(serializeForVerbalizer(withRecheck)).toBe(
      serializeForVerbalizer(without)
    );
  }, 60_000);
});

describe("Game B with the re-check", () => {
  it("15.Qh7+ says what it was — a missed mate in 3 — at depth 20, with its engine", async () => {
    const contract = await build("gameB", recheckFor("gameB"));
    const qh7 = contract.insights.find((i) => i.playedSan === "Qh7+")!;
    expect(qh7.missedMate).toEqual({
      mateIn: 3,
      bestSan: "Nxe6+",
      line: ["Nxe6+", "Kf6", "Qg5+", "Kxe6", "Bf5#"],
    });
    expect(qh7.evalBefore).toMatchObject({
      display: "M+3",
      depth: 20,
      provenance: { engine: "stockfish_17_1" },
    });
    expect(qh7.evalAfter.depth).toBe(20);
    const card = renderTemplateCardBody(qh7);
    expect(card).toContain("You had mate in 3 here with Nxe6+");
    expect(card).not.toMatch(/pawns of ground/);
  }, 60_000);

  it("12.Ng5 is judged at depth 20: the engine's move there is 12.Rb1", async () => {
    const contract = await build("gameB", recheckFor("gameB"));
    const ng5 = contract.insights.find((i) => i.playedSan === "Ng5")!;
    expect(ng5.bestSan).toBe("Rb1");
    expect(ng5.lines[0].san[0]).toBe("Rb1");
    expect(ng5.evalBefore.display).toBe(
      `+${(truthAt("gameB", 20, 22).evalCp! / 100).toFixed(2)}`
    );
  }, 60_000);

  it("the model sees depth and engine on every eval; a re-checked move's browser label goes", async () => {
    const contract = await build("gameB", recheckFor("gameB"));
    const row = contract.moveTable[28];
    expect(row.classification).toBeNull();
    expect(row.evalAfter).toMatchObject({
      depth: 20,
      provenance: { engine: "stockfish_17_1" },
    });
    expect(contract.moveTable[0].evalAfter).toMatchObject({
      depth: 16,
      provenance: { engine: "stockfish_17_lite" },
    });
    const wire = serializeForVerbalizer(contract);
    expect(wire).toContain('"depth":20');
    expect(wire).toContain('"engine":"stockfish_17_1"');
    expect(wire).toContain('"engine":"stockfish_17_lite"');
    expect(wire).toContain('"missedMate"');
  }, 60_000);

  it("a move whose pair did not finish in time keeps its depth-16 evals", async () => {
    const contract = await build("gameB", recheckFor("gameB", [23]));
    const ng5 = contract.insights.find((i) => i.playedSan === "Ng5")!;
    expect(ng5.evalBefore.depth).toBe(16);
    expect(ng5.bestSan).toBe("Bd3");
  }, 60_000);
});
