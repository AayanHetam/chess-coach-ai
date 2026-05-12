import { QualitativeBand } from "./qualitativeBands";

export type CheckName =
  | "eval_mismatch_numeric"
  | "eval_mismatch_qualitative"
  | "feature_citation_unsupported"
  | "parser_failure";

export type FireReason =
  | "numeric_diff_exceeds_threshold"
  | "qualitative_band_flip"
  | "unsupported_citation"
  | "parser_low_confidence"
  | "parser_json_invalid"
  | "regenerate_invoked"
  | "fallback_used"
  | "passed";

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
