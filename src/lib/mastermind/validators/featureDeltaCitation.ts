import { Chess } from "chess.js";
import { PositionFeatureDelta } from "../featureDelta";
import { RoleChange } from "../pieceRoles";
import { ThreatNode } from "../threatTree";
import { ParserCall, defaultEvalParserCall } from "./evalClaim";
import {
  FEATURE_CITATION_PARSER_SYSTEM,
  buildFeatureCitationUserTurn,
} from "./parserPrompts";
import { createTelemetryEvent } from "./telemetry";
import {
  ValidatorResult,
  ValidatorIssue,
  TelemetryEvent,
  ParsedFeatureClaim,
  FeatureClaimType,
  PARSER_LOW_CONFIDENCE_THRESHOLD,
} from "./types";

export interface FeatureCitationOpts {
  llmResponse: string;
  featureDelta: PositionFeatureDelta;
  pieceRoleDiff: RoleChange[];
  threatTree?: ThreatNode[];
  playerPerspective: "white" | "black";
  fen?: string;
  moveSan?: string;
  correlationId: string;
  confidenceThreshold?: number;
  parseCall?: ParserCall;
  /** AbortSignal threaded from withPipelineTimeout. Forwarded to parseCall. */
  signal?: AbortSignal;
}

interface MatchResult {
  matched: boolean;
  matchedEntry?: unknown;
}

function countBishops(fen: string, color: "w" | "b"): number {
  try {
    const game = new Chess(fen);
    let n = 0;
    for (const row of game.board()) {
      for (const sq of row) {
        if (sq && sq.type === "b" && sq.color === color) n++;
      }
    }
    return n;
  } catch {
    return -1;
  }
}

function countKnights(fen: string, color: "w" | "b"): number {
  try {
    const game = new Chess(fen);
    let n = 0;
    for (const row of game.board()) {
      for (const sq of row) {
        if (sq && sq.type === "n" && sq.color === color) n++;
      }
    }
    return n;
  } catch {
    return -1;
  }
}

function sideColor(side: "white" | "black" | undefined): "w" | "b" | null {
  if (side === "white") return "w";
  if (side === "black") return "b";
  return null;
}

function matchClaim(
  claim: ParsedFeatureClaim,
  delta: PositionFeatureDelta,
  roles: RoleChange[]
): MatchResult {
  const side = claim.expected_in_delta.side;
  const square = claim.expected_in_delta.square;
  const piece = claim.expected_in_delta.piece;
  const role = claim.expected_in_delta.role;
  const direction = claim.expected_in_delta.direction;

  switch (claim.claim_type) {
    case "material_change":
    case "lost_piece": {
      if (!side) return { matched: false };
      const change = side === "white" ? delta.materialDelta.white : delta.materialDelta.black;
      return { matched: change < 0, matchedEntry: { change } };
    }
    case "gained_piece": {
      if (!side) return { matched: false };
      const change = side === "white" ? delta.materialDelta.white : delta.materialDelta.black;
      return { matched: change > 0, matchedEntry: { change } };
    }
    case "lost_bishop_pair": {
      const c = sideColor(side);
      if (!c) return { matched: false };
      const before = countBishops(delta.fenBefore, c);
      const after = countBishops(delta.resolutionFen, c);
      return { matched: before === 2 && after <= 1, matchedEntry: { before, after } };
    }
    case "lost_knight_pair": {
      const c = sideColor(side);
      if (!c) return { matched: false };
      const before = countKnights(delta.fenBefore, c);
      const after = countKnights(delta.resolutionFen, c);
      return { matched: before === 2 && after <= 1, matchedEntry: { before, after } };
    }
    case "king_safety_change": {
      if (!side) return { matched: false };
      const change = side === "white" ? delta.kingSafetyDelta.white : delta.kingSafetyDelta.black;
      if (direction === "decrease") return { matched: change < 0, matchedEntry: { change } };
      if (direction === "increase") return { matched: change > 0, matchedEntry: { change } };
      return { matched: change !== 0, matchedEntry: { change } };
    }
    case "new_passed_pawn": {
      if (!side) return { matched: false };
      const gained = delta.pawnStructureDelta.passedPawnsGained[side];
      if (square) return { matched: gained.includes(square), matchedEntry: { gained } };
      return { matched: gained.length > 0, matchedEntry: { gained } };
    }
    case "lost_passed_pawn": {
      if (!side) return { matched: false };
      const lost = delta.pawnStructureDelta.passedPawnsLost[side];
      if (square) return { matched: lost.includes(square), matchedEntry: { lost } };
      return { matched: lost.length > 0, matchedEntry: { lost } };
    }
    case "new_outpost":
    case "lost_outpost": {
      const targetRole = "outpost";
      const direction2 = claim.claim_type === "new_outpost" ? "gained" : "lost";
      const targetColor = sideColor(side);
      const matches = roles.filter((r) => {
        if (piece && r.piece !== piece) return false;
        if (targetColor && r.color !== targetColor) return false;
        if (square && r.square !== square) return false;
        return direction2 === "gained" ? r.gained.includes(targetRole) : r.lost.includes(targetRole);
      });
      return { matched: matches.length > 0, matchedEntry: { matches: matches.length } };
    }
    case "new_open_file": {
      if (square) return { matched: delta.pawnStructureDelta.openFilesGained.includes(square[0]) };
      return { matched: delta.pawnStructureDelta.openFilesGained.length > 0 };
    }
    case "lost_open_file": {
      if (square) return { matched: delta.pawnStructureDelta.openFilesLost.includes(square[0]) };
      return { matched: delta.pawnStructureDelta.openFilesLost.length > 0 };
    }
    case "new_isolated_pawn": {
      if (!side) return { matched: false };
      const change = side === "white"
        ? delta.pawnStructureDelta.isolatedPawnsChange.white
        : delta.pawnStructureDelta.isolatedPawnsChange.black;
      return { matched: change > 0, matchedEntry: { change } };
    }
    case "new_doubled_pawn": {
      if (!side) return { matched: false };
      const change = side === "white"
        ? delta.pawnStructureDelta.doubledPawnsChange.white
        : delta.pawnStructureDelta.doubledPawnsChange.black;
      return { matched: change > 0, matchedEntry: { change } };
    }
    case "new_backward_pawn": {
      return { matched: false, matchedEntry: { note: "backward_pawn not tracked by positionAnnotator yet" } };
    }
    case "role_gained":
    case "role_lost": {
      const targetColor = sideColor(side);
      const matches = roles.filter((r) => {
        if (piece && r.piece !== piece) return false;
        if (targetColor && r.color !== targetColor) return false;
        if (square && r.square !== square) return false;
        if (!role) return false;
        return claim.claim_type === "role_gained"
          ? r.gained.includes(role as never)
          : r.lost.includes(role as never);
      });
      return { matched: matches.length > 0, matchedEntry: { matches: matches.length } };
    }
    case "new_threat": {
      return {
        matched: delta.threatsDelta.newThreats.length > 0,
        matchedEntry: { count: delta.threatsDelta.newThreats.length },
      };
    }
    case "resolved_threat": {
      return {
        matched: delta.threatsDelta.resolvedThreats.length > 0,
        matchedEntry: { count: delta.threatsDelta.resolvedThreats.length },
      };
    }
    case "hanging_piece": {
      const targetColor = sideColor(side);
      const matches = delta.hangingPiecesDelta.newlyHanging.filter((h) => {
        if (targetColor && h.color !== (targetColor === "w" ? "white" : "black")) return false;
        if (square && h.square !== square) return false;
        return true;
      });
      return { matched: matches.length > 0, matchedEntry: { count: matches.length } };
    }
    case "now_defended": {
      const targetColor = sideColor(side);
      const matches = delta.hangingPiecesDelta.nowDefended.filter((h) => {
        if (targetColor && h.color !== (targetColor === "w" ? "white" : "black")) return false;
        if (square && h.square !== square) return false;
        return true;
      });
      return { matched: matches.length > 0, matchedEntry: { count: matches.length } };
    }
  }
}

function tryParseFeatureClaims(raw: string): ParsedFeatureClaim[] | null {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const payload = fenced ? fenced[1].trim() : trimmed;
  try {
    const parsed = JSON.parse(payload);
    if (!Array.isArray(parsed)) return null;
    return parsed as ParsedFeatureClaim[];
  } catch {
    return null;
  }
}

/**
 * Stage 3 feature-citation validator. Parses the LLM response for
 * factual_delta_claims and cross-checks each against the actual
 * PositionFeatureDelta + RoleChange[] from PR 1.A.
 *
 * Scope (Aayan 2026-05-11, PR_1B_PLAN.md §6.4): deltas only. Absolute-state
 * claims like "the bishop is undefended" are out of scope; a future
 * validator handles them — see FAILURE_MODES.md §10f.
 */
export async function validateFeatureDeltaCitations(opts: FeatureCitationOpts): Promise<ValidatorResult> {
  const confidenceThreshold = opts.confidenceThreshold ?? PARSER_LOW_CONFIDENCE_THRESHOLD;
  const parseCall = opts.parseCall ?? defaultEvalParserCall;

  const baseContext = {
    fen: opts.fen,
    move_san: opts.moveSan,
    player_perspective: opts.playerPerspective,
    correlation_id: opts.correlationId,
  } as const;

  const issues: ValidatorIssue[] = [];
  const telemetry: TelemetryEvent[] = [];

  const userTurn = buildFeatureCitationUserTurn({
    llmResponse: opts.llmResponse,
    playerPerspective: opts.playerPerspective,
    citedMove: opts.moveSan,
  });

  const parsed = await parseCall({ system: FEATURE_CITATION_PARSER_SYSTEM, user: userTurn, signal: opts.signal });
  const claims = tryParseFeatureClaims(parsed.raw);

  if (claims === null) {
    telemetry.push(
      createTelemetryEvent({
        check_name: "feature_citation_parser",
        fire_reason: "parser_json_invalid",
        llm_span: opts.llmResponse.slice(0, 200),
        expected: "JSON array",
        actual: parsed.raw.slice(0, 200),
        context: baseContext,
      })
    );
    return { issues, passed: true, telemetry, costUsd: parsed.costUsd };
  }

  for (const c of claims) {
    if (c.claim_class !== "factual_delta_claim") continue;

    if (c.confidence < confidenceThreshold) {
      telemetry.push(
        createTelemetryEvent({
          check_name: "feature_citation_parser",
          fire_reason: "parser_low_confidence",
          llm_span: c.claim_text,
          expected: `confidence >= ${confidenceThreshold}`,
          actual: c.confidence,
          context: baseContext,
        })
      );
      continue;
    }

    const match = matchClaim(c, opts.featureDelta, opts.pieceRoleDiff);

    if (!match.matched) {
      issues.push({
        check_name: "feature_citation_unsupported",
        severity: "error",
        llm_span: c.claim_text,
        expected: { claim_type: c.claim_type, expected_in_delta: c.expected_in_delta },
        actual: match.matchedEntry ?? null,
        detail: `LLM cited feature change "${c.claim_text}" (type=${c.claim_type}); no matching entry in the computed delta.`,
        parser_confidence: c.confidence,
      });
      telemetry.push(
        createTelemetryEvent({
          check_name: "feature_citation_unsupported",
          fire_reason: "unsupported_citation",
          llm_span: c.claim_text,
          expected: { claim_type: c.claim_type, expected_in_delta: c.expected_in_delta },
          actual: match.matchedEntry ?? null,
          context: baseContext,
        })
      );
    } else {
      telemetry.push(
        createTelemetryEvent({
          check_name: "feature_citation",
          fire_reason: "passed",
          llm_span: c.claim_text,
          expected: { claim_type: c.claim_type },
          actual: match.matchedEntry,
          context: baseContext,
        })
      );
    }
  }

  return {
    issues,
    passed: issues.length === 0,
    telemetry,
    costUsd: parsed.costUsd,
  };
}
