/**
 * CoachContract v1.0 — the typed fact contract the Contract Inversion program
 * builds around (CONTRACT_INVERSION_PLAN.md §2, PR-CI-1).
 *
 * PR-CI-1 is a SHADOW extraction: every field here is populated from data
 * `buildGameContext` already computed on the game-review path, and the legacy
 * prompt is re-rendered FROM this object byte-identically
 * (serialize.ts / renderLegacyPrompt, pinned by the snapshot suite).
 *
 * HONESTY NOTES vs the plan §2 sketch (deviations are documented, not silent):
 *  - `syzygy` is ALWAYS `{status:"unavailable", reason:"not_applicable"}` on
 *    the game path — the Lichess tablebase is only consulted on position-only
 *    analysis (route.ts POSITION ANALYSIS branch), never per-insight here.
 *  - `pieceRoleChanges` is always `[]` — the game path never runs
 *    classifyPieceRoles/diffPieceRoles today. The field exists so CI-3+ can
 *    populate it without a schema break.
 *  - `threats` come from buildThreatTree(fenBEFORE, 2) — the plan sketch said
 *    fenAfter, but the shipping code (buildTeachingSpine) uses fenBefore.
 *  - `concept` (singular, in the sketch) is `concepts[]` here: the real
 *    producer (buildConceptLayer) renders up to 3 detected concepts.
 *  - motif/relational `sayable` strings live in `sayables` (a parallel map on
 *    the insight) rather than on the source objects — per PR-CI-1 scope,
 *    relationalFactsBuilder.ts and tactics/ are NOT modified in this PR, and
 *    decorating the motif objects in place would leak `sayable` into the
 *    voter's JSON prompt block (a byte change).
 *  - `persona.personalityId` is null on this path: buildGameContext does not
 *    receive personalityId today (CI-4 threads it when the verbalizer lands).
 */
import type { AnyMotif } from "@/lib/tactics/types";
import type { IntentFacts } from "@/lib/intent/types";
import type { RelationalFactsBlock } from "@/lib/relational/relationalFactsBuilder";
import type { ThreatNode } from "@/lib/mastermind/threatTree";
import type { PositionFeatureDelta } from "@/lib/mastermind/featureDelta";
import type { RoleChange } from "@/lib/mastermind/pieceRoles";
import type { VoterConfidence } from "@/lib/grounding/voter";
import type { PositionConfidence } from "@/lib/grounding/positionConfidence";
import type { EvalIntegrity } from "./gameEvalSchema";

export const CONTRACT_VERSION = "1.0" as const;

// ── Provenance: four-level confidence, honestly labeled ────────────────────
export type FactSource =
  | "chessjs_oracle"
  | "stockfish_client"
  | "motif_detector"
  | "chessdb"
  | "lc0"
  | "maia"
  | "syzygy"
  | "voter_derived";

export type FactConfidence =
  | "oracle_verified" // chess.js derivation, Syzygy ≤7 men — mathematically exact
  | "engine_verified" // SF/chessdb/Lc0 numeric output, depth recorded
  | "heuristic" // motif detector (escapability = 1-ply SEE — NEVER labeled oracle), Maia probs
  | "client_reported"; // gameEval numbers, PGN headers, self-reported rating — unverified input

export interface Provenance {
  source: FactSource;
  confidence: FactConfidence;
  depth?: number;
  fetchedAtMs?: number;
}

// ── Degraded<T>: unavailability is a first-class, referee-visible state ────
// The structural fix for the positionalClaim/Lc0 silent-null false-fire class
// (audit #11) and the Maia no-op (#15). Never a silent null: an unavailable
// source mechanically carries the claim classes the referee must forbid.
export type ClaimClass =
  | "tactical_motif"
  | "material_win"
  | "mate_in_n"
  | "positional_plan"
  | "endgame_wdl"
  | "user_visibility"
  | "relational"
  | "eval_numeric"
  | "hypothetical_line";

export type Degraded<T> =
  | { status: "ok"; value: T; provenance: Provenance }
  | {
      status: "unavailable";
      reason:
        | "service_unconfigured"
        | "service_error"
        | "timeout"
        | "out_of_range"
        | "not_applicable";
      claimClassesForbidden: ClaimClass[];
    };

// ── Evals: display string precomputed; mate NEVER flattened to ±9999 here ──
export interface EvalFact {
  /** Centipawns, White-centric (parseResults normalization); null when absent. */
  cp: number | null;
  /** Signed mate distance, White-centric; null when absent. */
  mate: number | null;
  depth: number;
  /** PR-A {cp:0, depth:0} client-timeout case flagged, not forged. */
  sentinel: boolean;
  /**
   * Canonical rendering: "+1.38" | "-0.42" | "M+5" | "M-3" |
   * "engine data unavailable" (sentinel) | "" (no numeric eval present).
   * The CI-4 verbalizer copies this verbatim; the legacy renderer derives its
   * site-specific variants from the structured fields (byte-fidelity first).
   */
  display: string;
  provenance: Provenance;
}

export interface LineFact {
  /** e.g. "M3.pv0" — cite-token id for the referee (CI-3+). */
  id: string;
  /** SAN conversion of the PV (may be shorter than pvUci when replay fails). */
  san: string[];
  /** Raw client UCI pv — kept because the legacy renderer falls back to
   * pvUci[0] when SAN conversion yields nothing. */
  pvUci: string[];
  eval: EvalFact;
  isPlayedLine: boolean;
}

// ── Branch points (both legacy styles) ─────────────────────────────────────
/** TOP MISTAKES style: best line vs the line starting with the PLAYED move. */
export interface BranchPointFact {
  /** 0-based index where the lines diverge (render: "move ${atPly+1}"). */
  atPly: number;
  sharedSan: string[];
  bestContinues: string;
  playedGoes: string;
}

/** CHESS INTELLIGENCE LAYER style: best line vs the SECOND candidate line. */
export interface IntelBranchPointFact {
  sharedCount: number;
  sharedSan: string[];
  /** May be null when the divergence index runs past a line's end (legacy renders "?"). */
  bestContinues: string | null;
  altContinues: string | null;
}

export interface ConceptFact {
  id: string;
  name: string;
  tier: string;
  confidence: number;
  definition: string;
  evidence: string;
}

/** Canonical one-line English renderings — fuel for CI-3/4 template-fallback
 * cards and referee reference matching. Parallel to the source arrays. */
export interface InsightSayables {
  /** Parallel to `motifs`. */
  motifs: string[];
  /** Parallel to `relational.captures` / `.hanging` / `.pins` when present. */
  relationalCaptures: string[];
  relationalHanging: string[];
  relationalPins: string[];
}

export interface InsightContract {
  /** "M3" (top-mistake rank) or "I2" (intelligence-only) — cite-token prefix. */
  factIdPrefix: string;
  /** 0-based half-move index into moveHistory. */
  ply: number;
  moveNumber: number;
  color: "w" | "b";
  colorName: "White" | "Black";
  playedSan: string;
  /** From the mistake-detection loop (uciToSan of evalBefore.bestMove;
   * uciToSan falls back to the raw UCI on illegal input). null = absent
   * (legacy renders "N/A"). */
  bestSan: string | null;
  /** Derived from dropCp with the legacy thresholds (300/150). */
  classification: "blunder" | "mistake" | "inaccuracy";
  severityDropPawns: number;
  /** Exact centipawn drop the selection used (mates flattened to ±9999 in
   * the flat fields below, exactly as the legacy loop computed them). */
  severityDropCp: number;
  /** Legacy ±9999-flattened numbers — the TOP MISTAKES header renders these. */
  cpBeforeFlat: number;
  cpAfterFlat: number;
  fenBefore: string;
  fenAfter: string;
  evalBefore: EvalFact;
  evalAfter: EvalFact;
  /** ALL multipv lines for the position before the move (including ones with
   * empty PVs — computeCandidateGap reads lines[0]/[1] regardless). */
  lines: LineFact[];
  branchPoint: BranchPointFact | null;
  intelBranchPoint: IntelBranchPointFact | null;
  /** describeMoveChange(fenBefore, playedSan); "" when nothing to say. */
  changeDescription: string;
  /** detectMotifs(fenBefore, playedSan) — confirmed AND refuted (heuristic
   * confidence — 1-ply SEE escapability, never narrated as board truth). */
  motifs: AnyMotif[];
  /**
   * PRECISION PACK fix 4 — REFEREE LICENSE POOL ONLY, never rendered, never
   * serialized to the verbalizer (stripped in serializeForVerbalizer), never
   * fed to the voter. Motifs detected beyond the fenBefore+playedSan scope:
   * a static both-color scan of fenAfter (pins/hanging/trapped the played
   * move didn't create) plus detectMotifs over the first 2 plies of each
   * contract PV. Closes the builder.ts scope gap behind the adjudicated
   * tactical-keyword FPs (#1/#3/#6/#11/#12/#16/#22 in
   * contract-referee-fp-30game). Optional so older fixtures/factories and
   * cached contracts stay valid.
   */
  motifLicense?: AnyMotif[];
  allowedTacticalKeywords: string[];
  voterConfidence: VoterConfidence;
  positionConfidence: PositionConfidence;
  /** The voter's pre-rendered grounding block (voter.ts owns this
   * sub-template; the route-level templates live in serialize.ts). */
  groundingContext: string;
  sayables: InsightSayables;
  /** Intelligence-layer facts — null/[] for insights only in the top-10. */
  concepts: ConceptFact[];
  engineIdea: string | null;
  relational: RelationalFactsBlock | null;
  /** compute_feature_delta(fenBefore, fenAfter, {pv}) — null when the
   * teaching-spine computation threw (legacy skips the whole spine). */
  featureDelta: PositionFeatureDelta | null;
  /** buildThreatTree(fenBefore, 2) — see honesty note (fenBefore, not after). */
  threats: ThreatNode[] | null;
  /** Always [] on the game path today — see honesty note. */
  pieceRoleChanges: RoleChange[];
  // Degraded per-insight sources (post PR-A labels)
  chessdb: Degraded<{ evalCp: number; outcomeText: string }>;
  syzygy: Degraded<{ category: string; dtmMoves: number | null }>;
  lc0: Degraded<{ evalCp: number; agreesWithSf: boolean }>;
  visibility: Degraded<{ probPlaysBest: number; level: string }>;
  /** 1-based rank in the legacy TOP MISTAKES list; null = not selected. */
  topMistakeRank: number | null;
  /** 1-based rank in the legacy CHESS INTELLIGENCE top-3; null = not selected. */
  intelligenceRank: number | null;
}

export interface MoveTableEntry {
  ply: number;
  moveNumber: number;
  color: "w" | "b";
  san: string;
  /** null when the game has no engine eval (legacy computes per-move FENs
   * only inside the gameEval branch). */
  fenBefore: string | null;
  fenAfter: string | null;
  changeDescription: string | null;
  classification: string | null;
  evalAfter: EvalFact | null;
  /** The "Best was:" block for this ply; null when the engine best equals the
   * played move or no best move was reported. */
  bestWas: {
    san: string;
    line: { san: string[]; pvUci: string[]; eval: EvalFact } | null;
  } | null;
}

/** One carded ply's intent facts, plus which tier of engine data produced them. */
export interface IntentSummary {
  ply: number;
  playedSan: string;
  /** "tier0" = gameEval only; "tier1" = a null-move probe was paid for. */
  tier: "tier0" | "tier1";
  facts: IntentFacts;
}

export interface CoachContract {
  version: typeof CONTRACT_VERSION;
  /** === contextId: reuses generateContextId(moveHistory, fen, playerColor,
   * uid) — ONE identity for response cache, chat context, and telemetry.
   * PR-CI-2 closed the CI-1 identity gap: the route now threads its
   * request-body `fen` + `playerColor || "w"` defaulting via
   * BuildCoachContractArgs.identity, so contractId ≡ the route's contextId
   * exactly (unit-tested against generateContextId in contract.test.ts). */
  contractId: string;
  builtAtMs: number;
  /** CPU-only build time in ms — the grounding-fetch network wait is
   * excluded per the plan §5 gate ("contract build over shared fetches").
   * NOTE: this still includes chess.js compute the LEGACY path already paid
   * (threat trees / feature deltas dominate on intel-heavy games). */
  buildMs: number;
  game: {
    /** Only truthy header fields, keyed by the GameHeadersInput field names. */
    pgnHeaders: Record<string, string>;
    /** Raw player color string as the route passes it — only === "w" is
     * meaningful to the legacy renderer. */
    playerColor: string;
    moveCount: number;
    totalHalfMoves: number;
    replayedPlies: number;
    historyTruncated: boolean;
    resultText: "Checkmate" | "Stalemate" | "Draw" | "In progress";
    finalFen: string;
    /** Pre-rendered "Material: ..." line (getMaterialBalance). */
    finalMaterial: string;
    skillLevel: "beginner" | "intermediate" | "advanced";
    userRating: number | null;
    username: string | null;
    accuracy: { white: number; black: number } | null;
    estimatedElo: { white: number; black: number } | null;
    /** gameEval?.positions non-empty — gates the MOVE-BY-MOVE/TOP MISTAKES
     * sections vs the "No Stockfish evaluation data" note. */
    hasGameEval: boolean;
    moveHistory: string[];
  };
  /**
   * What each carded move was FOR — see src/lib/intent.
   *
   * DARK by default and gated on INTENT_FACTS_ENABLED. Present for telemetry
   * and offline comparison only: `serializeForVerbalizer` strips it, so the
   * verbalizer prompt (and therefore its cache prefix and every byte-equality
   * snapshot) is identical whether this is populated or absent. Nothing may
   * render from it until it has been measured against served output.
   */
  intent?: IntentSummary[];
  /** Real zod-backed sanity layer over the z.any() gameEval (audit #5):
   * flags, never mutates, never rejects. */
  evalIntegrity: EvalIntegrity;
  /** Union of the legacy top-10 user mistakes and intelligence top-3,
   * ordered by ply; the rank fields carry the legacy render orders. */
  insights: InsightContract[];
  moveTable: MoveTableEntry[];
  /** annotationToPromptContext(annotatePosition(finalFen)); null when it
   * threw (legacy skips the section entirely on throw). */
  finalAnnotation: string | null;
  /** buildRelationalFacts(finalFen); null when it threw. */
  finalRelational: RelationalFactsBlock | null;
  /** Cache-key hygiene only — persona TEXT stays in the system prompt. */
  persona: { personalityId: string | null; username?: string };
}
