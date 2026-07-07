/**
 * Shared synthetic InsightContract/CoachContract factory for the referee
 * test suites (refereeChecks.test.ts — measurement; referee.test.ts —
 * blocking; shadowReferee/grammar/perf tests). Extracted verbatim from
 * refereeChecks.test.ts in PR-CI-3 so the blocking-referee suite exercises
 * the SAME fixture rather than a drifting copy.
 *
 * The fixture: a knight-fork blunder with two candidate lines, one confirmed
 * fork motif, relational facts, and the production Degraded states
 * (lc0/maia/syzygy unavailable, chessdb down).
 */
import type { CoachContract, EvalFact, InsightContract, LineFact } from "@/lib/contract/types";
import type { AnyMotif } from "@/lib/tactics/types";

export function evalFact(over: Partial<EvalFact>): EvalFact {
  return {
    cp: 138,
    mate: null,
    depth: 14,
    sentinel: false,
    display: "+1.38",
    provenance: { source: "stockfish_client", confidence: "client_reported", depth: 14 },
    ...over,
  };
}

export function lineFact(
  id: string,
  san: string[],
  pvUci: string[],
  ev: Partial<EvalFact>,
  isPlayedLine = false,
): LineFact {
  return { id, san, pvUci, eval: evalFact(ev), isPlayedLine };
}

export const CONFIRMED_FORK: AnyMotif = {
  motif: "fork",
  confirmed: true,
  refutation: null,
  by_piece: "n",
  by_square: "e6",
  targets: [
    { square: "d8", piece: "q" },
    { square: "g7", piece: "p" },
  ],
  unavoidable_loss_cp: 300,
};

export function makeInsight(over: Partial<InsightContract> = {}): InsightContract {
  return {
    factIdPrefix: "M1",
    ply: 20,
    moveNumber: 11,
    color: "w",
    colorName: "White",
    playedSan: "Bd3",
    bestSan: "Ne6",
    classification: "blunder",
    severityDropPawns: 3.5,
    severityDropCp: 350,
    cpBeforeFlat: 138,
    cpAfterFlat: -212,
    // Position with pieces on: e4 (wP), d4 (wN), g1 (wK), d8 (bQ), g8 (bK), g7 (bP)
    fenBefore: "3q2k1/6p1/8/8/3NP3/8/8/6K1 w - - 0 11",
    fenAfter: "3q2k1/6p1/8/8/3BP3/8/8/6K1 b - - 0 11",
    evalBefore: evalFact({}),
    evalAfter: evalFact({ cp: -212, display: "-2.12" }),
    lines: [
      lineFact("M1.pv0", ["Ne6", "Qd7", "Nxg7"], ["d4e6", "d8d7", "e6g7"], { cp: 320, display: "+3.20" }),
      lineFact("M1.pv1", ["Bd3", "Qd4+"], ["f1d3", "d8d4"], { cp: -212, display: "-2.12" }, true),
    ],
    branchPoint: { atPly: 0, sharedSan: [], bestContinues: "Ne6", playedGoes: "Bd3" },
    intelBranchPoint: null,
    changeDescription: "White bishop moved from f1 to d3",
    motifs: [CONFIRMED_FORK],
    allowedTacticalKeywords: ["fork", "double attack"],
    voterConfidence: {
      endgame_wdl: "NONE",
      tactical_motif: "HIGH",
      material_win: "HIGH",
      mate_in_n: "NONE",
      positional_plan: "MED",
      user_visibility: "NONE",
    },
    positionConfidence: { level: "engine_verified", score: 90, drivers: [] },
    groundingContext: "TACTICAL FACTS: fork confirmed",
    sayables: { motifs: [], relationalCaptures: [], relationalHanging: [], relationalPins: [] },
    concepts: [],
    engineIdea: null,
    relational: {
      fen: "3q2k1/6p1/8/8/3NP3/8/8/6K1 w - - 0 11",
      sideToMove: "w",
      captures: [
        {
          attackerSquare: "d4",
          attackerType: "n",
          attackerColor: "w",
          targetSquare: "d8",
          targetType: "q",
          targetColor: "b",
        },
      ],
      hanging: [],
      pins: [],
      summary: "Nd4 can capture Qd8.",
    },
    featureDelta: null,
    threats: null,
    pieceRoleChanges: [],
    chessdb: { status: "unavailable", reason: "service_error", claimClassesForbidden: [] },
    syzygy: { status: "unavailable", reason: "not_applicable", claimClassesForbidden: ["endgame_wdl"] },
    lc0: {
      status: "unavailable",
      reason: "service_unconfigured",
      claimClassesForbidden: ["positional_plan"],
    },
    visibility: {
      status: "unavailable",
      reason: "service_unconfigured",
      claimClassesForbidden: ["user_visibility"],
    },
    topMistakeRank: 1,
    intelligenceRank: null,
    ...over,
  };
}

export function makeContract(insights: InsightContract[]): CoachContract {
  return {
    version: "1.0",
    contractId: "deadbeefdeadbeef",
    builtAtMs: 0,
    buildMs: 0,
    game: {
      pgnHeaders: {},
      playerColor: "w",
      moveCount: 15,
      totalHalfMoves: 30,
      replayedPlies: 30,
      historyTruncated: false,
      resultText: "In progress",
      finalFen: "3q2k1/6p1/8/8/3BP3/8/8/6K1 b - - 0 11",
      finalMaterial: "Material: Equal material",
      skillLevel: "intermediate",
      userRating: 1500,
      username: null,
      accuracy: null,
      estimatedElo: null,
      hasGameEval: true,
      moveHistory: [],
    },
    evalIntegrity: {
      sentinelPlies: [],
      sanTruncatedAtPly: null,
      minDepth: 12,
      multiPv: 2,
      suspectMixedSignMate: false,
    },
    insights,
    moveTable: [],
    finalAnnotation: null,
    finalRelational: null,
    persona: { personalityId: null },
  };
}
