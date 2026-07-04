/**
 * Relational hallucination scorer (Phase 0). Combines the LLM claim extractor
 * with the deterministic verifier to produce, for one coach response:
 *   - falseRelationalClaims  = board-contradictions (the OBJECTIVE.md target)
 *   - trueClaims             = concrete claims that hold (used for the
 *                              true-claim-suppression guardrail later)
 *   - unverifiable           = claims we cannot mechanically check (NOT counted
 *                              as contradictions)
 *
 * The extractor is injectable so the tally logic can be unit-tested with no
 * network call.
 */
import { verifyRelationalClaim, type RelationalClaim } from "./relationalVerify";
import { extractRelationalClaims, type ExtractArgs, type ExtractResult } from "./relationalExtract";
import type { CostTracker } from "./costTracker";

export interface ClaimDetail {
  rawText: string;
  kind: RelationalClaim["kind"];
  verdict: "holds" | "contradicted" | "unverifiable";
  reason: string;
}

export interface ScoreResult {
  extractorOk: boolean;
  extractorError?: string;
  totalClaims: number;
  falseRelationalClaims: number;
  trueClaims: number;
  unverifiable: number;
  details: ClaimDetail[];
}

export interface ScoreArgs {
  apiKey: string;
  coachText: string;
  /** the FEN the coach analysis is about (e.g. the checkpoint's fenAfter) */
  fen: string;
  costTracker?: CostTracker;
  /** injectable for tests; defaults to the real Haiku extractor */
  extract?: (args: ExtractArgs) => Promise<ExtractResult>;
  /**
   * ply (1-indexed) → FEN map for the game being reviewed.
   * When a claim carries moveRefPly, the scorer uses fenMap[moveRefPly] as the
   * root FEN for that claim instead of args.fen. This removes position-anchoring
   * artifacts where past-position claims were checked against the final board.
   */
  fenMap?: Record<number, string>;
  /**
   * SAN move history (index 0 = ply 1) forwarded to the extractor so it can
   * populate moveRefPly on past-position claims.
   */
  moveHistory?: string[];
}

export async function scoreCoachResponse(args: ScoreArgs): Promise<ScoreResult> {
  const extractFn = args.extract ?? extractRelationalClaims;
  const ext = await extractFn({
    apiKey: args.apiKey,
    coachText: args.coachText,
    fen: args.fen,
    costTracker: args.costTracker,
    moveHistory: args.moveHistory,
  });

  if (!ext.ok) {
    return {
      extractorOk: false,
      extractorError: ext.errorMessage,
      totalClaims: 0,
      falseRelationalClaims: 0,
      trueClaims: 0,
      unverifiable: 0,
      details: [],
    };
  }

  const details: ClaimDetail[] = [];
  let falseRelationalClaims = 0;
  let trueClaims = 0;
  let unverifiable = 0;

  for (const claim of ext.claims) {
    // Use the ply-anchored FEN when the claim names a specific past position.
    const verifyFen =
      claim.moveRefPly !== undefined && args.fenMap?.[claim.moveRefPly]
        ? args.fenMap[claim.moveRefPly]
        : args.fen;
    const { verdict, reason } = verifyRelationalClaim(claim, verifyFen);
    details.push({ rawText: claim.rawText, kind: claim.kind, verdict, reason });
    if (verdict === "contradicted") falseRelationalClaims++;
    else if (verdict === "holds") trueClaims++;
    else unverifiable++;
  }

  return {
    extractorOk: true,
    totalClaims: ext.claims.length,
    falseRelationalClaims,
    trueClaims,
    unverifiable,
    details,
  };
}

export interface FixtureScore extends ScoreResult {
  fixtureId: string;
  fen: string;
}

export interface BaselineReport {
  fixtures: number;
  fixturesWithFalseClaims: number;
  totalFalseRelationalClaims: number;
  totalTrueClaims: number;
  totalUnverifiable: number;
  extractorFailures: number;
  perFixture: FixtureScore[];
}

/** Aggregate per-fixture scores into the report the early checkpoint reports. */
export function aggregate(scores: FixtureScore[]): BaselineReport {
  return {
    fixtures: scores.length,
    fixturesWithFalseClaims: scores.filter((s) => s.falseRelationalClaims > 0).length,
    totalFalseRelationalClaims: scores.reduce((n, s) => n + s.falseRelationalClaims, 0),
    totalTrueClaims: scores.reduce((n, s) => n + s.trueClaims, 0),
    totalUnverifiable: scores.reduce((n, s) => n + s.unverifiable, 0),
    extractorFailures: scores.filter((s) => !s.extractorOk).length,
    perFixture: scores,
  };
}
