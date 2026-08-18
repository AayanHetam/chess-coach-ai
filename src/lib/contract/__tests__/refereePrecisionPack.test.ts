/**
 * PRECISION PACK — regression suite over the ACTUAL adjudicated spans of the
 * 30-game FP measurement (scripts/eval/results/
 * contract-referee-fp-30game-claude-sonnet-4-6.json, adjudicated 2026-08-10:
 * 37 needs-review fires → 7 TRUE_FABRICATION / 30 FALSE_POSITIVE).
 *
 * Span texts are embedded VERBATIM from that artifact (flaggedSpans with
 * adjudication === "needs-review", in file order — the #N indices every
 * precision-pack comment cites) so the suite stays byte-stable even if the
 * results file is regenerated. Contracts are built from the same vendored
 * fixtures the measurement used, with the same no-network posture as
 * contract.test.ts (grounding sources degraded — the license pools these
 * tests exercise are all deterministic: whitelists, FENs, PVs, motifs).
 *
 * Contract with the adjudication:
 *  - the 7 TRUE catches (#9 #10 #28 #31 #32 #35 #36) MUST still fire
 *    (#32/#36 were duplicate halves — fix 6 collapses each pair to ONE fire;
 *    #28 is caught on merit by the NEW measurement-only pv_truncation check);
 *  - the FPs the pack's mechanical licenses cover MUST NOT fire
 *    (#0 #1 #3 #5 #6 #13 #15 #21 #23 #24 #25 #26 #27 #29 #30 #34 + the
 *    #11/#12 double-count half);
 *  - the residual FPs NO mechanical license can clear (forbidden_claim
 *    definitional prose #2 #4 #7 #8 #14 #19 #33; future-option SAN
 *    #17 #18 #20; beyond-2-ply tactics #16 #22; hedged-intent #11) still
 *    fire — but ONLY as warn-severity telemetry, because the precision-pack
 *    default arming table is all-warn (armingConfig.test.ts covers that).
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
  checkEvalDisplays,
  checkPvTruncation,
  checkMobilityClaims,
  checkMobilityLiteralClaims,
  checkMobilityQualitativeClaims,
  collectContractEvalPools,
} from "@/lib/contract/refereeChecks";
import type { RefereeViolation } from "@/lib/contract/refereeChecks";
import type { CoachContract, InsightContract } from "@/lib/contract/types";
import type { GameEvalInput, GameHeadersInput } from "@/lib/contract/gameEvalSchema";
import {
  __setFetchForTesting,
  __resetFetchForTesting,
  __clearChessdbCache,
} from "@/lib/grounding/chessdb";

// ── The 37 adjudicated needs-review spans, verbatim ─────────────────────────
interface AdjSpan {
  idx: number;
  fixture: string;
  factIdPrefix: string;
  check: string;
  span: string;
  sentence: string;
}

const SPANS: AdjSpan[] = [
  { idx: 0, fixture: "01_mate_for_white_midgame", factIdPrefix: "M1", check: "san_whitelist", span: "Bc4xd5+", sentence: "- White threatens Qxd5+ (check), Bc4xd5+ (check), and Bb5+ — the king on e6 is caught in the open" },
  { idx: 1, fixture: "01_mate_for_white_midgame", factIdPrefix: "M1", check: "tactical_keyword", span: "pin", sentence: "- Black's knight on d5 is pinned to the king by your bishop on c4, making it unable to help defend" },
  { idx: 2, fixture: "01_mate_for_white_midgame", factIdPrefix: "M1", check: "forbidden_claim", span: "Dominates", sentence: "- White queen on f3: Dominates the board with 15 active squares, delivering check and eyeing d5" },
  { idx: 3, fixture: "01_mate_for_white_midgame", factIdPrefix: "M1", check: "tactical_keyword", span: "pin", sentence: "Problem: Moving to e6 walks the king directly into the crossfire of your queen on f3 and bishop on c4, with the knight on d5 pinned and unable to help defend." },
  { idx: 4, fixture: "01_mate_for_white_midgame", factIdPrefix: "M1", check: "forbidden_claim", span: "Dominates", sentence: "- White Qf3: Dominates the board with 15 active squares, ready to deliver check from multiple angles." },
  { idx: 5, fixture: "01_mate_for_white_midgame", factIdPrefix: "M1", check: "san_whitelist", span: "Qd5+", sentence: "- White threatens Qd5+ and Bb5# — the king on e6 is caught in a mating net" },
  { idx: 6, fixture: "01_mate_for_white_midgame", factIdPrefix: "M1", check: "tactical_keyword", span: "pin", sentence: "Crucially, the knight on d5 is pinned to the king by your bishop on c4, so it can't help defend." },
  { idx: 7, fixture: "01_mate_for_white_midgame", factIdPrefix: "M1", check: "forbidden_claim", span: "dominates", sentence: "- Your queen on f3 dominates the board with 15 legal moves, putting immediate pressure on the exposed king" },
  { idx: 8, fixture: "03_sentinel_timeout", factIdPrefix: "M1", check: "forbidden_claim", span: "obvious", sentence: "A quiet move is one with no capture, no check, and no obvious threat — but it sets up something powerful." },
  { idx: 9, fixture: "04_invalid_san_truncation", factIdPrefix: "M1", check: "tactical_keyword", span: "pin", sentence: "Ba6 threatens to win the b7-pawn indirectly by pinning the b7-pawn's defender" },
  { idx: 10, fixture: "04_invalid_san_truncation", factIdPrefix: "M1", check: "tactical_keyword", span: "pin", sentence: "The bishop eyes the b7 pawn and creates a pin-like discomfort — Black has to spend a move responding instead of developing freely." },
  { idx: 11, fixture: "05_long_game_six_mistakes", factIdPrefix: "M1", check: "tactical_keyword", span: "fork", sentence: "Idea: Moving the knight to a7 might have been aimed at forking or creating threats — it feels like an active, aggressive continuation." },
  { idx: 12, fixture: "05_long_game_six_mistakes", factIdPrefix: "M1", check: "tactical_keyword", span: "fork", sentence: "Idea: Moving the knight to a7 might have been aimed at forking or creating threats — it feels like an active, aggressive continuation." },
  { idx: 13, fixture: "05_long_game_six_mistakes", factIdPrefix: "M1", check: "san_whitelist", span: "Rh8 Bb7", sentence: "- White Ba8 was attacked by Black's Rh8, Bb7, and Nc7 simultaneously — three attackers, zero defenders." },
  { idx: 14, fixture: "07_knight_fork", factIdPrefix: "M1", check: "forbidden_claim", span: "obvious", sentence: "Ba6 works precisely because it threatens something subtle (restricting the king) rather than something obvious." },
  { idx: 15, fixture: "07_knight_fork", factIdPrefix: "M1", check: "san_whitelist", span: "Qb4 Qa5", sentence: "Problem: Retreating to f3 abandons the center entirely and lets Black's queen roam freely — the threats of Qb4+, Qa5+, and Qxd4 become very real, winning material." },
  { idx: 16, fixture: "07_knight_fork", factIdPrefix: "M2", check: "tactical_keyword", span: "trapped", sentence: "Nc7+ Kd8, the knight gets trapped in the corner on a8 with no escape." },
  { idx: 17, fixture: "08_quiet_positional", factIdPrefix: "M1", check: "san_whitelist", span: "Bc3", sentence: "- White's bishop on c1 is the key undeveloped piece — it needs a diagonal, and Bd2 gives it one while keeping options open for Bc3 or Ba5." },
  { idx: 18, fixture: "08_quiet_positional", factIdPrefix: "M1", check: "san_whitelist", span: "Ba5", sentence: "- White's bishop on c1 is the key undeveloped piece — it needs a diagonal, and Bd2 gives it one while keeping options open for Bc3 or Ba5." },
  { idx: 19, fixture: "08_quiet_positional", factIdPrefix: "M1", check: "forbidden_claim", span: "obvious", sentence: "A quiet move — no capture, no check, no obvious threat — is the hardest class of move to find." },
  { idx: 20, fixture: "08_quiet_positional", factIdPrefix: "M1", check: "san_whitelist", span: "Bc3", sentence: "Bd2 is the quiet move that keeps everything in order — it develops the bishop, keeps the option of Bc3 to reinforce the center or contest the e5 square, and leaves the rook on a1 where it still has options." },
  { idx: 21, fixture: "09_legal_trap_tactics", factIdPrefix: "M1", check: "tactical_keyword", span: "discovered", sentence: "[CONCEPT:discoveredAttack:Discovered Attack Puzzles]" },
  { idx: 22, fixture: "09_legal_trap_tactics", factIdPrefix: "M1", check: "tactical_keyword", span: "trapped", sentence: "Your king is trapped with no escape." },
  { idx: 23, fixture: "09_legal_trap_tactics", factIdPrefix: "M2", check: "san_whitelist", span: "Ne5", sentence: "- Your d6-pawn could capture the Ne5 if it ever lands there — that's a resource you should keep in mind." },
  { idx: 24, fixture: "09_legal_trap_tactics", factIdPrefix: "M1", check: "san_whitelist", span: "Ne5", sentence: "The Ne5 has no defenders, so you win a full piece." },
  { idx: 25, fixture: "09_legal_trap_tactics", factIdPrefix: "M1", check: "san_whitelist", span: "Ne5", sentence: "- The Ne5 on e5 was completely undefended — your d6-pawn could capture it for free." },
  { idx: 26, fixture: "09_legal_trap_tactics", factIdPrefix: "M1", check: "san_whitelist", span: "Ne5", sentence: "- White's Ne5: the bait — it looks like a blunder but it's a deliberate sacrifice." },
  { idx: 27, fixture: "09_legal_trap_tactics", factIdPrefix: "M1", check: "tactical_keyword", span: "discovered", sentence: "[CONCEPT:discoveredAttack:Discovered Attack Puzzles]" },
  { idx: 28, fixture: "10_queenless_endgame", factIdPrefix: "M2", check: "forbidden_claim", span: "dominates", sentence: "cxd3, you've won material while your knight dominates the board." },
  { idx: 29, fixture: "10_queenless_endgame", factIdPrefix: "M1", check: "san_whitelist", span: "h1 Rhe1", sentence: "- White rook on h1: Passive on h1; Rhe1 activates it immediately on the critical open e-file." },
  { idx: 30, fixture: "10_queenless_endgame", factIdPrefix: "M1", check: "san_whitelist", span: "Re1", sentence: "- White's Re1 on the h1-rook eyes the e-file and supports future central activity." },
  { idx: 31, fixture: "10_queenless_endgame", factIdPrefix: "M1", check: "tactical_keyword", span: "fork", sentence: "Idea: You wanted to plant the knight on e6, a classic outpost that forks the bishop pair and disrupts Black's structure." },
  { idx: 32, fixture: "10_queenless_endgame", factIdPrefix: "M1", check: "tactical_keyword", span: "fork", sentence: "Idea: You wanted to plant the knight on e6, a classic outpost that forks the bishop pair and disrupts Black's structure." },
  { idx: 33, fixture: "10_queenless_endgame", factIdPrefix: "M2", check: "forbidden_claim", span: "dominating", sentence: "- White's Nd4 can leap to f5, attacking the bishop on e7 and dominating the center." },
  { idx: 34, fixture: "10_queenless_endgame", factIdPrefix: "M1", check: "san_whitelist", span: "Rh1", sentence: "- Rh1: Undeveloped and idle — activating it to e1 connects the rooks and adds pressure to the e-file immediately." },
  { idx: 35, fixture: "10_queenless_endgame", factIdPrefix: "M1", check: "tactical_keyword", span: "fork", sentence: "Idea: You spotted the outpost on e6 and wanted to plant the knight there, forking the bishops and creating chaos." },
  { idx: 36, fixture: "10_queenless_endgame", factIdPrefix: "M1", check: "tactical_keyword", span: "fork", sentence: "Idea: You spotted the outpost on e6 and wanted to plant the knight there, forking the bishops and creating chaos." },
];

const byIdx = (idx: number): AdjSpan => SPANS[idx];

// ── Fixture contract building (same posture as contract.test.ts) ────────────
interface FixtureFile {
  moveHistory: string[];
  gameEval: GameEvalInput;
  playerColor: string;
  username?: string;
  userRating?: number;
  gameHeaders?: GameHeadersInput;
}

const FIXTURES_DIR = path.join(__dirname, "fixtures");
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
    uid: `precision-pack-${name}`,
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

/** Checks-2-5 fires for one adjudicated span's sentence, per the pack. */
function firesFor(s: AdjSpan): RefereeViolation[] {
  const { insight, contract } = insightFor(s);
  return runInsightChecks(s.sentence, insight, contract);
}

beforeAll(async () => {
  __setFetchForTesting(async () => {
    throw new Error("network disabled in precision-pack tests");
  });
  const names = Array.from(new Set(SPANS.map((s) => s.fixture))).concat(["02_mate_for_black"]);
  for (const name of names) contracts.set(name, await buildFixtureContract(name));
}, 120_000);

afterAll(() => {
  __resetFetchForTesting();
});

// ── Fix 1: piece-designator license ─────────────────────────────────────────
describe("fix 1 — piece-designator license (#23-#26, #34)", () => {
  it.each([23, 24, 25, 26])("FP #%i 'the Ne5' board reference does not fire", (idx) => {
    const fires = firesFor(byIdx(idx));
    expect(fires.filter((v) => v.check === "san_whitelist")).toEqual([]);
  });

  it("FP #34 'Rh1: Undeveloped and idle' does not fire", () => {
    expect(firesFor(byIdx(34)).filter((v) => v.check === "san_whitelist")).toEqual([]);
  });
});

// ── Fix 2: legal-move normalization ─────────────────────────────────────────
describe("fix 2 — legal-move normalization (#0, #5, #30)", () => {
  it.each([
    [0, "Bc4xd5+ → Bxd5"],
    [5, "Qd5+ → Qxd5"],
    [30, "Re1 → Rhe1"],
  ])("FP #%i (%s) does not fire", (idx) => {
    expect(firesFor(byIdx(idx)).filter((v) => v.check === "san_whitelist")).toEqual([]);
  });
});

// ── Fix 3: clause separators end SAN runs ───────────────────────────────────
describe("fix 3 — no sequences across , ; — : (#13, #15, #29)", () => {
  it.each([13, 15, 29])(
    "FP #%i enumeration is not joined into a hypothetical line (and its tokens are licensed)",
    (idx) => {
      const fires = firesFor(byIdx(idx));
      expect(fires.filter((v) => v.category === "hypothetical_line_off_contract")).toEqual([]);
      expect(fires.filter((v) => v.check === "san_whitelist")).toEqual([]);
    },
  );
});

// ── Fix 4: motif scope extension ────────────────────────────────────────────
describe("fix 4 — motif license pool from fenAfter + PV plies (#1, #3, #6)", () => {
  it.each([1, 3, 6])("FP #%i real pin (opponent-geometry, outside mover scope) does not fire", (idx) => {
    expect(firesFor(byIdx(idx)).filter((v) => v.check === "tactical_keyword")).toEqual([]);
  });

  it("the builder actually populates motifLicense beyond the played-move motifs", () => {
    const { insight } = insightFor(byIdx(1));
    expect(insight.motifLicense).toBeDefined();
    expect((insight.motifLicense ?? []).length).toBeGreaterThan(insight.motifs.length);
  });
});

// ── Fix 5: CONCEPT-tag exemption ────────────────────────────────────────────
describe("fix 5 — [CONCEPT:...] spans exempt (#21, #27)", () => {
  it.each([21, 27])("FP #%i CONCEPT widget markup does not fire any check", (idx) => {
    expect(firesFor(byIdx(idx))).toEqual([]);
  });
});

// ── Fix 6: dedup identical (sentence, keyword) double-fires ─────────────────
describe("fix 6 — duplicate keyword fires collapse to one (#11/#12, #31/#32, #35/#36)", () => {
  it.each([11, 31, 35])(
    "span #%i's sentence produces exactly ONE 'fork' fire (v1 double-counted it)",
    (idx) => {
      const forks = firesFor(byIdx(idx)).filter(
        (v) => v.check === "tactical_keyword" && v.span.toLowerCase() === "fork",
      );
      expect(forks).toHaveLength(1);
    },
  );
});

// ── Fix 7: contract-global eval_display license pool ────────────────────────
describe("fix 7 — eval_display pool widened insight-local → contract-global (v1's 2 fires)", () => {
  // Both v1 eval_display fires: fixture 02, insight M1, span "M-2" quoted from
  // an ADJACENT insight's header ("00:M-2:Ng4:Ba5+]") — licensed by the
  // contract's global facts, not M1's local pools.
  const V1_SENTENCE = "00:M-2:Ng4:Ba5+]";

  it("insight-local pool fires on the cross-insight M-2 (the v1 behavior)", () => {
    const contract = contracts.get("02_mate_for_black")!;
    const m1 = contract.insights.find((i) => i.factIdPrefix === "M1")!;
    const local = checkEvalDisplays(V1_SENTENCE, m1);
    expect(local.some((v) => v.category === "mate_distance_wrong" && v.span === "M-2")).toBe(true);
  });

  it("contract-global pool licenses it (fires nothing)", () => {
    const contract = contracts.get("02_mate_for_black")!;
    const m1 = contract.insights.find((i) => i.factIdPrefix === "M1")!;
    expect(checkEvalDisplays(V1_SENTENCE, m1, contract)).toEqual([]);
    // And the global pool really does carry a -2 mate no local pool has.
    expect(collectContractEvalPools(contract).mates).toContain(-2);
  });
});

// ── The 7 TRUE catches must still fire ──────────────────────────────────────
describe("true fabrications still caught (#9, #10, #28, #31, #32, #35, #36)", () => {
  it.each([9, 10])("TF #%i fabricated 'pin' still fires", (idx) => {
    const pins = firesFor(byIdx(idx)).filter(
      (v) => v.check === "tactical_keyword" && v.span.toLowerCase() === "pin",
    );
    expect(pins).toHaveLength(1);
  });

  it.each([31, 35])("TF #%i fabricated 'fork' still fires (once, post-dedup)", (idx) => {
    const forks = firesFor(byIdx(idx)).filter(
      (v) => v.check === "tactical_keyword" && v.span.toLowerCase() === "fork",
    );
    expect(forks).toHaveLength(1);
  });

  it("TF #28 caught on merit by pv_truncation: quoted line stops one ply before the recapture", () => {
    const s = byIdx(28);
    const { insight } = insightFor(s);
    const fires = checkPvTruncation(s.sentence, insight);
    expect(fires).toHaveLength(1);
    expect(fires[0].category).toBe("pv_truncation_suspect");
    expect(fires[0].detail).toContain("favorable outcome");
  });

  it("TF #28 control: same quote WITHOUT the favorable-outcome claim does not fire", () => {
    const s = byIdx(28);
    const { insight } = insightFor(s);
    expect(checkPvTruncation("cxd3 keeps the game going.", insight)).toEqual([]);
  });
});

// ── Residual FPs: no mechanical license exists — they stay, as warn-only ────
describe("residual FPs (fire, but under the all-warn default table — armingConfig.test.ts)", () => {
  it.each([2, 4, 7, 14, 33])(
    "FP #%i forbidden_claim positional prose still fires (board-unfalsifiable without Lc0)",
    (idx) => {
      const s = byIdx(idx);
      const fires = firesFor(s).filter((v) => v.check === "forbidden_claim");
      expect(fires.map((v) => v.span.toLowerCase())).toContain(s.span.toLowerCase());
    },
  );

  // FOLLOW-UP fix B (2026-08-11): #8 and #19 ("A quiet move is one with no
  // capture, no check, and no obvious threat…") are DEFINITIONS — no square,
  // no SAN, no piece-on-square reference. isDefinitionalSentence was wired
  // into checkTacticalKeywords in round 2 but not into the USER_VISIBILITY_RE
  // path; the follow-up pack closes that, so these two adjudicated FPs are
  // now CLEARED, not residual. #14 ("Ba6 works precisely because…something
  // obvious") keeps firing — it is board-anchored.
  it.each([8, 19])("FP #%i definitional 'obvious' prose is cleared by fix B", (idx) => {
    const fires = firesFor(byIdx(idx)).filter((v) => v.check === "forbidden_claim");
    expect(fires.map((v) => v.span.toLowerCase())).not.toContain("obvious");
  });

  it.each([17, 18, 20])(
    "FP #%i future-option SAN (Bc3/Ba5 after a hypothetical Bd2) still fires — beyond fenBefore/fenAfter legality",
    (idx) => {
      const s = byIdx(idx);
      const fires = firesFor(s).filter((v) => v.check === "san_whitelist");
      expect(fires.map((v) => v.span)).toContain(s.span);
    },
  );

  it.each([16])(
    "FP #%i 'trapped' beyond the 2-ply motif-license scope still fires",
    (idx) => {
      const fires = firesFor(byIdx(idx)).filter((v) => v.check === "tactical_keyword");
      expect(fires.map((v) => v.span.toLowerCase())).toContain("trapped");
    },
  );

  // ROUND 2 (2026-08-10): #22 ("Your king is trapped with no escape", fixture
  // 09 — the game ends in the Nd5# smothered mate) was an adjudicated FP that
  // round 1 had no mechanical license for. The round-2 king-context rule
  // licenses king-"trapped" prose when the contract knows a mate (fix 4b,
  // license half) — a mated king IS trapped — so this FP is now CLEARED, not
  // residual. The zero-mobility TF shape ("knight … no legal moves" with
  // actual moves on the board) is pinned separately in refereeRound2.test.ts.
  it("FP #22 king-context 'trapped' is cleared by the round-2 mate license", () => {
    const fires = firesFor(byIdx(22)).filter((v) => v.check === "tactical_keyword");
    expect(fires.map((v) => v.span.toLowerCase())).not.toContain("trapped");
  });
});

// ── New measurement-only check: mobility_claims (fixture 01's wrong "15") ───
describe("measurement-only mobility_claims (fixture 01's thrice-repeated wrong '15')", () => {
  it.each([2, 4, 7])("span #%i's mobility claim contradicted by chess.js", (idx) => {
    const s = byIdx(idx);
    const { insight } = insightFor(s);
    const fires = checkMobilityClaims(s.sentence, insight);
    expect(fires).toHaveLength(1);
    expect(fires[0].category).toBe("mobility_count_wrong");
    expect(fires[0].span).toMatch(/^15 /);
  });

  it("control: the chess.js-true count does not fire", () => {
    const s = byIdx(7);
    const { insight } = insightFor(s);
    const wrong = checkMobilityClaims(s.sentence, insight);
    const actual = wrong[0].detail.match(/actual: ([\d/]+) legal/)?.[1]?.split("/")[0];
    expect(actual).toBeDefined();
    const corrected = s.sentence.replace("15 legal moves", `${actual} legal moves`);
    expect(checkMobilityClaims(corrected, insight)).toEqual([]);
  });

  it("control: unverifiable claims (no piece+square in sentence) are skipped, never guessed", () => {
    const { insight } = insightFor(byIdx(2));
    expect(checkMobilityClaims("You have 15 legal moves here.", insight)).toEqual([]);
  });
});

// ── Isolation: measurement-only checks never leak into the serving path ─────
describe("measurement-only isolation", () => {
  // FOLLOW-UP fix D (2026-08-11): the LITERAL mobility family (bare-integer
  // counts, "no/zero legal moves") graduated onto the serving path after v3
  // measured 9 fires / 9 TRUE_FABRICATION / 0 FP, so runInsightChecks DOES
  // emit mobility_claims now. pv_truncation remains measurement-only.
  it("runInsightChecks never emits pv_truncation", () => {
    for (const s of SPANS) {
      expect(firesFor(s).filter((v) => v.check === "pv_truncation")).toEqual([]);
    }
  });

  it("runInsightChecks only ever emits the LITERAL mobility family", () => {
    for (const s of SPANS) {
      const { insight } = insightFor(s);
      const served = firesFor(s).filter((v) => v.check === "mobility_claims");
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
