// Mate-in-N validator — Stage 9 of the Tactical Grounding Program.
//
// Mate claims are the highest-trust class of coach prose. "Mate in 5"
// either is or isn't true; there's no fuzz. Wrong mate calls destroy
// credibility instantly.
//
// The voter computes mate_in_n confidence:
//   HIGH: Syzygy says win with DTM (mathematically perfect)
//   MED:  SF mate score > 0 AND chessdb agrees
//   LOW:  SF mate score > 0 alone (often phantom at shallow depth)
//   NONE: no mate signal anywhere
//
// This validator fires on two distinct problems:
//   (A) Ungrounded mate claim — the LLM says "mate in X" / "forced mate"
//       and the voter's mate_in_n is NONE. No deterministic source supports
//       any mate claim at all.
//   (B) Mate distance wrong — the LLM says "mate in N" and we have a
//       Syzygy DTM, but |N - DTM| > 1. The voter has ground truth and
//       the model contradicts it.
//
// Both fires can occur on the same response (e.g., "mate in 12" said when
// Syzygy DTM = 6 — both ungrounded for mate_in_n = NONE check AND distance
// off by 6).
//
// Pure string-scan, no parser-LLM call, costUsd = 0.

import { createTelemetryEvent } from "./telemetry";
import type { ValidatorResult } from "./types";
import type { ConfidenceLevel } from "@/lib/grounding/voter";

export interface MateInNOpts {
  llmResponse: string;
  /** Syzygy distance-to-mate (positive); null when not in tablebase range. */
  syzygyDtm: number | null;
  /** Stockfish forced-mate distance (positive = mate available); null otherwise. */
  sfMate: number | null;
  /** Voter confidence for the mate_in_n claim class. */
  mate_in_n: ConfidenceLevel;
  fen?: string;
  moveSan?: string;
  playerPerspective?: "white" | "black";
  correlationId: string;
}

/**
 * Mate-claim token regex. Word-boundary on both sides; case-insensitive.
 *
 * Captures the explicit "mate in N" form so we can extract N for the
 * distance check. Other tokens are flags only (no captured N).
 *
 * Patterns:
 * - "mate in 5", "mate in five"           — canonical mate-in-N claim
 * - "mating attack"                       — narrative variant
 * - "forced mate"                         — claim of forced sequence
 * - "inevitable mate" / "unstoppable mate" — strong variants
 * - "checkmate is forced"                 — explicit framing
 */
const MATE_TOKEN_REGEX = /\b(mate in (\d+|one|two|three|four|five|six|seven|eight|nine|ten)|mating attack|forced mate|inevitable mate|unstoppable mate|checkmate is forced)\b/gi;

const WORD_TO_NUMBER: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

function parseMateCount(raw: string): number | null {
  const cleaned = raw.toLowerCase().trim();
  // Numeric form: "mate in 5" → "5"
  const numMatch = cleaned.match(/^mate in (\d+)$/);
  if (numMatch) {
    const n = parseInt(numMatch[1], 10);
    return Number.isFinite(n) ? n : null;
  }
  // Word form: "mate in five" → 5
  const wordMatch = cleaned.match(/^mate in ([a-z]+)$/);
  if (wordMatch) {
    return WORD_TO_NUMBER[wordMatch[1]] ?? null;
  }
  return null;
}

interface MateMatch {
  raw: string;        // exact matched substring, lowercased
  index: number;      // start offset in llmResponse
  parsedN: number | null;
}

function collectMateMatches(llmResponse: string): MateMatch[] {
  const matches: MateMatch[] = [];
  const allMatches = Array.from(llmResponse.matchAll(MATE_TOKEN_REGEX));
  for (const m of allMatches) {
    if (m[0] === undefined || m.index === undefined) continue;
    const raw = m[0].toLowerCase();
    matches.push({
      raw,
      index: m.index,
      parsedN: parseMateCount(raw),
    });
  }
  return matches;
}

function contextWindow(llmResponse: string, m: MateMatch): string {
  const start = Math.max(0, m.index - 40);
  const end = Math.min(llmResponse.length, m.index + m.raw.length + 40);
  return llmResponse.slice(start, end);
}

/**
 * Validator: scan the LLM response for mate claims and check them against
 * the voter's mate_in_n confidence + Syzygy ground truth.
 *
 * Returns issues for:
 * - mate_claim_unsupported: mate_in_n === "NONE" but a mate claim appeared
 * - mate_distance_incorrect: explicit "mate in N" and |N - syzygyDtm| > 1
 */
export function validateMateInN(opts: MateInNOpts): ValidatorResult {
  const { llmResponse, syzygyDtm, sfMate, mate_in_n, fen, moveSan, playerPerspective, correlationId } = opts;

  const matches = collectMateMatches(llmResponse);

  // No mate claims → pass; emit one informational telemetry event.
  if (matches.length === 0) {
    return {
      issues: [],
      passed: true,
      telemetry: [
        createTelemetryEvent({
          check_name: "mate_in_n",
          fire_reason: "passed",
          expected: { no_mate_claim_or_grounded_mate_claim: true },
          actual: { matched_mate_tokens: 0, mate_in_n_confidence: mate_in_n },
          context: { fen, move_san: moveSan, player_perspective: playerPerspective, correlation_id: correlationId },
        }),
      ],
      costUsd: 0,
    };
  }

  const issues: ValidatorResult["issues"] = [];

  // ── Fire A: ungrounded mate claim ───────────────────────────────────────
  // mate_in_n === "NONE" means no Syzygy support AND no SF mate score.
  // Any mate claim in this state is unsupported by deterministic data.
  if (mate_in_n === "NONE") {
    for (const m of matches) {
      issues.push({
        check_name: "mate_claim_unsupported" as const,
        severity: "warn" as const,
        llm_span: m.raw,
        expected: { mate_in_n_confidence: "MED or HIGH (Syzygy DTM or SF mate score required)" },
        actual: {
          mate_in_n_confidence: mate_in_n,
          syzygy_dtm: syzygyDtm,
          sf_mate: sfMate,
          matched_token: m.raw,
          context_window: contextWindow(llmResponse, m),
        },
        detail: `LLM claimed "${m.raw}" without Syzygy DTM or Stockfish mate score backing`,
      });
    }
  }

  // ── Fire B: mate distance wrong (Syzygy contradicts LLM) ────────────────
  // Even if mate_in_n is HIGH (Syzygy present), the LLM might cite the wrong
  // distance. The model is allowed off-by-1 (Syzygy's DTM is full moves;
  // LLM might count half-moves or the user-side half-move). Anything more
  // than off-by-1 is the model fabricating a specific number.
  if (syzygyDtm !== null) {
    for (const m of matches) {
      if (m.parsedN === null) continue;
      const delta = Math.abs(m.parsedN - syzygyDtm);
      if (delta > 1) {
        issues.push({
          check_name: "mate_distance_incorrect" as const,
          severity: "warn" as const,
          llm_span: m.raw,
          expected: { mate_distance_within_1_of_syzygy: syzygyDtm },
          actual: {
            llm_distance: m.parsedN,
            syzygy_dtm: syzygyDtm,
            delta,
            matched_token: m.raw,
            context_window: contextWindow(llmResponse, m),
          },
          detail: `LLM said "${m.raw}" but Syzygy DTM is ${syzygyDtm} (off by ${delta})`,
        });
      }
    }
  }

  // ── Telemetry: one event per validator run, summarizing the fires ───────
  let fire_reason: TelemetryFireReason;
  if (issues.length === 0) {
    fire_reason = "passed";
  } else if (issues.some((i) => i.check_name === "mate_distance_incorrect")) {
    fire_reason = "mate_distance_off_by_more_than_one";
  } else {
    fire_reason = "mate_claim_without_syzygy_or_sf_mate";
  }

  return {
    issues,
    passed: issues.length === 0,
    telemetry: [
      createTelemetryEvent({
        check_name: "mate_in_n",
        fire_reason,
        expected: { no_mate_claim_or_grounded_mate_claim: true },
        actual: {
          mate_in_n_confidence: mate_in_n,
          syzygy_dtm: syzygyDtm,
          sf_mate: sfMate,
          matched_token_count: matches.length,
          matched_tokens: matches.map((m) => m.raw),
          issue_count: issues.length,
        },
        context: { fen, move_san: moveSan, player_perspective: playerPerspective, correlation_id: correlationId },
      }),
    ],
    costUsd: 0,
  };
}

// Narrowing helper: FireReason has the two we care about for mate plus "passed".
type TelemetryFireReason =
  | "passed"
  | "mate_claim_without_syzygy_or_sf_mate"
  | "mate_distance_off_by_more_than_one";
