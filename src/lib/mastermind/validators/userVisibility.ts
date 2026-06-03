// User-visibility validator — Stage 9 of the Tactical Grounding Program.
//
// The voter emits a suppression rule into the prompt when Maia says the
// user's rating-band finds the SF best move with < 15% probability:
//   "Do NOT use the words 'obvious', 'obviously', 'clearly', 'simply', or
//   'just' when discussing this move — the user almost certainly did not see
//   it. Frame as a discovery, not a miss."
// This validator enforces it.
//
// Pure string-scan, no parser-LLM call, costUsd = 0. Modeled exactly on
// motifGrounding.ts.
//
// Rating-band-aware threshold: sub-1200 players need much more grace. For
// users below 1200, we lift the threshold to 0.20 (anything Maia says is
// found by < 20% of 1100-rated players counts as "hard to see").
//
// Why "maiaProb !== null" matters: VoterConfidence.user_visibility resolves
// to NONE in two distinct cases — (a) Maia consulted and prob < 0.15 (the
// move IS hard), and (b) Maia wasn't consulted (e.g., no MAIA_API_URL, no
// userRating, or the call failed). We only enforce in case (a). The route
// is responsible for passing maiaProb = null in case (b) so this validator
// silently no-ops.

import { createTelemetryEvent } from "./telemetry";
import type { ValidatorResult } from "./types";

export interface UserVisibilityOpts {
  llmResponse: string;
  /** Maia's prob_plays_best for the SF best move. null when Maia not consulted. */
  maiaProb: number | null;
  /** User's rating. null when unknown (the route should pass null in that case). */
  userRating: number | null;
  fen?: string;
  moveSan?: string;
  playerPerspective?: "white" | "black";
  correlationId: string;
}

/**
 * Tokens forbidden when the user's Maia visibility is below threshold.
 *
 * Word-boundary on both sides keeps "obviousness" matching (substring of
 * "obvious") while not matching "obstructive". The trailing `i` flag makes
 * the scan case-insensitive so "OBVIOUS" / "Obviously" / "obvious." all match.
 *
 * Token-by-token rationale:
 * - "obvious" / "obviously"   — the canonical "you should have seen this"
 * - "clearly"                 — equivalently dismissive
 * - "simply" / "just"         — "just play Nf3" frames the move as effortless
 * - "easy" / "easily"         — same framing, milder
 * - "trivially" / "trivial"   — same framing, stronger
 * - "of course"               — implies the move was self-evident
 */
const OVERCLAIM_TOKEN_REGEX = /\b(obviously|obvious|clearly|simply|just|easily|easy|trivially|trivial|of course)\b/gi;

/**
 * Per-rating-band visibility threshold. Sub-1200 players get more grace.
 * Above 1200, the canonical Stage 8 threshold (0.15) applies.
 */
function visibilityThreshold(userRating: number | null): number {
  if (userRating !== null && userRating < 1200) return 0.20;
  return 0.15;
}

/**
 * Validator: scan the LLM response for dismissive language and flag uses
 * that conflict with low Maia user-visibility.
 *
 * Returns a passed result with one informational telemetry event when:
 * - Maia wasn't consulted (maiaProb === null) — we have no basis to enforce
 * - No forbidden tokens found
 * - Maia consulted AND prob >= threshold (the move IS findable)
 *
 * Returns one ValidatorIssue per matched token when Maia consulted AND
 * prob < threshold AND tokens appear. Multiple distinct tokens yield
 * multiple issues; the same token appearing multiple times yields one
 * issue per occurrence (so the route can see frequency).
 */
export function validateUserVisibility(opts: UserVisibilityOpts): ValidatorResult {
  const { llmResponse, maiaProb, userRating, fen, moveSan, playerPerspective, correlationId } = opts;

  // No Maia data → no enforcement. Emit a passed telemetry event so the
  // dropout is observable (helps debug "why didn't this fire on the hard move?").
  if (maiaProb === null) {
    return {
      issues: [],
      passed: true,
      telemetry: [
        createTelemetryEvent({
          check_name: "user_visibility",
          fire_reason: "passed",
          expected: { maia_consulted: true },
          actual: { maia_consulted: false, reason: "maiaProb=null" },
          context: { fen, move_san: moveSan, player_perspective: playerPerspective, correlation_id: correlationId },
        }),
      ],
      costUsd: 0,
    };
  }

  const threshold = visibilityThreshold(userRating);

  // Match-all (the `g` flag); .matchAll lets us extract span context per hit.
  // tsconfig target=es5 doesn't iterate the matchAll IterableIterator, so we
  // materialize with Array.from. Same pattern as Stage 4 runners.
  const matches: Array<{ token: string; index: number }> = [];
  const allMatches = Array.from(llmResponse.matchAll(OVERCLAIM_TOKEN_REGEX));
  for (const m of allMatches) {
    if (m[0] !== undefined && m.index !== undefined) {
      matches.push({ token: m[0].toLowerCase(), index: m.index });
    }
  }

  // Move IS visible enough that "obvious" / "clearly" are defensible.
  if (maiaProb >= threshold) {
    return {
      issues: [],
      passed: true,
      telemetry: [
        createTelemetryEvent({
          check_name: "user_visibility",
          fire_reason: "passed",
          expected: { maia_prob_min: threshold },
          actual: { maia_prob: maiaProb, matched_token_count: matches.length },
          context: { fen, move_san: moveSan, player_perspective: playerPerspective, correlation_id: correlationId },
        }),
      ],
      costUsd: 0,
    };
  }

  // Threshold-violating tokens present → fire one issue per match.
  // The matched token is the llm_span; a short context window (40 chars on
  // each side) is included in `actual.context_window` for triage.
  const probPct = (maiaProb * 100).toFixed(1);
  const ratingLabel = userRating === null ? "unrated" : `${userRating}-rated`;

  const issues = matches.map((m) => {
    const start = Math.max(0, m.index - 40);
    const end = Math.min(llmResponse.length, m.index + m.token.length + 40);
    const contextWindow = llmResponse.slice(start, end);
    return {
      check_name: "user_visibility_overclaim" as const,
      severity: "warn" as const,
      llm_span: m.token,
      expected: { user_visibility_min_prob: threshold, fail_open_token_set: false },
      actual: {
        maia_prob: maiaProb,
        user_rating: userRating,
        matched_token: m.token,
        context_window: contextWindow,
      },
      detail: `LLM used dismissive token "${m.token}" on a move ${ratingLabel} players find only ${probPct}% of the time`,
    };
  });

  const fire_reason = issues.length > 0
    ? "obviousness_claim_below_visibility_threshold"
    : "passed";

  return {
    issues,
    passed: issues.length === 0,
    telemetry: [
      createTelemetryEvent({
        check_name: "user_visibility",
        fire_reason,
        expected: { user_visibility_min_prob: threshold },
        actual: {
          maia_prob: maiaProb,
          user_rating: userRating,
          matched_token_count: matches.length,
          matched_tokens: Array.from(new Set(matches.map((m) => m.token))),
        },
        context: { fen, move_san: moveSan, player_perspective: playerPerspective, correlation_id: correlationId },
      }),
    ],
    costUsd: 0,
  };
}
