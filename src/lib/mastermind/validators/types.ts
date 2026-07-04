import { QualitativeBand } from "./qualitativeBands";

export type CheckName =
  | "eval_mismatch_numeric"
  | "eval_mismatch_qualitative"
  | "feature_citation_unsupported"
  | "scout_citation_unsupported"
  | "user_history_citation_unsupported"
  | "parser_failure"
  | "motif_grounding_ungrounded"
  // ─────────────────────────────────────────────────────────────────────
  // Stage 9 — claim-class validators (PR_STAGE9_VALIDATORS_PLAN.md)
  // Enforce the suppression rules the voter already emits into the prompt.
  // All four are pure string-scan validators (no parser LLM, costUsd = 0),
  // modeled on motifGrounding.ts.
  // ─────────────────────────────────────────────────────────────────────
  | "user_visibility_overclaim"
  | "positional_claim_unsupported"
  | "mate_claim_unsupported"
  | "mate_distance_incorrect"
  | "material_win_unsupported"
  // ─────────────────────────────────────────────────────────────────────
  // Lever 2 relational-claim validator (Phase 2)
  // ─────────────────────────────────────────────────────────────────────
  | "relational_claim_contradicted";

export type FireReason =
  | "numeric_diff_exceeds_threshold"
  | "qualitative_band_flip"
  | "unsupported_citation"
  | "parser_low_confidence"
  | "parser_json_invalid"
  | "regenerate_invoked"
  | "fallback_used"
  | "passed"
  | "no_stockfish_eval"
  | "skip_non_anchored_category"
  // 2026-05-30 fix-historical-claims: parser identified a claim about
  // a PAST position state (claim_class === "historical" for evalClaim,
  // factual_delta_claim with temporal markers for featureCitation, etc.).
  // The validator can't time-travel to verify; skipping avoids false
  // positives on legitimate game-review prose ("White was winning at
  // move 24"). Emitted at info-level for observability.
  | "skip_historical_claim"
  | "tactical_claim_without_grounding"
  // ─────────────────────────────────────────────────────────────────────
  // Stage 9 — fire reasons for the four claim-class validators
  // ─────────────────────────────────────────────────────────────────────
  | "obviousness_claim_below_visibility_threshold"
  | "positional_overclaim_without_voter_high"
  | "positional_overclaim_against_lc0_veto"
  | "mate_claim_without_syzygy_or_sf_mate"
  | "mate_distance_off_by_more_than_one"
  | "material_claim_without_voter_med_or_high"
  | "material_claim_contradicts_stockfish"
  // ─────────────────────────────────────────────────────────────────────
  // Lever 2 relational-claim validator (Phase 2)
  // ─────────────────────────────────────────────────────────────────────
  | "relational_claim_contradicted"
  | "no_fen_to_verify";

export type FinalOutcome =
  | "passed_initial"
  | "passed_after_retry"
  | "fallback_used";

export interface ValidatorIssue {
  check_name: CheckName;
  severity: "error" | "warn";
  llm_span: string;
  expected: unknown;
  actual: unknown;
  detail: string;
  parser_confidence?: number;
}

export interface TelemetryEvent {
  check_name: string;
  fire_reason: FireReason;
  llm_span: string;
  expected: unknown;
  actual: unknown;
  retry_count: number;
  final_outcome: FinalOutcome | null;
  context: {
    fen?: string;
    move_san?: string;
    player_perspective?: "white" | "black";
    correlation_id: string;
  };
  timestamp_ms: number;
}

export interface ValidatorResult {
  issues: ValidatorIssue[];
  passed: boolean;
  telemetry: TelemetryEvent[];
  costUsd: number;
}

export interface ParsedEvalClaim {
  stated_band: QualitativeBand;
  stated_cp: number | null;
  supporting_spans: string[];
  confidence: number;
  // 2026-05-30 fix-historical-claims: "historical" added so the parser
  // can signal past-position-state claims (game-review prose recap).
  // Validators skip historical claims via skip_historical_claim
  // telemetry; see evalClaim.ts and FireReason in this file.
  claim_class: "evaluative" | "historical" | "metaphorical" | "conditional";
  perspective: "white" | "black" | "side_to_move" | "ambiguous";
}

export type FeatureClaimType =
  | "material_change"
  | "lost_piece"
  | "gained_piece"
  | "lost_bishop_pair"
  | "lost_knight_pair"
  | "king_safety_change"
  | "new_passed_pawn"
  | "lost_passed_pawn"
  | "new_outpost"
  | "lost_outpost"
  | "new_open_file"
  | "lost_open_file"
  | "new_isolated_pawn"
  | "new_doubled_pawn"
  | "new_backward_pawn"
  | "role_gained"
  | "role_lost"
  | "new_threat"
  | "resolved_threat"
  | "hanging_piece"
  | "now_defended";

export interface ParsedFeatureClaim {
  claim_text: string;
  claim_type: FeatureClaimType;
  expected_in_delta: {
    side?: "white" | "black";
    square?: string;
    piece?: "p" | "n" | "b" | "r" | "q" | "k";
    role?: string;
    direction?: "increase" | "decrease";
  };
  // 2026-05-30 fix-historical-claims: parser flags claims about a PRIOR
  // position state as "historical_state_claim" so the validator can skip
  // verification (the computed featureDelta is for THIS move only —
  // historical-state claims about earlier positions can't be verified
  // against it). Without this class, game-review recap prose ("you had
  // the bishop pair until move 18") false-positives as
  // feature_citation_unsupported.
  claim_class: "factual_delta_claim" | "historical_state_claim" | "qualitative_commentary" | "conditional_speculation";
  confidence: number;
}

export const PARSER_LOW_CONFIDENCE_THRESHOLD = 0.5;
export const EVAL_NUMERIC_THRESHOLD_CP = 150;

// ─────────────────────────────────────────────────────────────────────────
// Scout citation (Stage A.6 — PR_1C_SCOUT_CITATION_PLAN.md)
// ─────────────────────────────────────────────────────────────────────────

export type ScoutClaimType =
  // §3.1 Opening / prep (3)
  | "opponent_plays_opening"
  | "opponent_strength_opening"
  | "opponent_weakness_opening"
  // §3.2 Profile (8)
  | "archetype"
  | "profile_dimension"
  | "rating_by_timeclass"
  | "peak_rating"
  | "low_rating"
  | "latest_rating"
  | "recent_form_trend"
  | "phase_elo"
  // §3.3 Stalker (2)
  | "stalker_total"
  | "stalker_factor"
  // §3.4 Psychology (8)
  | "tilt_pattern"
  | "timeout_pattern"
  | "resign_pattern"
  | "checkmate_rate"
  | "quick_loss_pattern"
  | "long_game_pattern"
  | "streak_claim"
  | "avg_game_length"
  // §3.5 Rivals / collisions / novelty / checklist / recent-form (5)
  | "rival_record"
  | "collision_edge"
  | "novelty_finding"
  | "checklist_item"
  | "recent_form_bucket";

export type ScoutDimension = "ovr" | "atk" | "def" | "time" | "mind";
export type ScoutFactorId = "time_trouble" | "tilts" | "limited_rep" | "repetitive";
export type ScoutPhase = "opening" | "middle" | "endgame";
export type ScoutTimeClass = "bullet" | "blitz" | "rapid" | "classical" | "daily";

export interface ParsedScoutClaim {
  claim_text: string;
  claim_type: ScoutClaimType;
  expected_in_data: {
    opening_name?: string;
    opening_eco?: string;
    opponent_color?: "white" | "black";
    stated_pct?: number;
    stated_rating?: number;
    time_class?: ScoutTimeClass;
    stated_value?: number;
    stated_archetype?: string;
    dimension?: ScoutDimension;
    factor_id?: ScoutFactorId;
    phase?: ScoutPhase;
    rival_name?: string;
    your_color?: "white" | "black";
    novelty_game_id?: string;
    novelty_ply?: number;
    novelty_played_move?: string;
    checklist_title?: string;
    form_bucket_label?: string;
    stated_wins?: number;
    stated_draws?: number;
    stated_losses?: number;
  };
  claim_class:
    | "factual_scouting_claim"
    | "qualitative_commentary"
    | "conditional_speculation";
  confidence: number;
}

/**
 * Opportunity for the citation-rate denominator. Each "non-default" entry
 * in scout output counts as one opportunity. Local shape for Stage A.6;
 * Stage A.9's citationRate.ts widens this into a cross-source Opportunity
 * type that also covers feature_delta / user_history / jhamtani sources.
 */
export interface ScoutOpportunity {
  dataSource: "scout";
  claim_type: ScoutClaimType;
  /** Opaque pointer back to the source entry (for debugging/logging). */
  ref: unknown;
}

// ─────────────────────────────────────────────────────────────────────────
// User-history citation (Stage A.8 — PR_1C_USER_HISTORY_CITATION_PLAN.md)
// ─────────────────────────────────────────────────────────────────────────

export type UserHistoryClaimType =
  | "time_control_performance"
  | "opening_repertoire_performance"
  | "hours_played_claim";

export type DateRangeType =
  | "this_month"
  | "last_month"
  | "this_year"
  | "last_year"
  | "last_n_days"
  | "in_year"
  | "all_time";

export interface ParsedUserHistoryClaim {
  claim_text: string;
  claim_type: UserHistoryClaimType;
  expected_in_data: {
    // For time_control_performance:
    time_class?: ScoutTimeClass;
    specific_time_control?: string;
    stated_pct?: number;
    stated_metric?: "score_pct" | "win_rate";
    // For opening_repertoire_performance:
    opening_name?: string;
    opening_eco?: string;
    user_color?: "white" | "black";
    // For hours_played_claim:
    stated_count?: number;
    date_range_type?: DateRangeType;
    date_range_n?: number;
    date_range_year?: number;
  };
  claim_class:
    | "factual_user_history_claim"
    | "qualitative_commentary"
    | "conditional_speculation";
  confidence: number;
}

/**
 * Opportunity for the citation-rate denominator. Local Stage A.8 shape;
 * Stage A.9 widens into the cross-source Opportunity type.
 */
export interface UserHistoryOpportunity {
  dataSource: "user_history";
  claim_type: UserHistoryClaimType;
  ref: unknown;
}
