// Streaming Stage 9 validator runner — log-only, matches motifGrounding
// streaming-branch pattern (PR #121 commit 1820640).
//
// Live user traffic on /api/enhanced-analysis is hardcoded to stream:true
// (AICoachChat:2492). The non-streaming validator pipeline therefore never
// runs in prod. The streaming branches each post-process the raw model
// output through deterministic checks; this helper bundles the four Stage 9
// validators into one call so each streaming branch needs only one site
// change instead of four.
//
// Log-only in v1 — fires emit a warn-level log line tagged with the
// branch ID; no regeneration, no SSE error. Matches PR #121's motifGrounding
// streaming integration exactly. v2 follow-up: surface fires into the
// per-position telemetry sink alongside the pipeline path.

import type { Logger } from "@/lib/logging/logger";
import {
  validateUserVisibility,
  validatePositionalClaim,
  validateMateInN,
  validateMaterialWin,
} from "./index";
import type { VoterSnapshot } from "./index";

export interface StreamingStage9Opts {
  llmResponse: string;
  voterSnapshot: VoterSnapshot;
  fen?: string;
  moveSan?: string;
  playerPerspective?: "white" | "black";
  correlationId: string;
  /** Branch tag for log aggregation (e.g., "stream-flagoff", "stream-flagon-pipeline"). */
  branch: string;
  /** Route-scope logger. */
  log: Logger;
}

/**
 * Run the four Stage 9 claim-class validators against a streaming response
 * and log any fires. Returns the validator results for callers that want
 * to also surface them in metadata.
 *
 * Errors inside any single validator are caught — Stage 9 validators are
 * pure string scans, but defense-in-depth (catch + log + continue) ensures
 * a validator bug never breaks streaming.
 */
export function runStreamingStage9Validators(opts: StreamingStage9Opts): {
  userVis: ReturnType<typeof validateUserVisibility>;
  positional: ReturnType<typeof validatePositionalClaim>;
  mate: ReturnType<typeof validateMateInN>;
  material: ReturnType<typeof validateMaterialWin>;
} | null {
  try {
    const ctx = {
      llmResponse: opts.llmResponse,
      fen: opts.fen,
      moveSan: opts.moveSan,
      playerPerspective: opts.playerPerspective,
      correlationId: opts.correlationId,
    };
    const userVis = validateUserVisibility({
      ...ctx,
      maiaProb: opts.voterSnapshot.maiaProb,
      userRating: opts.voterSnapshot.userRating,
    });
    const positional = validatePositionalClaim({
      ...ctx,
      positional_plan: opts.voterSnapshot.confidence.positional_plan,
      sfCp: opts.voterSnapshot.sfCp,
      lc0Cp: opts.voterSnapshot.lc0Cp,
    });
    const mate = validateMateInN({
      ...ctx,
      syzygyDtm: opts.voterSnapshot.syzygyDtm,
      sfMate: opts.voterSnapshot.sfMate,
      mate_in_n: opts.voterSnapshot.confidence.mate_in_n,
    });
    const material = validateMaterialWin({
      ...ctx,
      material_win: opts.voterSnapshot.confidence.material_win,
      sfCp: opts.voterSnapshot.sfCp,
    });

    if (!userVis.passed) {
      opts.log.warn("stage9_user_visibility_failed", {
        issues: userVis.issues.map((i) => i.llm_span),
        maia_prob: opts.voterSnapshot.maiaProb,
        user_rating: opts.voterSnapshot.userRating,
        correlationId: opts.correlationId,
        branch: opts.branch,
      });
    }
    if (!positional.passed) {
      opts.log.warn("stage9_positional_claim_failed", {
        issues: positional.issues.map((i) => i.llm_span),
        positional_plan: opts.voterSnapshot.confidence.positional_plan,
        sf_cp: opts.voterSnapshot.sfCp,
        lc0_cp: opts.voterSnapshot.lc0Cp,
        any_escalated: positional.issues.some((i) => i.severity === "error"),
        correlationId: opts.correlationId,
        branch: opts.branch,
      });
    }
    if (!mate.passed) {
      opts.log.warn("stage9_mate_claim_failed", {
        issues: mate.issues.map((i) => ({ span: i.llm_span, check: i.check_name })),
        mate_in_n: opts.voterSnapshot.confidence.mate_in_n,
        syzygy_dtm: opts.voterSnapshot.syzygyDtm,
        sf_mate: opts.voterSnapshot.sfMate,
        correlationId: opts.correlationId,
        branch: opts.branch,
      });
    }
    if (!material.passed) {
      opts.log.warn("stage9_material_win_failed", {
        issues: material.issues.map((i) => i.llm_span),
        material_win: opts.voterSnapshot.confidence.material_win,
        sf_cp: opts.voterSnapshot.sfCp,
        any_escalated: material.issues.some((i) => i.severity === "error"),
        correlationId: opts.correlationId,
        branch: opts.branch,
      });
    }

    return { userVis, positional, mate, material };
  } catch (err) {
    opts.log.warn("stage9_streaming_validator_crashed", {
      err: err instanceof Error ? err.message : String(err),
      correlationId: opts.correlationId,
      branch: opts.branch,
    });
    return null;
  }
}
