/**
 * CI-5 FOLLOW-UP — the trapped-piece false alarm, pinned in BOTH directions.
 *
 * The CI-5 gate run (scripts/eval/results/contract-ci5-gates-2026-08-11.json)
 * failed its false-intervention bar at 2/10, and both false fires carried the
 * same span:
 *
 *   {"fixture":"05_long_game_six_mistakes","sample":0,"factIdPrefix":"M1",
 *    "check":"tactical_keyword","span":"trapped",
 *    "adjudication":"licensed-elsewhere-in-contract","isFalse":true}
 *   {"fixture":"05_long_game_six_mistakes","sample":2,"factIdPrefix":"M1", …}
 *
 * "trapped" is in fixture 05's contract-GLOBAL keyword pool (insight M2, move
 * 31, carries it) but NOT in M1's own `allowedTacticalKeywords` — the
 * detector-recall gap of plan §9 risk 2. The two structural reasons the
 * detectors under-recall are documented on `isImmobilized` in
 * refereeChecks.ts; the fix is a board-truth license computed from
 * `countSafeMoves`, the arithmetic the mobility check already runs.
 *
 * DIRECTION 1 (the fix) — a piece with legal moves but ZERO safe moves may be
 * called "trapped" even when no detector licensed the keyword.
 *
 * DIRECTION 2 (the true catches, which must keep firing) — the fix is scoped
 * to the word "trapped" and to pieces the board agrees are boxed in. It does
 * NOT touch:
 *   · "no legal moves" claims when legal moves exist (mobility_claims,
 *     LITERAL family — the OTHER CI-5 fire on this very insight, verified
 *     TRUE: the a7 knight has 3 legal moves);
 *   · bare-integer mobility counts the board contradicts (fixture 01/I1's
 *     thrice-fired "15 legal moves", actual 7);
 *   · "trapped" on a piece that HAS a safe square — including 05/M1's own a7
 *     knight, whose Nb5 retreat is defended by the a4 pawn.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

vi.hoisted(() => {
  delete process.env.LC0_API_URL;
  delete process.env.MAIA_API_URL;
});

import { Chess } from "chess.js";
import { buildCoachContract } from "@/lib/contract/builder";
import { getFenAtHalfMove } from "@/lib/contract/chessFormat";
import {
  checkMobilityLiteralClaims,
  checkTacticalKeywords,
  runInsightChecks,
} from "@/lib/contract/refereeChecks";
import { countSafeMoves } from "@/lib/tactics/motifs/trapped_piece";
import type { CoachContract, InsightContract } from "@/lib/contract/types";
import type { GameEvalInput, GameHeadersInput } from "@/lib/contract/gameEvalSchema";
import {
  __setFetchForTesting,
  __resetFetchForTesting,
  __clearChessdbCache,
} from "@/lib/grounding/chessdb";
import { makeInsight } from "./insightFactory";

interface FixtureFile {
  moveHistory: string[];
  gameEval: GameEvalInput;
  playerColor: string;
  username?: string;
  userRating?: number;
  gameHeaders?: GameHeadersInput;
}

const FIXTURES_DIR = path.join(__dirname, "fixtures");

/** 05/M1 — 36. Na7, the insight both CI-5 false fires landed on. */
const M1_FEN_BEFORE = "B6r/1bn1k3/3p2p1/pN4Pq/PPpbp2P/2P1P3/2KB4/R3R3 w - - 1 36";
const M1_FEN_AFTER = "B6r/Nbn1k3/3p2p1/p5Pq/PPpbp2P/2P1P3/2KB4/R3R3 b - - 2 36";

/**
 * The SAME position with White's a4 pawn deleted. That pawn is the single
 * reason the a7 knight is not trapped: it defends b5, so `flightIsCovered`
 * clears the Nb5 retreat. Remove it and Nc8+/Nc6+/Nb5 are all covered — a
 * knight with 3 legal moves and 0 safe ones, which is precisely the shape the
 * CI-5 adjudication believed it was looking at.
 */
const TRAPPED_FEN_AFTER = "B6r/Nbn1k3/3p2p1/p5Pq/1Ppbp2P/2P1P3/2KB4/R3R3 b - - 2 36";
const TRAPPED_FEN_BEFORE = "B6r/1bn1k3/3p2p1/pN4Pq/1Ppbp2P/2P1P3/2KB4/R3R3 w - - 1 36";

/** Turn-flip helper mirroring the referee's own (mobilityCount/safeMobilityCount). */
function safeMovesForWhite(fen: string, square: string): number | null {
  const parts = fen.split(" ");
  parts[1] = "w";
  parts[3] = "-";
  return countSafeMoves(new Chess(parts.join(" ")), square as never);
}

let contract: CoachContract;
let m1: InsightContract;

beforeAll(async () => {
  __setFetchForTesting(async () => {
    throw new Error("network disabled in CI-5 trapped-license tests");
  });
  __clearChessdbCache();
  const f = JSON.parse(
    fs.readFileSync(path.join(FIXTURES_DIR, "05_long_game_six_mistakes.json"), "utf8"),
  ) as FixtureFile;
  const requestFen = getFenAtHalfMove(f.moveHistory, f.moveHistory.length);
  contract = await buildCoachContract({
    moveHistory: f.moveHistory,
    gameEval: f.gameEval,
    playerColor: f.playerColor,
    username: f.username,
    userRating: f.userRating,
    gameHeaders: f.gameHeaders,
    uid: "ci5-trapped-license",
    identity: { fen: requestFen, playerColor: f.playerColor || "w" },
  });
  m1 = contract.insights.find((i) => i.factIdPrefix === "M1")!;
}, 120_000);

afterAll(() => {
  __resetFetchForTesting();
});

// ════════════════════════════════════════════════════════════════════════════
// The board facts every assertion below rests on.
// ════════════════════════════════════════════════════════════════════════════
describe("board facts (chess.js only — no judgement)", () => {
  it("05/M1 is 36. Na7 and its own keyword pool never contained 'trapped'", () => {
    expect(m1.playedSan).toBe("Na7");
    expect(m1.fenBefore).toBe(M1_FEN_BEFORE);
    expect(m1.fenAfter).toBe(M1_FEN_AFTER);
    expect(m1.allowedTacticalKeywords.map((k) => k.toLowerCase())).not.toContain("trapped");
  });

  it("'trapped' IS in the contract-global pool (M2) — which is why the adjudicator called the fires false", () => {
    const global = new Set(
      contract.insights.flatMap((i) => i.allowedTacticalKeywords.map((k) => k.toLowerCase())),
    );
    expect(global.has("trapped")).toBe(true);
  });

  it("the a7 knight has 3 legal moves and 1 SAFE move (Nb5, defended by the a4 pawn)", () => {
    const parts = M1_FEN_AFTER.split(" ");
    parts[1] = "w";
    parts[3] = "-";
    const g = new Chess(parts.join(" "));
    expect(g.moves({ square: "a7" }).sort()).toEqual(["Nb5", "Nc6+", "Nc8+"]);
    expect(safeMovesForWhite(M1_FEN_AFTER, "a7")).toBe(1);
  });

  it("delete that a4 pawn and the same knight has 3 legal moves and 0 safe ones", () => {
    const parts = TRAPPED_FEN_AFTER.split(" ");
    parts[1] = "w";
    parts[3] = "-";
    const g = new Chess(parts.join(" "));
    expect(g.moves({ square: "a7" }).sort()).toEqual(["Nb5", "Nc6+", "Nc8+"]);
    expect(safeMovesForWhite(TRAPPED_FEN_AFTER, "a7")).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// DIRECTION 1 — the false alarm is gone
// ════════════════════════════════════════════════════════════════════════════
describe("FIX — zero-safe-move pieces may be called 'trapped' without a detector license", () => {
  /** An insight with NO motifs and NO trapped keyword: the license can only
   * come from the board. */
  const unlicensed = (fenBefore: string, fenAfter: string) =>
    makeInsight({
      factIdPrefix: "M1",
      playedSan: "Na7",
      bestSan: "Bc1",
      fenBefore,
      fenAfter,
      motifs: [],
      motifLicense: [],
      allowedTacticalKeywords: [],
      lines: [],
      threats: [],
    });

  const SENTENCE = "The knight on a7 is trapped — every escape square is covered.";

  it("does NOT fire when the named piece has zero safe moves", () => {
    const fires = checkTacticalKeywords(
      SENTENCE,
      unlicensed(TRAPPED_FEN_BEFORE, TRAPPED_FEN_AFTER),
    );
    expect(fires.map((v) => v.span.toLowerCase())).not.toContain("trapped");
  });

  it("STILL fires on the identical sentence when the piece has a safe square", () => {
    const fires = checkTacticalKeywords(SENTENCE, unlicensed(M1_FEN_BEFORE, M1_FEN_AFTER));
    expect(fires.map((v) => v.span.toLowerCase())).toContain("trapped");
  });

  it("the license is board-anchored, not phrasing-anchored: an unresolvable piece still fires", () => {
    const fires = checkTacticalKeywords(
      "Your position on a7 leaves that piece trapped.",
      unlicensed(TRAPPED_FEN_BEFORE, TRAPPED_FEN_AFTER),
    );
    expect(fires.map((v) => v.span.toLowerCase())).toContain("trapped");
  });

  it("a claim anchored to an unscoreable future ply still fires", () => {
    const fires = checkTacticalKeywords(
      "The knight on a7 is trapped by move 44.",
      unlicensed(TRAPPED_FEN_BEFORE, TRAPPED_FEN_AFTER),
    );
    expect(fires.map((v) => v.span.toLowerCase())).toContain("trapped");
  });

  it("the license is scoped to the trapped class — 'fork' is untouched by it", () => {
    const fires = checkTacticalKeywords(
      "The knight on a7 sets up a fork.",
      unlicensed(TRAPPED_FEN_BEFORE, TRAPPED_FEN_AFTER),
    );
    expect(fires.map((v) => v.span.toLowerCase())).toContain("fork");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// DIRECTION 2 — every CI-5 TRUE catch keeps firing
// ════════════════════════════════════════════════════════════════════════════
describe("TRUE catches preserved (the other 8 CI-5 fires)", () => {
  /**
   * CI-5 fire 05/s0/M1, check `mobility_claims`, span "no legal moves",
   * position-verified TRUE (the a7 knight has 3). The ladder deleted the
   * carrier sentence, so only the span survives in the artifact; the sentence
   * here is the register the run produced (cf. the verbatim v3 spans in
   * refereeFollowups.test.ts) and exists only to carry the span.
   */
  it("'no legal moves' on the a7 knight still fires — 3 legal moves", () => {
    const fires = checkMobilityLiteralClaims(
      "Problem: The knight on a7 is trapped with no legal moves.",
      m1,
    );
    expect(fires).toHaveLength(1);
    expect(fires[0].category).toBe("mobility_count_wrong");
    expect(fires[0].span.toLowerCase()).toBe("no legal moves");
  });

  it("'trapped' on the a7 knight still fires — the board gives it a safe retreat", () => {
    const fires = checkTacticalKeywords("Problem: The knight on a7 is trapped.", m1, contract);
    expect(fires.map((v) => v.span.toLowerCase())).toContain("trapped");
  });

  it("both fire together on the one sentence the ladder actually dropped", () => {
    const fires = runInsightChecks(
      "Problem: The knight on a7 is trapped with no legal moves.",
      m1,
      contract,
    );
    expect(fires.filter((v) => v.check === "tactical_keyword").map((v) => v.span.toLowerCase()))
      .toContain("trapped");
    expect(fires.filter((v) => v.check === "mobility_claims").map((v) => v.span.toLowerCase()))
      .toContain("no legal moves");
  });

  it("fixture 01/I1's '15 legal moves' bare-integer catch is untouched", async () => {
    __clearChessdbCache();
    const f = JSON.parse(
      fs.readFileSync(path.join(FIXTURES_DIR, "01_mate_for_white_midgame.json"), "utf8"),
    ) as FixtureFile;
    const requestFen = getFenAtHalfMove(f.moveHistory, f.moveHistory.length);
    const c = await buildCoachContract({
      moveHistory: f.moveHistory,
      gameEval: f.gameEval,
      playerColor: f.playerColor,
      username: f.username,
      userRating: f.userRating,
      gameHeaders: f.gameHeaders,
      uid: "ci5-trapped-license-01",
      identity: { fen: requestFen, playerColor: f.playerColor || "w" },
    });
    const i1 = c.insights.find((i) => i.factIdPrefix === "M1")!;
    const fires = checkMobilityLiteralClaims(
      "The queen on f3 controls 15 legal moves from there.",
      i1,
    );
    expect(fires.map((v) => v.span.toLowerCase())).toContain("15 legal moves");
  }, 120_000);
});
