/**
 * ROUND 2 — regression suite over the ACTUAL adjudicated spans of the v2
 * 30-game FP measurement (scripts/eval/results/
 * contract-referee-fp-30game-v2-claude-sonnet-4-6.json, real-Stockfish
 * fixtures-real contracts; adjudicated by the founder 2026-08-10:
 * 37 needs-review fires → 8 TRUE_FABRICATION / 24 FALSE_POSITIVE /
 * 5 ambiguous).
 *
 * Span texts are embedded VERBATIM from that artifact (flaggedSpans with
 * adjudication === "needs-review", in file order — the v2 #N indices every
 * round-2 comment cites). Contracts are built from the SAME fixtures-real
 * files the measurement used, no-network posture as contract.test.ts.
 *
 * Contract with the adjudication:
 *  - the 8 TRUE fabrications still fire:
 *      · #0/#2/#4/#5/#8 — "trapped with no legal moves / no good squares"
 *        knights that chess.js gives 4-6 legal (or ≥1 safe) moves: the
 *        tactical_keyword fire is kept AND the round-2 zero-mobility
 *        cross-check (mobility_claims) refutes the count on merit;
 *      · #29 — "g6 cuts off its retreat square on h5": false, Bh5 is legal
 *        and uncovered; square_unknown keeps firing (no round-2 license
 *        reaches h5 by construction);
 *      · #31 — "dxe5 … winning a piece cleanly": the PV continues Qxg4
 *        taking the bishop straight back (net 0) and the line ends +1.89
 *        for the opponent — the rewritten pv_truncation fires on BOTH the
 *        quiescence arm and the end-eval arm;
 *      · #33 — "bishop on g4 … trapped with no safe square to retreat to":
 *        Bh5 is a safe flight; keyword + zero-safe-square cross-check fire.
 *  - the 24 FPs no longer fire (per-fix licensing below);
 *  - the 5 ambiguous spans (#9/#14/#20/#23 fixture-05 fork prose, #28
 *    "trapped rook") are documented EITHER WAY with the mechanical reason.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

vi.hoisted(() => {
  delete process.env.LC0_API_URL;
  delete process.env.MAIA_API_URL;
});

import { vi } from "vitest";
import { buildCoachContract } from "@/lib/contract/builder";
import { getFenAtHalfMove } from "@/lib/contract/chessFormat";
import {
  runInsightChecks,
  runMeasurementOnlyChecks,
  checkPvTruncation,
  checkMobilityClaims,
  checkMobilityLiteralClaims,
  checkMobilityQualitativeClaims,
  checkTacticalKeywords,
  isDefinitionalSentence,
} from "@/lib/contract/refereeChecks";
import type { RefereeViolation } from "@/lib/contract/refereeChecks";
import type { CoachContract, InsightContract } from "@/lib/contract/types";
import type { GameEvalInput, GameHeadersInput } from "@/lib/contract/gameEvalSchema";
import {
  __setFetchForTesting,
  __resetFetchForTesting,
  __clearChessdbCache,
} from "@/lib/grounding/chessdb";
import { makeInsight, makeContract } from "./insightFactory";

// ── The 37 adjudicated v2 needs-review spans, verbatim ──────────────────────
interface AdjSpan {
  idx: number;
  fixture: string;
  factIdPrefix: string;
  check: string;
  span: string;
  sentence: string;
}

const SPANS: AdjSpan[] = [
  { idx: 0, fixture: "01_mate_for_white_midgame", factIdPrefix: "M2", check: "tactical_keyword", span: "trapped", sentence: "- Black's knight on e7 is completely trapped with no legal moves." },
  { idx: 1, fixture: "01_mate_for_white_midgame", factIdPrefix: "M1", check: "tactical_keyword", span: "fork", sentence: "Nxf7 with a strong fork." },
  { idx: 2, fixture: "01_mate_for_white_midgame", factIdPrefix: "M2", check: "tactical_keyword", span: "trapped", sentence: "Problem: Moving the knight to e7 leaves it with zero legal moves — it becomes completely trapped." },
  { idx: 3, fixture: "01_mate_for_white_midgame", factIdPrefix: "M1", check: "tactical_keyword", span: "fork", sentence: "Nxf7 forking the queen and rook." },
  { idx: 4, fixture: "01_mate_for_white_midgame", factIdPrefix: "M2", check: "tactical_keyword", span: "trapped", sentence: "The knight on e7 is immediately trapped with no legal moves, and Black's position becomes very cramped." },
  { idx: 5, fixture: "02_mate_for_black", factIdPrefix: "M2", check: "tactical_keyword", span: "trapped", sentence: "Problem: The knight on c6 immediately becomes trapped — it has no good squares and the d6 pawn isn't going anywhere." },
  { idx: 6, fixture: "02_mate_for_black", factIdPrefix: "M1", check: "forbidden_claim", span: "dominating", sentence: "d5 — pushing the knight off c6 and dominating the center." },
  { idx: 7, fixture: "02_mate_for_black", factIdPrefix: "M2", check: "san_whitelist", span: "e3", sentence: "O-O Nf5, where the knight finds a much better square — pressuring the d6 pawn and eyeing e3." },
  { idx: 8, fixture: "02_mate_for_black", factIdPrefix: "M2", check: "tactical_keyword", span: "trapped", sentence: "Problem: The knight on c6 has no legal moves in the final position — it's immediately trapped." },
  { idx: 9, fixture: "05_long_game_six_mistakes", factIdPrefix: "M2", check: "tactical_keyword", span: "fork", sentence: "- After Nxc8+, the king is forced to move, and then Nxf7 forks the queen and rook." },
  { idx: 10, fixture: "05_long_game_six_mistakes", factIdPrefix: "M2", check: "pv_truncation", span: "Nxf7", sentence: "Nxf7 wins the queen — a two-move combination that nets a huge material gain." },
  { idx: 11, fixture: "05_long_game_six_mistakes", factIdPrefix: "M3", check: "pv_truncation", span: "Nxf7", sentence: "Nxf7 wins the queen directly." },
  { idx: 12, fixture: "05_long_game_six_mistakes", factIdPrefix: "M4", check: "pv_truncation", span: "Nxf7", sentence: "Nxf7 wins the queen — the same pattern that was available for four consecutive moves." },
  { idx: 13, fixture: "05_long_game_six_mistakes", factIdPrefix: "M6", check: "tactical_keyword", span: "discovered", sentence: "When you move one piece and it reveals an attack by another piece behind it, that's a discovered attack." },
  { idx: 14, fixture: "05_long_game_six_mistakes", factIdPrefix: "M2", check: "tactical_keyword", span: "fork", sentence: "Nxf7 forks the king and wins the queen on f7." },
  { idx: 15, fixture: "05_long_game_six_mistakes", factIdPrefix: "M2", check: "pv_truncation", span: "Nxf7", sentence: "Nxf7 forks the king and wins the queen on f7." },
  { idx: 16, fixture: "05_long_game_six_mistakes", factIdPrefix: "M1", check: "pv_truncation", span: "Nxf7", sentence: "Nxc8+ still wins it with check, then Nxf7 wins the queen." },
  { idx: 17, fixture: "05_long_game_six_mistakes", factIdPrefix: "M3", check: "pv_truncation", span: "Nxf7", sentence: "Nxf7 wins the queen on f7." },
  { idx: 18, fixture: "05_long_game_six_mistakes", factIdPrefix: "M3", check: "pv_truncation", span: "Nxf7", sentence: "- White knight on h6: the hero of this position — Nxf7 wins the queen immediately" },
  { idx: 19, fixture: "05_long_game_six_mistakes", factIdPrefix: "M3", check: "pv_truncation", span: "Nxf7", sentence: "Nxf7 wins the queen on the spot." },
  { idx: 20, fixture: "05_long_game_six_mistakes", factIdPrefix: "M4", check: "tactical_keyword", span: "fork", sentence: "Recognizing this recurring fork pattern is the key lesson of this game." },
  { idx: 21, fixture: "05_long_game_six_mistakes", factIdPrefix: "M4", check: "pv_truncation", span: "Nxf7", sentence: "- White knight on a7 still delivers Nxc8+ check, winning the queen after Nxf7" },
  { idx: 22, fixture: "05_long_game_six_mistakes", factIdPrefix: "M6", check: "pv_truncation", span: "Nxf6 Kd8 Bd5", sentence: "Nxf6+ Kd8 28." },
  { idx: 23, fixture: "05_long_game_six_mistakes", factIdPrefix: "M2", check: "tactical_keyword", span: "fork", sentence: "- After Nxc8+, the knight on f7 can fork king and queen" },
  { idx: 24, fixture: "05_long_game_six_mistakes", factIdPrefix: "M2", check: "pv_truncation", span: "Nxf7", sentence: "Nxf7 you've won the queen as well — a massive material gain that should decide the game." },
  { idx: 25, fixture: "05_long_game_six_mistakes", factIdPrefix: "M1", check: "pv_truncation", span: "Nxf7", sentence: "Nxf7 follows, winning the queen — a sequence that should end the game." },
  { idx: 26, fixture: "05_long_game_six_mistakes", factIdPrefix: "M3", check: "pv_truncation", span: "Nxf7", sentence: "Nxf7 wins the queen — after 21." },
  { idx: 27, fixture: "07_knight_fork", factIdPrefix: "M3", check: "tactical_keyword", span: "trapped", sentence: "Qxd1+, you lose the queen and the knight on a8 is trapped with nowhere to go." },
  { idx: 28, fixture: "07_knight_fork", factIdPrefix: "M3", check: "tactical_keyword", span: "trapped", sentence: "- Your knight on c7: a powerful piece — don't trade it for a trapped rook when it can deliver a decisive check." },
  { idx: 29, fixture: "09_legal_trap_tactics", factIdPrefix: "M2", check: "san_whitelist", span: "h5", sentence: "- Your Bg4 is now stuck — g6 cuts off its retreat square on h5" },
  { idx: 30, fixture: "09_legal_trap_tactics", factIdPrefix: "M1", check: "tactical_keyword", span: "trapped", sentence: "Problem: The knight on e5 is hanging (your d6-pawn attacks it with no defenders), but the real danger is what White sets up AFTER you take: with the queen gone, White plays Bxf7+ forcing your king to e7, then Nd5# — a smothered mate with your king trapped in the center." },
  { idx: 31, fixture: "09_legal_trap_tactics", factIdPrefix: "M1", check: "pv_truncation", span: "dxe5", sentence: "dxe5 simply captures the hanging knight on e5, winning a piece cleanly." },
  { idx: 32, fixture: "09_legal_trap_tactics", factIdPrefix: "M2", check: "san_whitelist", span: "Bg7", sentence: "Idea: You wanted to develop your kingside and perhaps castle long, using the g6-Bg7 setup." },
  { idx: 33, fixture: "09_legal_trap_tactics", factIdPrefix: "M2", check: "tactical_keyword", span: "trapped", sentence: "- Your bishop on g4 is becoming trapped with no safe square to retreat to" },
  { idx: 34, fixture: "10_queenless_endgame", factIdPrefix: "M2", check: "tactical_keyword", span: "skewer", sentence: "Bh5 is a quiet move that targets the knight on g6 and creates a skewer threat: if the knight moves, it exposes f7." },
  { idx: 35, fixture: "10_queenless_endgame", factIdPrefix: "M2", check: "tactical_keyword", span: "skewer", sentence: "Bh5 works on a skewer-like principle — attacking the knight on g6 forces it to move, which then exposes the f7 pawn behind it." },
  { idx: 36, fixture: "10_queenless_endgame", factIdPrefix: "M2", check: "tactical_keyword", span: "skewer", sentence: "Bh5 works on a skewer-like principle — attacking the knight on g6 forces it to move, potentially exposing the f7 pawn or disrupting Black's defensive setup." },
];

const byIdx = (idx: number): AdjSpan => SPANS[idx];

// ── Fixture contract building — fixtures-REAL (the v2 measurement's set) ────
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
    uid: `round2-${name}`,
    identity: { fen: requestFen, playerColor: f.playerColor || "w" },
  });
}

function insightFor(s: AdjSpan): { insight: InsightContract; contract: CoachContract } {
  const contract = contracts.get(s.fixture);
  if (!contract) throw new Error(`contract missing for ${s.fixture}`);
  const insight = contract.insights.find((i) => i.factIdPrefix === s.factIdPrefix);
  if (!insight) throw new Error(`insight ${s.factIdPrefix} missing in ${s.fixture}`);
  return { insight, contract };
}

/** All fires for one span's sentence: checks 2-5 (contract threaded, as the
 * v3 harness runs them) + the measurement-only checks. */
function allFiresFor(s: AdjSpan): RefereeViolation[] {
  const { insight, contract } = insightFor(s);
  return [
    ...runInsightChecks(s.sentence, insight, contract),
    ...runMeasurementOnlyChecks(s.sentence, insight),
  ];
}

const spansOf = (fires: RefereeViolation[], check: string) =>
  fires.filter((v) => v.check === check).map((v) => v.span.toLowerCase());

beforeAll(async () => {
  __setFetchForTesting(async () => {
    throw new Error("network disabled in round-2 referee tests");
  });
  for (const name of Array.from(new Set(SPANS.map((s) => s.fixture)))) {
    contracts.set(name, await buildFixtureContract(name));
  }
}, 120_000);

afterAll(() => {
  __resetFetchForTesting();
});

// ════════════════════════════════════════════════════════════════════════════
// THE 8 TRUE FABRICATIONS STILL FIRE
// ════════════════════════════════════════════════════════════════════════════
describe("TF — mobility-refuted 'trapped' (#0 #2 #4 #5 #8)", () => {
  it.each([0, 2, 4, 5, 8])("TF #%i fires the unbacked-'trapped' keyword", (idx) => {
    expect(spansOf(allFiresFor(byIdx(idx)), "tactical_keyword")).toContain("trapped");
  });

  it.each([
    [0, "no legal moves"], // knight e7: 4 legal moves
    [2, "zero legal moves"], // knight e7 (piece referenced via 'knight TO e7')
    [4, "no legal moves"],
    [5, "no good squares"], // knight c6: Nd4 is a defended flight square
    [8, "no legal moves"], // knight c6: 6 legal moves
  ])("TF #%i is refuted on merit by the zero-mobility cross-check (%s)", (idx, phrase) => {
    const s = byIdx(idx);
    const { insight } = insightFor(s);
    const fires = checkMobilityClaims(s.sentence, insight);
    expect(fires).toHaveLength(1);
    expect(fires[0].category).toBe("mobility_count_wrong");
    expect(fires[0].span.toLowerCase()).toBe(phrase);
  });

  it("control: a true zero-mobility claim would not fire (#27's Na8 below)", () => {
    // Covered in the #27 FP block — both flight squares are enemy-covered.
    expect(true).toBe(true);
  });
});

describe("TF #29 — 'g6 cuts off its retreat square on h5' (false: Bh5 legal + uncovered)", () => {
  it("square_unknown h5 still fires — no round-2 license reaches h5", () => {
    const fires = allFiresFor(byIdx(29));
    expect(spansOf(fires, "san_whitelist")).toContain("h5");
  });
});

describe("TF #31 — 'dxe5 … winning a piece cleanly' (PV continues Qxg4, net 0, end +1.89 opponent)", () => {
  it("pv_truncation fires under the rewritten quiescence rule", () => {
    const s = byIdx(31);
    const { insight } = insightFor(s);
    const fires = checkPvTruncation(s.sentence, insight);
    expect(fires).toHaveLength(1);
    expect(fires[0].category).toBe("pv_truncation_suspect");
    expect(fires[0].detail).toContain("favorable outcome");
    // Both arms hold on this span: quiescence (Qxg4 takes 3 vs 3 banked) and
    // the end-eval contradiction (+1.89 White = −1.89 for Black, the claimant).
    expect(fires[0].detail).toMatch(/quiescence violated|outcome contradicts/);
  });

  it("control: the same quote without a favorable-outcome claim does not fire", () => {
    const { insight } = insightFor(byIdx(31));
    expect(checkPvTruncation("dxe5 keeps the game going.", insight)).toEqual([]);
  });
});

describe("TF #33 — 'bishop on g4 … no safe square to retreat to' (Bh5 is safe)", () => {
  it("keyword + zero-safe-square cross-check both fire", () => {
    const s = byIdx(33);
    const fires = allFiresFor(s);
    expect(spansOf(fires, "tactical_keyword")).toContain("trapped");
    const mob = fires.filter((v) => v.check === "mobility_claims");
    expect(mob).toHaveLength(1);
    expect(mob[0].span.toLowerCase()).toContain("no safe square");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// THE 24 FALSE POSITIVES NO LONGER FIRE
// ════════════════════════════════════════════════════════════════════════════
describe("FP — value-aware fork confirmation via game continuation (#1 #3)", () => {
  it.each([1, 3])(
    "FP #%i 'Nxf7 forking Qd8+Rh8' is fully licensed (fork confirmed: +1 banked +5 harvest −3 forker; Nxf7 legal from fenAfter)",
    (idx) => {
      expect(allFiresFor(byIdx(idx))).toEqual([]);
    },
  );
});

describe("FP — forbidden_claim game-history exemption (#6)", () => {
  it("FP #6 'd5 — … dominating the center' is exempt (d5 is the game's next move, anchor 0.00 → +1.80)", () => {
    expect(spansOf(allFiresFor(byIdx(6)), "forbidden_claim")).toEqual([]);
  });
});

describe("FP — sentence-coupled attack-map square license (#7)", () => {
  it("FP #7 'O-O Nf5 … eyeing e3' is licensed (knight on its PV destination f5 attacks e3)", () => {
    expect(allFiresFor(byIdx(7))).toEqual([]);
  });
});

describe("FP — pv_truncation quiescence licenses queen-harvest give-backs (13 spans)", () => {
  it.each([10, 11, 12, 15, 16, 17, 18, 19, 21, 22, 24, 25, 26])(
    "FP #%i quoted Nxf7/Nxf6-class window does not fire pv_truncation (lesser-value give-back after the harvest; end evals agree)",
    (idx) => {
      const s = byIdx(idx);
      const { insight } = insightFor(s);
      expect(checkPvTruncation(s.sentence, insight)).toEqual([]);
    },
  );
});

describe("FP — definitional-sentence exemption (#13)", () => {
  it("FP #13 'that's a discovered attack' (no square/SAN/piece-ref) does not fire", () => {
    expect(allFiresFor(byIdx(13))).toEqual([]);
  });

  it("the exemption is really sentence-shape-driven", () => {
    expect(
      isDefinitionalSentence(
        "When you move one piece and it reveals an attack by another piece behind it, that's a discovered attack.",
      ),
    ).toBe(true);
    expect(isDefinitionalSentence("The knight on e7 is trapped.")).toBe(false);
    expect(isDefinitionalSentence("Nxf7 forks the queen and rook.")).toBe(false);
  });
});

describe("FP — immobilized-piece trapped license (#27)", () => {
  it("FP #27 'knight on a8 trapped with nowhere to go' is fully licensed (Na8: b6 covered by the a7-pawn, c7 by Kd8 — 0 safe flights)", () => {
    expect(allFiresFor(byIdx(27))).toEqual([]);
  });
});

describe("FP — king-context 'trapped' mate license (#30)", () => {
  it("FP #30 'your king trapped in the center' does not fire the keyword (the game ends in the Nd5# smothered mate the sentence describes)", () => {
    expect(spansOf(allFiresFor(byIdx(30)), "tactical_keyword")).toEqual([]);
  });

  it("the bare e7 square no longer fires — FOLLOW-UP fix A moved the license pool contract-global", () => {
    // Ke7 is a game move. Round 2 documented this as insight-local residue
    // that only the --fp-measure adjudicator licensed ("licensed-elsewhere-
    // in-contract"). The follow-up pack gives the SERVING check that same
    // pool (collectContractWhitelist), so the residue is gone at the source
    // rather than being written off at measurement time.
    const sanFires = spansOf(allFiresFor(byIdx(30)), "san_whitelist");
    expect(sanFires).toEqual([]);
  });
});

describe("FP — plan-intent legality license (#32)", () => {
  it("FP #32 'the g6-Bg7 setup' does not fire (Bg7 is a legal black move from fenAfter)", () => {
    expect(allFiresFor(byIdx(32))).toEqual([]);
  });
});

describe("FP — pawn-backed skewer THREAT license (#34 #35 #36)", () => {
  it.each([34, 35, 36])(
    "FP #%i 'Bh5 … skewer threat … exposes f7' is fully licensed (verified x-ray after the engine-best Bh5)",
    (idx) => {
      expect(allFiresFor(byIdx(idx))).toEqual([]);
    },
  );
});

// ════════════════════════════════════════════════════════════════════════════
// THE 5 AMBIGUOUS SPANS — documented either way
// ════════════════════════════════════════════════════════════════════════════
describe("ambiguous spans (v2 adjudication left these open)", () => {
  // #9/#14/#23 (fixture 05, M2): "Nxf7 forks the queen and rook / king and
  // queen". The M2 position's queen IS the f7 target (Nxf7 *captures* it —
  // calling that a "fork" is at minimum sloppy prose, arguably wrong), and
  // no fork motif in M2's pool survives value-aware confirmation. They KEEP
  // FIRING as warn-only telemetry; the founder can reclassify at v3 review.
  it.each([9, 14, 23])("ambiguous #%i (M2 fork prose) still fires — no confirmable fork in the pool", (idx) => {
    expect(spansOf(allFiresFor(byIdx(idx)), "tactical_keyword")).toContain("fork");
  });

  // #20 (M4): "Recognizing this recurring fork pattern is the key lesson" —
  // meta-prose about the game's recurring Nxc8+/Nxf7 motif. M4's license
  // pool gains a value-aware-confirmed fork from its PV walk, so the
  // keyword is licensed and the span no longer fires. Mechanical reason:
  // pool-wide keyword licensing (same rule that clears #1/#3).
  it("ambiguous #20 (M4 fork-pattern meta-prose) no longer fires — PV fork confirmed by value", () => {
    expect(spansOf(allFiresFor(byIdx(20)), "tactical_keyword")).toEqual([]);
  });

  // #28 (M3): "don't trade it for a trapped rook" — the a8-knight
  // immobilization license (same pool as #27) covers the "trapped" keyword
  // for this insight, so the span no longer fires. If the founder rules the
  // "trapped ROOK" reading a fabrication, it needs a piece-resolving
  // keyword check (out of round-2 scope — keyword licensing is pool-wide).
  it("ambiguous #28 (M3 'trapped rook') no longer fires — pool-wide 'trapped' license from the immobilized Na8", () => {
    expect(spansOf(allFiresFor(byIdx(28)), "tactical_keyword")).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Controls + isolation
// ════════════════════════════════════════════════════════════════════════════
describe("round-2 controls", () => {
  it("king-context 'trapped' license requires a contract-known MATE (synthetic no-mate insight — king prose still fires)", () => {
    // The factory fixture has no "#" anywhere (lines/threats/played/best/
    // game moves), so contractHasMate is false and the license cannot apply.
    const insight = makeInsight({ motifs: [], motifLicense: [], allowedTacticalKeywords: [] });
    const contract = makeContract([insight]);
    const fires = checkTacticalKeywords(
      "Your king on e1 is trapped in the center.",
      insight,
      contract,
    );
    expect(fires.map((v) => v.span.toLowerCase())).toContain("trapped");
  });

  it("king-context license requires the KING word — #0's knight phrasing fires even though fixture 01's contract knows a mate", () => {
    // (Already pinned as TF #0 above; restated here as the rule-shape control.)
    expect(spansOf(allFiresFor(byIdx(0)), "tactical_keyword")).toContain("trapped");
  });

  it("plan-intent license never licenses SQUARES (h5 stays unlicensed while Bh5 the MOVE would be legal)", () => {
    const s = byIdx(29);
    const fires = allFiresFor(s);
    expect(spansOf(fires, "san_whitelist")).toContain("h5");
  });

  // FOLLOW-UP fix D (2026-08-11): the LITERAL mobility family is served now
  // (v3: 9 fires / 9 TRUE_FABRICATION / 0 FP). pv_truncation and the
  // QUALITATIVE mobility family stay measurement-only.
  it("pv_truncation never leaks into runInsightChecks", () => {
    for (const s of SPANS) {
      const { insight, contract } = insightFor(s);
      expect(
        runInsightChecks(s.sentence, insight, contract).filter((v) => v.check === "pv_truncation"),
      ).toEqual([]);
    }
  });

  it("runInsightChecks only ever emits the LITERAL mobility family", () => {
    for (const s of SPANS) {
      const { insight, contract } = insightFor(s);
      const served = runInsightChecks(s.sentence, insight, contract).filter(
        (v) => v.check === "mobility_claims",
      );
      expect(served).toEqual(checkMobilityLiteralClaims(s.sentence, insight));
    }
  });

  it("runMeasurementOnlyChecks emits ONLY pv_truncation + the QUALITATIVE mobility family", () => {
    for (const s of SPANS) {
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
