import { QualitativeBand } from "./qualitativeBands";

export type CheckName =
  | "eval_mismatch_numeric"
  | "eval_mismatch_qualitative"
  | "feature_citation_unsupported"
  | "scout_citation_unsupported"
  | "user_history_citation_unsupported"
  | "parser_failure";

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
  | "skip_non_anchored_category";

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
  claim_class: "evaluative" | "metaphorical" | "conditional";
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
  claim_class: "factual_delta_claim" | "qualitative_commentary" | "conditional_speculation";
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
