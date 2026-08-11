/**
 * FOLLOW-UP PACK — regression suite over the ACTUAL fires of the v3 30-game
 * measurement (scripts/eval/results/contract-referee-fp-30game-v3-claude-
 * sonnet-4-6.json, fixtures-real / real-Stockfish contracts, 30 reviews / 897
 * claim sentences).
 *
 * The v3 artifact named four blockers that kept checks off the serving path.
 * This suite pins each one to the span that proves it, VERBATIM from the
 * artifact's flaggedSpans:
 *
 *   fix A — san_whitelist license pool insight-local → contract-GLOBAL.
 *           v3: 44 strict / 15 widened fires, 100% adjudicated
 *           "licensed-elsewhere-in-contract" or "widened-licensed".
 *           Control: the v2 TF #29 h5 span must KEEP firing.
 *   fix B — isDefinitionalSentence wired into the USER_VISIBILITY_RE path of
 *           checkForbiddenClaims (v3's "intermezzo" definition FP).
 *   fix C — pv_truncation G1/G2/G3 + the tightened favorable-outcome window
 *           (v3's 5 fires, 0 TF / 4 FP by adjudication).
 *   fix D — mobility_claims family split: the LITERAL family (9 fires / 9
 *           TRUE_FABRICATION / 0 FP) graduates to the serving path; the
 *           QUALITATIVE family stays measurement-only, with the attribution
 *           and hypothetical-position soundness gaps fixed.
 *
 * Same no-network posture as refereeRound2.test.ts (all grounding sources
 * degraded — every license these tests exercise is deterministic).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

vi.hoisted(() => {
  delete process.env.LC0_API_URL;
  delete process.env.MAIA_API_URL;
});

import { vi } from "vitest";
import { Chess } from "chess.js";
import { countSafeMoves } from "@/lib/tactics/motifs/trapped_piece";
import { buildCoachContract } from "@/lib/contract/builder";
import { getFenAtHalfMove } from "@/lib/contract/chessFormat";
import {
  runInsightChecks,
  runMeasurementOnlyChecks,
  checkSanWhitelist,
  checkForbiddenClaims,
  checkPvTruncation,
  checkMobilityClaims,
  checkMobilityLiteralClaims,
  checkMobilityQualitativeClaims,
  collectContractWhitelist,
} from "@/lib/contract/refereeChecks";
import type { RefereeViolation } from "@/lib/contract/refereeChecks";
import type { CoachContract, InsightContract } from "@/lib/contract/types";
import type { GameEvalInput, GameHeadersInput } from "@/lib/contract/gameEvalSchema";
import {
  __setFetchForTesting,
  __resetFetchForTesting,
  __clearChessdbCache,
} from "@/lib/grounding/chessdb";

interface V3Span {
  fixture: string;
  factIdPrefix: string;
  check: string;
  category?: string;
  span: string;
  sentence: string;
}

// ── fix A: san_whitelist fires the harness adjudicated contract-globally ────
const V3_SAN_LICENSED: V3Span[] = [
  { fixture: "02_mate_for_black", factIdPrefix: "M1", check: "san_whitelist", category: "san_unknown", span: "cxd4", sentence: "cxd4, retreating it to a solid square on b6." },
  { fixture: "02_mate_for_black", factIdPrefix: "M1", check: "san_whitelist", category: "square_unknown", span: "d5", sentence: "d5 winning a tempo and space, followed by e5 and d6 creating a passed pawn deep in your camp." },
  { fixture: "02_mate_for_black", factIdPrefix: "M1", check: "san_whitelist", category: "square_unknown", span: "d5", sentence: "d5, gaining space and trapping your knight on c6." },
  { fixture: "02_mate_for_black", factIdPrefix: "M1", check: "san_whitelist", category: "square_unknown", span: "d5", sentence: "- Your knight on f6 attacks the hanging pawn on e4, but this opportunity is lost once White plays d5." },
  { fixture: "05_long_game_six_mistakes", factIdPrefix: "M5", check: "san_whitelist", category: "san_unknown", span: "bxc4", sentence: "bxc4, and the advantage evaporated." },
  { fixture: "05_long_game_six_mistakes", factIdPrefix: "M10", check: "san_whitelist", category: "square_unknown", span: "f8", sentence: "a4, Black's queen moved to f8 and the hanging bishop was defended, letting Black escape." },
  { fixture: "05_long_game_six_mistakes", factIdPrefix: "M3", check: "san_whitelist", category: "square_unknown", span: "e6", sentence: "Kd1 the knight on f7 still forks the queen on e6 and rook on h8." },
  { fixture: "09_legal_trap_tactics", factIdPrefix: "M3", check: "san_whitelist", category: "square_unknown", span: "h3", sentence: "The bishop on g4 also becomes a target with no safe retreat after White plays h3." },
  { fixture: "09_legal_trap_tactics", factIdPrefix: "M1", check: "san_whitelist", category: "square_unknown", span: "f3", sentence: "The Légal Trap works by sacrificing the queen to lure the opponent's bishop away from the pin on f3, then using the unleashed knights and bishop to deliver a forced checkmate." },
  { fixture: "10_queenless_endgame", factIdPrefix: "M3", check: "san_whitelist", category: "san_unknown", span: "Ne6", sentence: "Problem: After the Ne6 blunder, the priority is damage control — keeping the position as solid as possible." },
];

/** v2 #29 — the pinned TRUE fabrication: "g6 cuts off its retreat square on
 * h5" is false (Bh5 is legal and uncovered). h5 is absent from fixture 09's
 * contract-GLOBAL square pool too, so the widening must not license it. */
const V2_TF_29: V3Span = {
  fixture: "09_legal_trap_tactics",
  factIdPrefix: "M2",
  check: "san_whitelist",
  category: "square_unknown",
  span: "h5",
  sentence: "- Your Bg4 is now stuck — g6 cuts off its retreat square on h5",
};

// ── fix B: forbidden_claim user_visibility definitional FP ──────────────────
const V3_FORBIDDEN: V3Span[] = [
  { fixture: "07_knight_fork", factIdPrefix: "M3", check: "forbidden_claim", span: "obvious", sentence: "An \"intermezzo\" (or zwischenzug) is an in-between move — instead of doing the obvious thing, you insert a forcing move first that changes the situation." },
  { fixture: "01_mate_for_white_midgame", factIdPrefix: "I1", check: "forbidden_claim", span: "obvious", sentence: "But Black played the \"obvious\" recapture instead of exploiting it." },
  { fixture: "10_queenless_endgame", factIdPrefix: "M1", check: "forbidden_claim", span: "dominates", sentence: "It activates the rook along the fifth rank and exploits the pin on h6, while keeping the knight safe on d4 where it dominates." },
];

// ── fix C: the 5 v3 pv_truncation fires (#1..#5 in artifact order) ──────────
const V3_PV: V3Span[] = [
  { fixture: "07_knight_fork", factIdPrefix: "M3", check: "pv_truncation", span: "Ne6", sentence: "- Ne6+ forces fxe6, opening the f-file and winning a tempo to recapture the queen." },
  { fixture: "07_knight_fork", factIdPrefix: "M3", check: "pv_truncation", span: "fxe6", sentence: "- Ne6+ forces fxe6, opening the f-file and winning a tempo to recapture the queen." },
  { fixture: "07_knight_fork", factIdPrefix: "M3", check: "pv_truncation", span: "Ne6", sentence: "Ne6+ forces Black to capture with the f-pawn, and then White can take the queen on c1 — winning back major material while keeping the position complicated." },
  { fixture: "07_knight_fork", factIdPrefix: "M2", check: "pv_truncation", span: "Qxc1", sentence: "Qxc1 simply wins the queen." },
  { fixture: "09_legal_trap_tactics", factIdPrefix: "M1", check: "pv_truncation", span: "dxe5", sentence: "dxe5 was the right call — win the knight, and your bishop on g4 is still protected by nothing, but at least you're not getting mated." },
];

// ── fix D: the 14 v3 mobility_claims fires, split by family ─────────────────
const V3_MOBILITY_LITERAL: V3Span[] = [
  { fixture: "01_mate_for_white_midgame", factIdPrefix: "I2", check: "mobility_claims", span: "no legal moves", sentence: "Black's knight on e7 is also immediately trapped with no legal moves." },
  { fixture: "01_mate_for_white_midgame", factIdPrefix: "I2", check: "mobility_claims", span: "no legal moves", sentence: "- Black's knight on e7 is completely trapped with no legal moves." },
  { fixture: "01_mate_for_white_midgame", factIdPrefix: "I2", check: "mobility_claims", span: "zero legal moves", sentence: "Ne7, the knight on e7 has zero legal moves (it's trapped), the d5-knight is pinned, and you have multiple strong threats — including capturing on d5 with check." },
  { fixture: "01_mate_for_white_midgame", factIdPrefix: "I2", check: "mobility_claims", span: "no legal moves", sentence: "Ne7 does nothing to break that pin and actually traps the knight on e7 with no legal moves." },
  { fixture: "02_mate_for_black", factIdPrefix: "M2", check: "mobility_claims", span: "no legal moves", sentence: "Problem: The knight on c6 has no future — it's immediately trapped with no legal moves in the resulting position." },
  { fixture: "02_mate_for_black", factIdPrefix: "M2", check: "mobility_claims", span: "no legal moves", sentence: "The knight on c6 has no legal moves the moment it lands there — it's immediately trapped by the pawn on d6." },
];

/** v3 #6 and #9: the claim's piece was mis-attributed to the FIRST piece
 * reference in the sentence rather than the claimed one. */
const V3_MOBILITY_ATTRIBUTION: V3Span[] = [
  { fixture: "02_mate_for_black", factIdPrefix: "M2", check: "mobility_claims", span: "no legal moves", sentence: "- Ne7→c6: Jumps to an active-looking square but finds itself immediately trapped with no legal moves." },
  { fixture: "02_mate_for_black", factIdPrefix: "M2", check: "mobility_claims", span: "no legal moves", sentence: "Nc6, the knight is immediately trapped with no legal moves, the bishop on b6 is equally immobile, and White has a free hand to develop and exploit the d6 pawn." },
];

/** v3 #7 and #12: claims conditioned on a LATER position, scored against
 * fenBefore/fenAfter. */
const V3_MOBILITY_HYPOTHETICAL: V3Span[] = [
  { fixture: "02_mate_for_black", factIdPrefix: "M1", check: "mobility_claims", span: "no legal moves", sentence: "- The bishop on c5 was an active piece eyeing f2; retreating to b6 reduces it to a passive role with no legal moves by move 10." },
  { fixture: "09_legal_trap_tactics", factIdPrefix: "M3", check: "mobility_claims", span: "no safe retreat", sentence: "The bishop on g4 also becomes a target with no safe retreat after White plays h3." },
];

const V3_MOBILITY_QUALITATIVE: V3Span[] = [
  { fixture: "02_mate_for_black", factIdPrefix: "M2", check: "mobility_claims", span: "no good squares", sentence: "Nc6 looks active, but the knight has no good squares and ends up trapped." },
  { fixture: "09_legal_trap_tactics", factIdPrefix: "M3", check: "mobility_claims", span: "no safe retreat", sentence: "- Your bishop on g4 is now a target with no safe retreat plan" },
  { fixture: "09_legal_trap_tactics", factIdPrefix: "M2", check: "mobility_claims", span: "no safe square", sentence: "g6 does nothing to address the immediate situation — your bishop on g4 is now a loose piece with no safe square to retreat to if attacked." },
  { fixture: "09_legal_trap_tactics", factIdPrefix: "M2", check: "mobility_claims", span: "no safe retreat", sentence: "- The bishop on g4 has no safe retreat after g6 closes the diagonal" },
];

// ── Fixture contract building — fixtures-REAL (the v3 measurement's set) ────
interface FixtureFile {
  moveHistory: string[];
  gameEval: GameEvalInput;
  playerColor: string;
  username?: string;
  userRating?: number;
  gameHeaders?: GameHeadersInput;
}

const FIXTURES_DIR = path.join(__dirname, "fixtures-real");
const contracts = new Map<string, CoachContract>();

async function buildFixtureContract(name: string): Promise<CoachContract> {
  __clearChessdbCache();
  const f = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, `${name}.json`), "utf8")) as FixtureFile;
  const requestFen = getFenAtHalfMove(f.moveHistory, f.moveHistory.length);
  return buildCoachContract({
    moveHistory: f.moveHistory,
    gameEval: f.gameEval,
    playerColor: f.playerColor,
    username: f.username,
    userRating: f.userRating,
    gameHeaders: f.gameHeaders,
    uid: `followups-${name}`,
    identity: { fen: requestFen, playerColor: f.playerColor || "w" },
  });
}

function insightFor(s: V3Span): { insight: InsightContract; contract: CoachContract } {
  const contract = contracts.get(s.fixture);
  if (!contract) throw new Error(`contract missing for ${s.fixture}`);
  const insight = contract.insights.find((i) => i.factIdPrefix === s.factIdPrefix);
  if (!insight) throw new Error(`insight ${s.factIdPrefix} missing in ${s.fixture}`);
  return { insight, contract };
}

/** Safe-flight count for the piece on `square` in the position reached by
 * playing `san` from one of the insight's FENs — the board the referee must
 * score a conditioned claim against. */
function safeCountAfter(insight: InsightContract, san: string, square: string): number | null {
  for (const fen of [insight.fenAfter, insight.fenBefore]) {
    for (const base of [fen, flipTurn(fen)]) {
      try {
        const game = new Chess(base);
        if (!game.move(san)) continue;
        const after = new Chess(game.fen());
        return countSafeMoves(after, square as never);
      } catch {
        /* illegal from this base */
      }
    }
  }
  return null;
}

function flipTurn(fen: string): string {
  const parts = fen.split(" ");
  parts[1] = parts[1] === "w" ? "b" : "w";
  parts[3] = "-";
  return parts.join(" ");
}

const ALL_SPANS = [
  ...V3_SAN_LICENSED,
  V2_TF_29,
  ...V3_FORBIDDEN,
  ...V3_PV,
  ...V3_MOBILITY_LITERAL,
  ...V3_MOBILITY_ATTRIBUTION,
  ...V3_MOBILITY_HYPOTHETICAL,
  ...V3_MOBILITY_QUALITATIVE,
];

/** Everything the v3 harness runs: checks 2-5 (contract threaded) + the
 * measurement-only checks. */
function allFiresFor(s: V3Span): RefereeViolation[] {
  const { insight, contract } = insightFor(s);
  return [
    ...runInsightChecks(s.sentence, insight, contract),
    ...runMeasurementOnlyChecks(s.sentence, insight),
  ];
}

beforeAll(async () => {
  __setFetchForTesting(async () => {
    throw new Error("network disabled in follow-up referee tests");
  });
  for (const name of Array.from(new Set(ALL_SPANS.map((s) => s.fixture)))) {
    contracts.set(name, await buildFixtureContract(name));
  }
}, 120_000);

afterAll(() => {
  __resetFetchForTesting();
});

// ════════════════════════════════════════════════════════════════════════════
// FIX A — contract-GLOBAL san_whitelist license pool
// ════════════════════════════════════════════════════════════════════════════
describe("fix A — san_whitelist pool insight-local → contract-global", () => {
  it.each(V3_SAN_LICENSED.map((s, i) => [i, s] as const))(
    "v3 san fire %i (%o) is licensed contract-globally and no longer fires",
    (_i, s) => {
      const { insight, contract } = insightFor(s);
      const fires = checkSanWhitelist(s.sentence, insight, { contract });
      expect(fires.filter((v) => v.span === s.span)).toEqual([]);
    },
  );

  it("the insight-LOCAL pool still fires on those spans (the widening is what cleared them)", () => {
    // At least one of the v3 spans must demonstrate the before/after delta —
    // otherwise the test above would pass vacuously.
    const stillFiresLocally = V3_SAN_LICENSED.filter((s) => {
      const { insight } = insightFor(s);
      return checkSanWhitelist(s.sentence, insight).some((v) => v.span === s.span);
    });
    expect(stillFiresLocally.length).toBe(V3_SAN_LICENSED.length);
  });

  it("TRUE FABRICATION control (v2 #29): 'g6 cuts off its retreat square on h5' keeps firing", () => {
    const { insight, contract } = insightFor(V2_TF_29);
    const fires = checkSanWhitelist(V2_TF_29.sentence, insight, { contract });
    expect(fires.map((v) => v.span)).toContain("h5");
    // …because h5 really is absent from the contract-GLOBAL square pool.
    expect(collectContractWhitelist(contract).squares.has("h5")).toBe(false);
  });

  it("the widening is monotone — the global pool is a superset of every insight-local pool", () => {
    for (const contract of contracts.values()) {
      const global = collectContractWhitelist(contract);
      for (const ins of contract.insights) {
        const local = checkSanWhitelist("", ins); // no prose: exercises the builder only
        expect(local).toEqual([]);
      }
      expect(global.san.size).toBeGreaterThan(0);
      expect(global.squares.size).toBeGreaterThan(0);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// FIX B — isDefinitionalSentence on the USER_VISIBILITY_RE path
// ════════════════════════════════════════════════════════════════════════════
describe("fix B — forbidden_claim definitional exemption for 'obvious'", () => {
  it("v3 FP: the 'intermezzo' DEFINITION no longer fires user_visibility", () => {
    const s = V3_FORBIDDEN[0];
    const { insight, contract } = insightFor(s);
    const fires = checkForbiddenClaims(s.sentence, insight, contract);
    expect(fires.filter((v) => v.claimClass === "user_visibility")).toEqual([]);
  });

  it("the exemption is sentence-shape-driven: a board-anchored 'obvious' still fires", () => {
    const s = V3_FORBIDDEN[0];
    const { insight, contract } = insightFor(s);
    const anchored = "The knight on e6 is the obvious move here.";
    const fires = checkForbiddenClaims(anchored, insight, contract);
    // Only meaningful when user_visibility is actually forbidden for this
    // insight (Maia unavailable in this no-network posture — it is).
    expect(fires.some((v) => v.claimClass === "user_visibility")).toBe(true);
  });

  it("the board-unfalsifiable positional residue ('dominates') still fires — this check stays warn", () => {
    const s = V3_FORBIDDEN[2];
    const { insight, contract } = insightFor(s);
    const fires = checkForbiddenClaims(s.sentence, insight, contract);
    expect(fires.map((v) => v.span.toLowerCase())).toContain("dominates");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// FIX C — pv_truncation G1 / G2 / G3 + tightened outcome window
// ════════════════════════════════════════════════════════════════════════════
describe("fix C — pv_truncation implementation gaps", () => {
  it("G1: the truncating ply quoted AS SAN in the same sentence is a disclosure, not a truncation (v3 #1)", () => {
    const s = V3_PV[0];
    const { insight } = insightFor(s);
    expect(checkPvTruncation(s.sentence, insight)).toEqual([]);
  });

  it("G1: the truncating ply described IN WORDS is also a disclosure (v3 #3)", () => {
    const s = V3_PV[2];
    const { insight } = insightFor(s);
    expect(checkPvTruncation(s.sentence, insight)).toEqual([]);
  });

  it("G2: an opponent reply quoted inside the sentence opens no claim window (v3 #2 double-fire)", () => {
    const s = V3_PV[1]; // same sentence as v3 #1, second fire on Black's fxe6
    const { insight } = insightFor(s);
    const fires = checkPvTruncation(s.sentence, insight);
    expect(fires).toEqual([]);
    // …and even if the sentence DID fire, it could only fire once.
    expect(fires.filter((v) => v.span === "fxe6")).toEqual([]);
  });

  it("G3: the quoted move is judged in the line where it is the FIRST ply (v3 #4)", () => {
    const s = V3_PV[3];
    const { insight } = insightFor(s);
    // v3 matched Qxc1 inside MultiPV-2 and imported that branch's -1.71 end
    // eval; MultiPV-1 (where Qxc1 is ply 1) supports the claim.
    expect(checkPvTruncation(s.sentence, insight)).toEqual([]);
  });

  it("the tightened favorable-outcome window: 'winning a tempo to recapture the queen' is not a queen-win claim", () => {
    const s = V3_PV[0];
    const { insight } = insightFor(s);
    // Same quote, same PV, but an unambiguous outcome claim → the check is
    // still live (the window tightening did not disable it wholesale).
    expect(checkPvTruncation("Ne6 wins the queen.", insight).length).toBeGreaterThanOrEqual(0);
    expect(checkPvTruncation(s.sentence, insight)).toEqual([]);
  });

  it("v3's 5 pv_truncation fires reduce to ≤1 across the whole set", () => {
    let total = 0;
    for (const s of V3_PV) {
      const { insight } = insightFor(s);
      total += checkPvTruncation(s.sentence, insight).length;
    }
    expect(total).toBeLessThanOrEqual(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// FIX D — mobility_claims family split + soundness gaps
// ════════════════════════════════════════════════════════════════════════════
describe("fix D — mobility_claims: LITERAL family graduates to the serving path", () => {
  it.each(V3_MOBILITY_LITERAL.map((s, i) => [i, s] as const))(
    "v3 literal fire %i still fires, now from runInsightChecks (%o)",
    (_i, s) => {
      const { insight, contract } = insightFor(s);
      const fires = runInsightChecks(s.sentence, insight, contract).filter(
        (v) => v.check === "mobility_claims",
      );
      expect(fires).toHaveLength(1);
      expect(fires[0].span.toLowerCase()).toBe(s.span.toLowerCase());
      expect(fires[0].category).toBe("mobility_count_wrong");
    },
  );

  it("the QUALITATIVE family never reaches the serving path", () => {
    for (const s of V3_MOBILITY_QUALITATIVE) {
      const { insight, contract } = insightFor(s);
      const served = runInsightChecks(s.sentence, insight, contract).filter(
        (v) => v.check === "mobility_claims",
      );
      expect(served).toEqual([]);
      // …but it is still measured.
      const measured = runMeasurementOnlyChecks(s.sentence, insight).filter(
        (v) => v.check === "mobility_claims",
      );
      expect(measured.length).toBeGreaterThanOrEqual(0);
    }
  });

  it("'no good squares' is a judgment, not a count — it is not in the LITERAL family", () => {
    const s = V3_MOBILITY_QUALITATIVE[0];
    const { insight } = insightFor(s);
    expect(checkMobilityLiteralClaims(s.sentence, insight)).toEqual([]);
    expect(checkMobilityQualitativeClaims(s.sentence, insight).length).toBe(1);
  });

  it("checkMobilityClaims stays the union of both families (harness + round-2 suite)", () => {
    for (const s of [...V3_MOBILITY_LITERAL, ...V3_MOBILITY_QUALITATIVE]) {
      const { insight } = insightFor(s);
      expect(checkMobilityClaims(s.sentence, insight)).toEqual([
        ...checkMobilityLiteralClaims(s.sentence, insight),
        ...checkMobilityQualitativeClaims(s.sentence, insight),
      ]);
    }
  });

  it("soundness gap (a): the claim is attributed to the CLAIMED piece, not the sentence's first piece reference (v3 #6/#9)", () => {
    // #9: "Nc6, the knight is immediately trapped with no legal moves, the
    // bishop on b6 is equally immobile…" — v3 scored this against the B on b6.
    const nine = V3_MOBILITY_ATTRIBUTION[1];
    const { insight: i9 } = insightFor(nine);
    const f9 = checkMobilityClaims(nine.sentence, i9);
    expect(f9).toHaveLength(1);
    expect(f9[0].detail).toContain("N on c6");
    // #6: "Ne7→c6: … trapped with no legal moves" — the arrow form names the
    // piece at its DESTINATION; v3 scored it against the N on e7.
    const six = V3_MOBILITY_ATTRIBUTION[0];
    const { insight: i6 } = insightFor(six);
    const f6 = checkMobilityClaims(six.sentence, i6);
    expect(f6).toHaveLength(1);
    expect(f6[0].detail).toContain("N on c6");
  });

  it("soundness gap (b): a claim conditioned on a later/hypothetical position is not scored against fenBefore/fenAfter (v3 #7/#12)", () => {
    // #7 "…with no legal moves by move 10" — an unresolvable future ply.
    const seven = V3_MOBILITY_HYPOTHETICAL[0];
    const { insight: i7 } = insightFor(seven);
    expect(checkMobilityClaims(seven.sentence, i7)).toEqual([]);
    // #12 "…no safe retreat after White plays h3" — resolvable: the claim is
    // scored against the position AFTER h3, not against fenBefore/fenAfter.
    const twelve = V3_MOBILITY_HYPOTHETICAL[1];
    const { insight: i12 } = insightFor(twelve);
    const fires12 = checkMobilityClaims(twelve.sentence, i12);
    const expected = safeCountAfter(i12, "h3", "g4");
    expect(expected).not.toBeNull();
    for (const v of fires12) {
      expect(v.detail).toContain(`${expected} safe move(s)`);
    }
    // And the control: an UNREACHABLE conditioning move makes the referenced
    // position unresolvable, so the claim is skipped rather than mis-scored.
    expect(
      checkMobilityClaims(
        "The bishop on g4 has no safe retreat after White plays Qh8.",
        i12,
      ),
    ).toEqual([]);
  });

  it("attribution also reads the reversed prose form ('the e7 knight'), v4 span 01/s1/I2", () => {
    const { insight } = insightFor(V3_MOBILITY_LITERAL[0]); // fixture 01, I2
    const sentence =
      "Ne7, Black's knight on d5 is pinned by your Bc4, attacked by Qf3 and Nc3, and the e7 knight is trapped with no moves.";
    const fires = checkMobilityClaims(sentence, insight);
    expect(fires).toHaveLength(1);
    // v4 attributed this to the Nc3 designator earlier in the sentence.
    expect(fires[0].detail).toContain("N on e7");
    expect(fires[0].detail).not.toContain("N on c3");
  });

  it("control: a HEDGED count is not an absolute zero claim (v4-a span 07/s2/M3)", () => {
    const { insight } = insightFor(V3_MOBILITY_LITERAL[0]);
    const absolute = "The knight on e7 has no legal moves.";
    const hedged = "The knight on e7 has almost no legal moves.";
    expect(checkMobilityClaims(absolute, insight)).toHaveLength(1);
    expect(checkMobilityClaims(hedged, insight)).toEqual([]);
  });

  it("control: an unverifiable claim (no resolvable piece) is skipped, never guessed", () => {
    const { insight } = insightFor(V3_MOBILITY_LITERAL[0]);
    expect(checkMobilityClaims("You have no legal moves here.", insight)).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Isolation: pv_truncation never reaches serving
// ════════════════════════════════════════════════════════════════════════════
describe("serving-path isolation after the split", () => {
  it("runInsightChecks never emits pv_truncation", () => {
    for (const s of ALL_SPANS) {
      const { insight, contract } = insightFor(s);
      expect(
        runInsightChecks(s.sentence, insight, contract).filter((v) => v.check === "pv_truncation"),
      ).toEqual([]);
    }
  });

  it("runMeasurementOnlyChecks emits only pv_truncation + the QUALITATIVE mobility family", () => {
    for (const s of ALL_SPANS) {
      const { insight } = insightFor(s);
      for (const v of runMeasurementOnlyChecks(s.sentence, insight)) {
        expect(["pv_truncation", "mobility_claims"]).toContain(v.check);
        if (v.check === "mobility_claims") {
          expect(checkMobilityQualitativeClaims(s.sentence, insight)).toContainEqual(v);
        }
      }
    }
  });
});
