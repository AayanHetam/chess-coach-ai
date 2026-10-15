/**
 * The claim gate on real cards: Game B's and the Opera Game's contracts,
 * built offline from the stored engine truth (depth 16, the browser's pass),
 * with coach prose of the kind the QA caught. No model is called.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  delete process.env.LC0_API_URL;
  delete process.env.MAIA_API_URL;
});

import { buildCoachContract } from "@/lib/contract/builder";
import type { CoachContract, InsightContract } from "@/lib/contract/types";
import {
  __resetFetchForTesting,
  __setFetchForTesting,
} from "@/lib/grounding/chessdb";
import { applyClaimGate, checkCardClaims } from "../claimGate";
import { loadGame, positionEvals, type GameId } from "./coachAccuracyFixtures";

async function contractFor(id: GameId): Promise<CoachContract> {
  const g = loadGame(id);
  return buildCoachContract({
    moveHistory: g.sans,
    gameEval: {
      positions: positionEvals(id, 16),
      settings: { engine: "stockfish_17_lite", depth: 16, multiPv: 3 },
    } as never,
    playerColor: "w",
  });
}

let gameB: CoachContract;
let opera: CoachContract;
const card = (
  c: CoachContract,
  san: string,
  moveNumber: number
): InsightContract =>
  c.insights.find((i) => i.playedSan === san && i.moveNumber === moveNumber)!;
const check = (prose: string, insight: InsightContract) =>
  checkCardClaims(prose, insight, { log: false });
const only = (prose: string, insight: InsightContract) =>
  check(prose, insight).sentences[0];

beforeAll(async () => {
  __setFetchForTesting(async () => {
    throw new Error("network disabled in claim gate tests");
  });
  [gameB, opera] = await Promise.all([
    contractFor("gameB"),
    contractFor("operaGame"),
  ]);
}, 120_000);

afterAll(() => {
  __resetFetchForTesting();
});

describe("the contract the gate reads", () => {
  it("carries the engine's reply after each played move (flag on)", () => {
    expect(card(gameB, "Ng5", 12).refutation?.slice(0, 2)).toEqual([
      "g6",
      "Rb1",
    ]);
    expect(card(gameB, "Nxa8", 19).refutation?.[0]).toBe("Kxg5");
  });
});

describe("material: where it ends, and what a line wins", () => {
  it("rewrites 'you come out a pawn up' on the 19.Nxa8 card's line, which ends with White a point down", () => {
    const s = only(
      "After 19. Qh6+ you come out a pawn up [F:M2.pv0].",
      card(gameB, "Nxa8", 19)
    );
    expect(s.claims[0].verdict.status).toBe("false");
    expect(s.action).toBe("rewrite");
    expect(s.rewrite).toBe("After 22...Be7, Black is 1 point up [F:M2.pv0].");
    expect(s.source).toBe("verified-fact");
  });

  it("keeps a true change: the game line wins a rook for a knight", () => {
    const s = only(
      "After 19.Nxa8 Kxg5 you have won a rook for a knight [F:M2.game].",
      card(gameB, "Nxa8", 19)
    );
    expect(s.claims.map((c) => c.verdict.status)).toEqual(["verified"]);
    expect(s.action).toBe("keep");
    expect(s.source).toBe("verified-fact");
  });

  it("a line that wins a rook can still end behind: 'White is a rook up' is false there", () => {
    const s = only(
      "The engine line has White come out a rook ahead [F:M2.pv0].",
      card(gameB, "Nxa8", 19)
    );
    expect(s.action).toBe("rewrite");
  });

  it("a hypothetical is not a claim about the line", () => {
    const s = only(
      "Had Black taken, White would be a rook up [F:M2.pv0].",
      card(gameB, "Nxa8", 19)
    );
    expect(s.claims).toEqual([]);
    expect(s.action).toBe("keep");
  });
});

describe("hanging pieces: 12.Ng5 (QA bug 3)", () => {
  const ng5 = () => card(gameB, "Ng5", 12);

  it("'12.Ng5 leaves the knight hanging' reads the knight that moved, and nothing attacks it", () => {
    const s = only("12. Ng5 leaves the knight hanging [F:M5].", ng5());
    expect(s.claims[0].claim).toMatchObject({
      kind: "hangs",
      square: "g5",
      piece: "n",
    });
    expect(s.claims[0].verdict.status).toBe("false");
    expect(s.action).toBe("drop");
  });

  it("'leaves the knight on b5 hanging' as the reason fails: the engine's reply never takes it", () => {
    const s = only(
      "Worse, 12. Ng5 leaves the knight on b5 hanging [F:M5].",
      ng5()
    );
    const byKind = Object.fromEntries(
      s.claims.map((c) => [c.claim.kind, c.verdict.status])
    );
    expect(byKind).toEqual({ hangs: "verified", refutation_takes: "false" });
    expect(s.action).toBe("drop");
  });

  it("…but when the reply does take it, the reason stands (19.Nxa8 drops the g5 knight)", () => {
    const s = only(
      "19. Nxa8 leaves the knight on g5 hanging [F:M2].",
      card(gameB, "Nxa8", 19)
    );
    expect(s.claims.every((c) => c.verdict.status === "verified")).toBe(true);
    expect(s.action).toBe("keep");
  });

  it("an unresolvable piece in an opinion survives as judgment; stated flat, it is dropped", () => {
    const insight = card(gameB, "Nxa8", 19);
    const hedged = only(
      "It looks like the knight is hanging in that line [F:M2.pv1].",
      insight
    );
    expect(hedged.claims[0].verdict.status).toBe("unverified");
    expect(hedged.action).toBe("keep");
    expect(hedged.source).toBe("judgment");
    expect(
      only("The knight is hanging in that line [F:M2.pv1].", insight).action
    ).toBe("drop");
  });
});

describe("captures and pieces", () => {
  it("Opera Game: 15.Bxd7+ takes the rook on d7, not a knight — rewritten to the board's fact", () => {
    const s = only(
      "15. Bxd7+ takes the knight on d7 [F:M1].",
      card(opera, "Bxd7+", 15)
    );
    expect(s.claims[0].verdict.status).toBe("false");
    expect(s.rewrite).toBe("15.Bxd7+ takes the rook on d7 [F:M1].");
  });

  it("a piece named on its square is checked against every line of the card", () => {
    const insight = card(gameB, "Nxa8", 19);
    expect(
      only("Your knight on g5 was doing a lot of work.", insight).action
    ).toBe("keep");
    const phantom = only("Your bishop on e5 was doing a lot of work.", insight);
    expect(phantom.claims[0].verdict.status).toBe("false");
    expect(phantom.action).toBe("drop");
  });

  it("mate written with # is checked against the cited line", () => {
    const s = only(
      "After 15. Nxe6+ Kf6 16. Qg5+ Kxe6 17. Bf5# it is over [F:M1.pv0].",
      card(gameB, "Qh7+", 15)
    );
    expect(
      s.claims.map((c) => [c.claim.kind, c.verdict.status])
    ).toContainEqual(["is_mate", "verified"]);
    expect(s.action).toBe("keep");
  });
});

describe("labels and the gate as a whole", () => {
  it("tags engine statements and judgment", () => {
    const insight = card(gameB, "Nxa8", 19);
    expect(
      only("The engine preferred 19. Qh6+ here [F:M2].", insight).source
    ).toBe("engine");
    expect(
      only(
        "Grabbing the rook felt natural, but the king hunt mattered more.",
        insight
      ).source
    ).toBe("judgment");
  });

  it("applyClaimGate rewrites and drops in place, and gives up on a gutted card", () => {
    const insight = card(gameB, "Ng5", 12);
    const body = [
      "You wanted to bring another piece to the king, and that instinct is right.",
      "12. Ng5 leaves the knight hanging [F:M5]. The engine preferred 12. Bd3 here [F:M5].",
      "Keep looking for the move that adds an attacker without loosening anything.",
    ].join("\n");
    const out = applyClaimGate(body, check(body, insight))!;
    expect(out).not.toMatch(/hanging/);
    expect(out).toMatch(/The engine preferred 12\. Bd3/);
    expect(
      applyClaimGate(
        "12. Ng5 leaves the knight hanging [F:M5].",
        check("12. Ng5 leaves the knight hanging [F:M5].", insight)
      )
    ).toBeNull();
  });
});
