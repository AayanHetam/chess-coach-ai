/**
 * Output referee v1 — the BLOCKING-GRADE per-insight checks (PR-CI-3,
 * CONTRACT_INVERSION_PLAN.md §4 checks 2–6).
 *
 * Relationship to refereeChecks.ts (PR-CI-2): that module is the
 * MEASUREMENT-widened form (BEFORE-baseline comparability); this module is
 * what serving wires in. The tokenizer/whitelist/check machinery is
 * IMPORTED from refereeChecks — one grammar, never copy-pasted — with two
 * blocking-grade differences:
 *
 *  1. Hypothetical lines use the plan-§4.3 STRICT rule (PV *prefix* from the
 *     card's position) instead of the measurement-widened contiguous-window
 *     rule. Strict failures that the widened rule would accept are downgraded
 *     to warn and tagged `wouldPassWidenedWindow` — the exact telemetry the
 *     CI-4/5 30-game false-positive measurement arms on.
 *  2. Stage-9 claim-class scanners (mateInN / materialWin / positionalClaim /
 *     userVisibility) run against a per-insight VoterSnapshot synthesized
 *     from THIS insight's contract fields — fixing the last-move anchoring
 *     that forced warn-only on game_review (plan §4 check 5).
 *
 * Severity policy (v1, log-only until CI-4 arms the ladder):
 *  - eval displays / SAN whitelist / tactical keywords → error
 *  - strict-prefix hypothetical-line failures that pass the widened window →
 *    warn (measurement candidate, never armed before the 30-game set)
 *  - forbidden claims: positional_plan / endgame_wdl → error;
 *    user_visibility → warn — STANDING PROHIBITION (plan §4 precision
 *    discipline: "obvious" checks stay warn/log-only in every phase)
 *  - stage-9 issues keep their validator-assigned severity, except
 *    user_visibility which is forced to warn (same prohibition)
 *  - relational contradictions (chess.js oracle) → error
 *
 * Everything deterministic lives in refereeInsight() — pure CPU, budgeted
 * under the plan-§5 block-hold gate (p95 < 100ms, perf-tested). The one
 * Haiku call (relational claim extraction, structured output per tech-lead
 * decision #6) lives in refereeInsightRelational(), bounded by
 * MAX_RELATIONAL_PARSES_PER_REVIEW.
 */
import {
  validateMateInN,
  validateMaterialWin,
  validatePositionalClaim,
  validateUserVisibility,
  validateRelationalClaim,
} from "@/lib/mastermind/validators";
import type { VoterSnapshot } from "@/lib/mastermind/validators";
import type { ValidatorIssue, ValidatorResult } from "@/lib/mastermind/validators/types";
import type { ParserCall } from "@/lib/mastermind/validators/evalClaim";
import {
  checkEvalDisplays,
  checkForbiddenClaims,
  checkSanWhitelist,
  checkTacticalKeywords,
} from "./refereeChecks";
import type { RefereeViolation } from "./refereeChecks";
import type { CoachContract, InsightContract } from "./types";

// ── Result types ────────────────────────────────────────────────────────────
export type RefereeSeverity = "error" | "warn";

export interface RefereeFinding {
  /** Which check fired: the four deterministic contract checks, the four
   * per-insight Stage-9 scanners, or the relational-claim oracle. */
  check:
    | "eval_display"
    | "san_whitelist"
    | "tactical_keyword"
    | "forbidden_claim"
    | "stage9_user_visibility"
    | "stage9_positional_claim"
    | "stage9_mate_in_n"
    | "stage9_material_win"
    | "relational_claim";
  severity: RefereeSeverity;
  /** RefereeViolationCategory for contract checks; check_name for validator
   * issues. */
  category: string;
  span: string;
  detail: string;
  /** See refereeChecks.RefereeViolation.wouldPassWidenedWindow. */
  wouldPassWidenedWindow?: boolean;
}

export interface InsightRefereeResult {
  factIdPrefix: string;
  findings: RefereeFinding[];
  errorCount: number;
  warnCount: number;
  /** Wall-clock ms of the deterministic pass — the plan-§5 block-hold cost. */
  elapsedMs: number;
}

/** Plan §8 cost table: ~8 Haiku claim parses per review, bounded hard. */
export const MAX_RELATIONAL_PARSES_PER_REVIEW = 8;

// ── Per-insight VoterSnapshot shim (plan §4 check 5) ────────────────────────
/**
 * Synthesize the Stage-9 VoterSnapshot from THIS insight's contract fields.
 * Every input is per-insight (fenBefore-anchored), so the scanners finally
 * run at full precision on multi-insight game_review prose. Degraded
 * sources contribute null exactly as an unconsulted source does today —
 * their claimClassesForbidden are enforced separately by
 * checkForbiddenClaims.
 */
export function buildVoterSnapshotForInsight(
  insight: InsightContract,
  userRating: number | null,
): VoterSnapshot {
  const sfCp = insight.evalBefore.sentinel ? null : insight.evalBefore.cp;
  const sfMate = insight.evalBefore.sentinel ? null : insight.evalBefore.mate;
  return {
    confidence: {
      user_visibility: insight.voterConfidence.user_visibility,
      positional_plan: insight.voterConfidence.positional_plan,
      mate_in_n: insight.voterConfidence.mate_in_n,
      material_win: insight.voterConfidence.material_win,
    },
    maiaProb: insight.visibility.status === "ok" ? insight.visibility.value.probPlaysBest : null,
    userRating,
    sfCp,
    sfMate,
    lc0Cp: insight.lc0.status === "ok" ? insight.lc0.value.evalCp : null,
    syzygyDtm: insight.syzygy.status === "ok" ? insight.syzygy.value.dtmMoves : null,
    positionConfidence: insight.positionConfidence,
  };
}

// ── Severity mapping ────────────────────────────────────────────────────────
function severityForViolation(v: RefereeViolation): RefereeSeverity {
  if (v.category === "hypothetical_line_off_contract" && v.wouldPassWidenedWindow) {
    return "warn"; // widened-window candidate — the CI-4/5 measurement class
  }
  if (v.category === "forbidden_claim_present" && v.claimClass === "user_visibility") {
    return "warn"; // standing prohibition — never error in any phase
  }
  return "error";
}

function violationToFinding(v: RefereeViolation): RefereeFinding {
  return {
    // The blocking referee only ever feeds violations from checks 2-5; the
    // measurement-only precision-pack checks (pv_truncation/mobility_claims)
    // never reach it, so the narrowing cast is sound.
    check: v.check as RefereeFinding["check"],
    severity: severityForViolation(v),
    category: v.category,
    span: v.span,
    detail: v.detail,
    ...(v.wouldPassWidenedWindow !== undefined
      ? { wouldPassWidenedWindow: v.wouldPassWidenedWindow }
      : {}),
  };
}

function issueToFinding(
  check: RefereeFinding["check"],
  issue: ValidatorIssue,
  forceWarn: boolean,
): RefereeFinding {
  return {
    check,
    severity: forceWarn ? "warn" : issue.severity === "error" ? "error" : "warn",
    category: issue.check_name,
    span: issue.llm_span,
    detail: issue.detail,
  };
}

// ── The deterministic referee (checks 2–5, pure CPU) ────────────────────────
export interface RefereeInsightOpts {
  userRating: number | null;
  correlationId: string;
  playerPerspective?: "white" | "black";
  /**
   * PRECISION PACK fix 7: when provided, the eval-display check licenses
   * against contract-GLOBAL facts (all insights + move table) instead of the
   * insight-local pools — the 30-game FP measurement adjudicated 2/2
   * insight-local eval_display fires as licensed by another insight's facts.
   */
  contract?: CoachContract;
}

export function refereeInsight(
  prose: string,
  insight: InsightContract,
  opts: RefereeInsightOpts,
): InsightRefereeResult {
  const t0 = Date.now();
  const findings: RefereeFinding[] = [];

  // Checks 2–4 (plan §4): eval displays, SAN/square whitelist (STRICT
  // hypothetical-line prefix rule), tactical keywords, forbidden claims.
  for (const v of checkEvalDisplays(prose, insight, opts.contract)) findings.push(violationToFinding(v));
  for (const v of checkSanWhitelist(prose, insight, { hypotheticalRule: "prefix" }))
    findings.push(violationToFinding(v));
  // ROUND 2: contract threading gives the keyword check its game-history
  // licenses (king-context "trapped" needs the game's mate — fix 4b).
  for (const v of checkTacticalKeywords(prose, insight, opts.contract))
    findings.push(violationToFinding(v));
  for (const v of checkForbiddenClaims(prose, insight, opts.contract))
    findings.push(violationToFinding(v));

  // Check 5: Stage-9 scanners on the per-insight contract-derived snapshot.
  const snapshot = buildVoterSnapshotForInsight(insight, opts.userRating);
  const ctx = {
    llmResponse: prose,
    fen: insight.fenBefore,
    moveSan: insight.playedSan,
    playerPerspective: opts.playerPerspective,
    correlationId: opts.correlationId,
  };
  const userVis = validateUserVisibility({
    ...ctx,
    maiaProb: snapshot.maiaProb,
    userRating: snapshot.userRating,
  });
  const positional = validatePositionalClaim({
    ...ctx,
    positional_plan: snapshot.confidence.positional_plan,
    sfCp: snapshot.sfCp,
    lc0Cp: snapshot.lc0Cp,
  });
  const mate = validateMateInN({
    ...ctx,
    syzygyDtm: snapshot.syzygyDtm,
    sfMate: snapshot.sfMate,
    mate_in_n: snapshot.confidence.mate_in_n,
  });
  const material = validateMaterialWin({
    ...ctx,
    material_win: snapshot.confidence.material_win,
    sfCp: snapshot.sfCp,
  });
  // userVisibility forced to warn (standing prohibition); others keep their
  // validator-assigned severity.
  for (const i of userVis.issues) findings.push(issueToFinding("stage9_user_visibility", i, true));
  for (const i of positional.issues)
    findings.push(issueToFinding("stage9_positional_claim", i, false));
  for (const i of mate.issues) findings.push(issueToFinding("stage9_mate_in_n", i, false));
  for (const i of material.issues) findings.push(issueToFinding("stage9_material_win", i, false));

  return {
    factIdPrefix: insight.factIdPrefix,
    findings,
    errorCount: findings.filter((f) => f.severity === "error").length,
    warnCount: findings.filter((f) => f.severity === "warn").length,
    elapsedMs: Date.now() - t0,
  };
}

// ── Check 6: relational claims (Haiku structured output, bounded) ──────────
export interface RefereeRelationalOpts {
  correlationId: string;
  /** Test seam — injected fake parser; defaults to the structured-output
   * Haiku call (defaultRelationalParserCall, json_schema-constrained). */
  parseCall?: ParserCall;
  signal?: AbortSignal;
}

export interface RelationalRefereeResult {
  factIdPrefix: string;
  findings: RefereeFinding[];
  costUsd: number;
  /** Raw validator result for telemetry consumers. */
  validator: ValidatorResult;
}

/**
 * Plan §4 check 6: relational-claim extraction (Haiku, structured output —
 * regex-only replacement explicitly rejected: relational phrasings without
 * square tokens are the documented 2×2 leak class) verified against the
 * chess.js oracle at THIS insight's OWN fenBefore. The caller bounds call
 * count via MAX_RELATIONAL_PARSES_PER_REVIEW.
 */
export async function refereeInsightRelational(
  prose: string,
  insight: InsightContract,
  opts: RefereeRelationalOpts,
): Promise<RelationalRefereeResult> {
  const validator = await validateRelationalClaim({
    llmResponse: prose,
    fen: insight.fenBefore,
    correlationId: opts.correlationId,
    parseCall: opts.parseCall,
    signal: opts.signal,
  });
  return {
    factIdPrefix: insight.factIdPrefix,
    findings: validator.issues.map((i) => issueToFinding("relational_claim", i, false)),
    costUsd: validator.costUsd,
    validator,
  };
}
