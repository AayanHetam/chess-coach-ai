/**
 * Pins and forced moves (COACH_CLAIM_VERIFIER). The live run of Game B
 * (docs/coach-accuracy-notes.md) shipped two false sentences the gate could
 * not read: "after the king is forced to f6" (Black had four replies) and
 * "the queen on h7 pins the king on g7" (a king is never pinned). The
 * verifier now decides both kinds; the gate reads them. No model is called.
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
import { checkCardClaims } from "../claimGate";
import {
  positionsToRecheck,
  selectFlaggedMoments,
  type GameEvalRecheck,
} from "../deepRecheck";
import { verifyClaims, type Claim } from "../verifyClaims";
import { loadGame, positionEvals } from "./coachAccuracyFixtures";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const opera = loadGame("operaGame").sans;
const gameB = loadGame("gameB").sans;
/** One claim about the position after `plies` moves of `sans` (plus `extra`). */
const at = (
  sans: string[],
  plies: number,
  claim: Claim,
  extra: string[] = []
) =>
  verifyClaims({
    startFen: START,
    line: [...sans.slice(0, plies), ...extra],
    claims: [claim],
  }).verdicts[0];

describe("pins", () => {
  it("Opera Game, 9.Bg5: the bishop pins the knight on f6 to the queen on e7", () => {
    const v = at(opera, 17, {
      kind: "pin",
      pinned: "f6",
      pinnedPiece: "n",
      behind: "e7",
      behindPiece: "q",
      pinner: "g5",
      atPly: 17,
    });
    expect(v.status).toBe("verified");
    expect(v.reason).toBe(
      "the bishop on g5 pins the knight on f6 to the queen on e7"
    );
  });

  it("Opera Game, 11...Nbd7: the knight is pinned to the king, found without squares", () => {
    const v = at(opera, 22, {
      kind: "pin",
      pinnedPiece: "n",
      behindPiece: "k",
      atPly: 22,
    });
    expect(v.status).toBe("verified");
    expect(v.reason).toContain("pins the knight on d7 to the king on e8");
  });

  it("a king is never pinned: 'the queen on h7 pins the king on g7' is false", () => {
    const v = at(gameB, 29, {
      kind: "pin",
      pinned: "g7",
      pinnedPiece: "k",
      behind: "f7",
      behindPiece: "p",
      atPly: 29,
    });
    expect(v.status).toBe("false");
    expect(v.reason).toMatch(/a king cannot be pinned/);
  });

  it("a pin that binds nothing is no pin: queen, pawn and rook on one file", () => {
    const v = verifyClaims({
      startFen: "5rk1/p4p1p/6p1/2r5/5Q2/2P1P1K1/PP1Pq3/R1B4R b - - 9 23",
      line: [],
      claims: [
        {
          kind: "pin",
          pinned: "f7",
          pinnedPiece: "p",
          behind: "f8",
          behindPiece: "r",
          atPly: 0,
        },
      ],
    }).verdicts[0];
    expect(v.status).toBe("false");
  });

  it("the wrong piece behind is false, and says what is there", () => {
    const v = at(opera, 17, {
      kind: "pin",
      pinned: "f6",
      behind: "e7",
      behindPiece: "k",
      atPly: 17,
    });
    expect(v.status).toBe("false");
    expect(v.reason).toBe("the piece on e7 is a queen");
  });
});

describe("forced moves", () => {
  it("after 15.Qh7+ the only legal reply is Kf6 (true)", () => {
    expect(at(gameB, 29, { kind: "only_reply", atPly: 29 }).status).toBe(
      "verified"
    );
  });

  it("after 15.Nxe6+ the king is not forced to f6: Black has four replies", () => {
    const v = at(
      gameB,
      28,
      { kind: "only_square", atPly: 29, square: "f6", whole: true },
      ["Nxe6+"]
    );
    expect(v.status).toBe("false");
    expect(v.reason).toBe("Black has 4 legal moves: Bxe6, fxe6, Kg8, Kf6");
  });

  it("after 21.g4+ e4 is the king's only legal square (true)", () => {
    expect(
      at(
        gameB,
        40,
        { kind: "only_square", atPly: 41, square: "e4", whole: false },
        ["g4+"]
      ).status
    ).toBe("verified");
  });
});

// ── The gate, on the live run's own sentences ──────────────────────────────
let contract: CoachContract;
const card = (prefix: string): InsightContract =>
  contract.insights.find((i) => i.factIdPrefix === prefix)!;
const sentence = (prose: string, prefix: string) =>
  checkCardClaims(prose, card(prefix), { log: false }).sentences[0];

beforeAll(async () => {
  __setFetchForTesting(async () => {
    throw new Error("network disabled");
  });
  const moments = selectFlaggedMoments(positionEvals("gameB", 16), {
    playerColor: "w",
  });
  const deep = positionEvals("gameB", 20);
  const positions: GameEvalRecheck["positions"] = {};
  for (const idx of positionsToRecheck(moments))
    positions[String(idx)] = { lines: deep[idx].lines };
  contract = await buildCoachContract({
    moveHistory: gameB,
    gameEval: {
      positions: positionEvals("gameB", 16),
      settings: { engine: "stockfish_17_lite", depth: 16, multiPv: 3 },
      recheck: {
        engine: "stockfish_17_lite",
        depth: 20,
        positions,
        skipped: [],
        moments: moments.map((m) => m.move),
        budgetMs: 15_000,
        elapsedMs: 9_000,
      },
    } as never,
    playerColor: "w",
  });
}, 120_000);

afterAll(() => {
  __resetFetchForTesting();
});

describe("the gate on the live 15.Qh7+ card", () => {
  it("is the card the live run wrote about", () => {
    expect(card("M1").playedSan).toBe("Qh7+");
    expect(card("M1").lines[0].story?.plies.map((p) => p.san)).toEqual([
      "Nxe6+",
      "Kf6",
      "Qg5+",
      "Kxe6",
      "Bf5#",
    ]);
  });

  it("drops 'after the king is forced to f6': after 15.Nxe6+ Black had four replies", () => {
    const s = sentence(
      "Solution: 15. Nxe6+ forks the king on g7 and the rook on f8, and after the king is forced to f6 it walks into a second fork from the queen on g5, hitting both the king and the knight on e5.",
      "M1"
    );
    const forced = s.claims.find((c) => c.claim.kind === "only_square")!;
    expect(forced.verdict.status).toBe("false");
    expect(s.action).toBe("drop");
  });

  it("drops 'the queen on h7 pins the king on g7'", () => {
    const s = sentence(
      "- The queen on h7 pins the king on g7 to the pawn on f7 along the seventh rank.",
      "M1"
    );
    expect(s.claims.find((c) => c.claim.kind === "pin")?.verdict.status).toBe(
      "false"
    );
    expect(s.action).toBe("drop");
  });

  it("keeps '15. Qh7+ … forcing the only legal reply', which is true", () => {
    const s = sentence(
      "Idea: You wanted to keep hunting the king with checks, and 15. Qh7+ does exactly that, forcing the only legal reply.",
      "M1"
    );
    expect(
      s.claims.find((c) => c.claim.kind === "only_reply")?.verdict.status
    ).toBe("verified");
    expect(s.action).toBe("keep");
  });
});

describe("the gate on the live 21.Re1 card", () => {
  it("keeps '21. g4+ drives the king to e4 — the only legal square', which is true", () => {
    const s = sentence(
      "Solution: 21. g4+ drives the king to e4 — the only legal square — and keeps the hunt going.",
      "M5"
    );
    expect(
      s.claims.find((c) => c.claim.kind === "only_square")?.verdict.status
    ).toBe("verified");
    expect(s.action).toBe("keep");
  });

  it("an unreadable 'is pinned' with no such pin on the board is dropped", () => {
    const s = sentence("The rook on e1 is pinned to the king.", "M5");
    expect(s.claims.find((c) => c.claim.kind === "pin")?.verdict.status).toBe(
      "false"
    );
    expect(s.action).toBe("drop");
  });
});
