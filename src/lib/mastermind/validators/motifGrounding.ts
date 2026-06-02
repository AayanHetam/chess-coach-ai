import { TACTICAL_CLAIM_KEYWORDS } from "@/lib/tactics";
import type { AnyMotif } from "@/lib/tactics";
import { createTelemetryEvent } from "./telemetry";
import type { ValidatorResult } from "./types";

export interface MotifGroundingOpts {
  llmResponse: string;
  detectedMotifs: AnyMotif[];
  fen?: string;
  moveSan?: string;
  correlationId: string;
}

// Tactical keywords that require a confirmed motif to be present.
// These are exact substrings checked case-insensitively.
const FORBIDDEN_WITHOUT_MOTIF = TACTICAL_CLAIM_KEYWORDS as readonly string[];

function hasConfirmedMotifOfType(motifs: AnyMotif[], keyword: string): boolean {
  const kw = keyword.toLowerCase();
  for (const m of motifs) {
    if (!m.confirmed) continue;
    if (kw === "fork" || kw === "double attack") {
      if (m.motif === "fork") return true;
    } else if (kw === "pin") {
      if (m.motif === "pin") return true;
    } else if (kw === "skewer") {
      if (m.motif === "skewer") return true;
    } else if (kw === "discovered") {
      if (m.motif === "discovered_attack") return true;
    } else if (kw === "removes the defender") {
      if (m.motif === "removed_defender") return true;
    } else if (kw === "hanging") {
      if (m.motif === "hanging_piece") return true;
    } else if (kw === "trapped") {
      if (m.motif === "trapped_piece") return true;
    } else if (kw === "back rank" || kw === "back-rank") {
      if (m.motif === "back_rank_mate" || m.motif === "back_rank_threat") return true;
    } else if (kw === "mate threat") {
      if (m.motif === "back_rank_mate" || m.motif === "back_rank_threat") return true;
    }
  }
  return false;
}

// Check for unconfirmed motif with citation of refutation (the LLM is allowed to
// mention it IF it explicitly states the refutation).
function hasUnconfirmedMotifWithRefutation(
  motifs: AnyMotif[],
  keyword: string,
  llmResponse: string,
): boolean {
  const kw = keyword.toLowerCase();
  for (const m of motifs) {
    if (m.confirmed || !m.refutation) continue;
    const matchesMotif =
      (kw === "fork" && m.motif === "fork") ||
      (kw === "pin" && m.motif === "pin") ||
      (kw === "skewer" && m.motif === "skewer") ||
      (kw === "discovered" && m.motif === "discovered_attack") ||
      (kw === "hanging" && m.motif === "hanging_piece");
    if (!matchesMotif) continue;
    // The LLM must cite the refutation move in the response
    if (llmResponse.toLowerCase().includes(m.refutation.move.toLowerCase())) return true;
  }
  return false;
}

/**
 * Validator: scan LLM output for tactical-claim keywords.
 * Any keyword whose corresponding motif isn't present (confirmed: true) OR
 * mentioned with an explicit refutation is an issue.
 *
 * This is a post-LLM check — it's not a parser-LLM call (no additional token cost).
 * It's a pure string scan, runs synchronously, and emits a single telemetry event.
 */
export function validateMotifGrounding(opts: MotifGroundingOpts): ValidatorResult {
  const { llmResponse, detectedMotifs, fen, moveSan, correlationId } = opts;
  const lower = llmResponse.toLowerCase();

  const confirmedCount = detectedMotifs.filter((m) => m.confirmed).length;
  const noGrounding =
    detectedMotifs.length === 0 || confirmedCount === 0;

  const issues: string[] = [];

  for (const keyword of FORBIDDEN_WITHOUT_MOTIF) {
    if (!lower.includes(keyword.toLowerCase())) continue;

    const isGrounded = hasConfirmedMotifOfType(detectedMotifs, keyword);
    if (isGrounded) continue;

    const hasRefutationCited = hasUnconfirmedMotifWithRefutation(
      detectedMotifs,
      keyword,
      llmResponse,
    );
    if (hasRefutationCited) continue;

    issues.push(`tactical_claim_ungrounded:${keyword}`);
  }

  const passed = issues.length === 0;

  const telemetry = [
    createTelemetryEvent({
      check_name: "motif_grounding",
      fire_reason: passed ? "passed" : "tactical_claim_without_grounding",
      expected: { no_ungrounded_tactical_claims: true },
      actual: { issues, motif_count: detectedMotifs.length, confirmed_count: confirmedCount },
      context: {
        fen,
        move_san: moveSan,
        correlation_id: correlationId,
      },
    }),
  ];

  return {
    issues: issues.map((keyword) => ({
      check_name: "motif_grounding_ungrounded" as const,
      severity: "warn" as const,
      llm_span: keyword,
      expected: { tactical_claim_requires_confirmed_motif: true },
      actual: { claim_keyword: keyword, confirmed_motif_found: false },
      detail: `LLM used tactical keyword "${keyword}" without a confirmed motif in the detector output`,
    })),
    passed,
    telemetry,
    costUsd: 0,
  };
}
