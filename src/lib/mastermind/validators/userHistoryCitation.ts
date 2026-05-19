import { ParserCall, defaultEvalParserCall } from "./evalClaim";
import {
  USER_HISTORY_CITATION_PARSER_SYSTEM,
  buildUserHistoryCitationUserTurn,
} from "./parserPrompts";
import { createTelemetryEvent } from "./telemetry";
import {
  ValidatorResult,
  ValidatorIssue,
  TelemetryEvent,
  ParsedUserHistoryClaim,
  UserHistoryClaimType,
  UserHistoryOpportunity,
  DateRangeType,
  ScoutTimeClass,
  PARSER_LOW_CONFIDENCE_THRESHOLD,
} from "./types";
import {
  aggregateWinRateByTimeControl,
  aggregateScoreByOpening,
  countGamesInDateRange,
  type UserHistoryGame,
  type TimeControlPerformance,
} from "@/lib/mastermind/userHistoryAggregates";
import { classifyTimeControl } from "@/lib/utils/timeControlClass";
import { substringMatch, lower } from "@/lib/utils/fuzzyMatch";

// ─────────────────────────────────────────────────────────────────────────
// Tolerances + thresholds
// ─────────────────────────────────────────────────────────────────────────

export const USER_HISTORY_TOLERANCE = {
  /** ±5 percentage points for score / win-rate claims. */
  pct: 5,
} as const;

/**
 * Hybrid tolerance for hours_played_claim counts: at least 2, or 5% of the
 * stated value rounded to the nearest integer (per Aayan 2026-05-18 C1).
 * Flat ±2 is too strict for large counts (1000 games → ±2 is too tight);
 * roughly right for small counts (10 games → ±2 is reasonable). Math.max
 * picks the right scale automatically.
 *
 * Examples:
 *   stated=10  → tolerance = max(2, 1)  = 2     → 8-12 passes
 *   stated=40  → tolerance = max(2, 2)  = 2     → 38-42 passes
 *   stated=100 → tolerance = max(2, 5)  = 5     → 95-105 passes
 *   stated=1000→ tolerance = max(2, 50) = 50    → 950-1050 passes
 */
export function hoursPlayedTolerance(statedCount: number): number {
  return Math.max(2, Math.round(0.05 * statedCount));
}

/** ≥10 user games in a time class to count as a citation opportunity. */
const OPP_TIME_CLASS_MIN_GAMES = 10;
/** ≥5 user games in an opening-color bucket to count as an opportunity. */
const OPP_OPENING_MIN_GAMES = 5;

// ─────────────────────────────────────────────────────────────────────────
// Public types + entry point
// ─────────────────────────────────────────────────────────────────────────

export interface UserHistoryCitationOpts {
  llmResponse: string;
  games: UserHistoryGame[];
  userName: string;
  /** Optional — defaults to Date.now() at call time. Inject for deterministic testing. */
  nowMs?: number;
  correlationId: string;
  confidenceThreshold?: number;
  parseCall?: ParserCall;
}

interface MatchResult {
  matched: boolean;
  matchedEntry?: unknown;
}

// ─────────────────────────────────────────────────────────────────────────
// Date-range resolver
// ─────────────────────────────────────────────────────────────────────────

/**
 * Resolve a date-range-type enum to absolute ms-since-epoch bounds, anchored
 * on `nowMs`. UTC throughout — A.8 plan T5 default. Non-UTC-timezone edge
 * cases (e.g., "this month" for a user in UTC+8 when the validator computes
 * UTC-start-of-month) accepted as Stage C surface item; revisit if it fires.
 */
export function resolveDateRange(
  type: DateRangeType,
  params: { n?: number; year?: number },
  nowMs: number
): { fromMs: number; toMs: number } {
  const now = new Date(nowMs);
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();

  switch (type) {
    case "this_month":
      return { fromMs: Date.UTC(year, month, 1), toMs: nowMs };
    case "last_month": {
      const prevYear = month === 0 ? year - 1 : year;
      const prevMonth = month === 0 ? 11 : month - 1;
      return {
        fromMs: Date.UTC(prevYear, prevMonth, 1),
        toMs: Date.UTC(year, month, 1) - 1,
      };
    }
    case "this_year":
      return { fromMs: Date.UTC(year, 0, 1), toMs: nowMs };
    case "last_year":
      return {
        fromMs: Date.UTC(year - 1, 0, 1),
        toMs: Date.UTC(year, 0, 1) - 1,
      };
    case "last_n_days": {
      const n = params.n ?? 0;
      return { fromMs: nowMs - n * 86_400_000, toMs: nowMs };
    }
    case "in_year": {
      const y = params.year ?? year;
      return { fromMs: Date.UTC(y, 0, 1), toMs: Date.UTC(y + 1, 0, 1) - 1 };
    }
    case "all_time":
      return { fromMs: 0, toMs: nowMs };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Cross-check helpers
// ─────────────────────────────────────────────────────────────────────────

function withinPct(stated: number | undefined, actual: number): boolean {
  if (stated === undefined) return false;
  return Math.abs(stated - actual) <= USER_HISTORY_TOLERANCE.pct;
}

function classWinRate(buckets: TimeControlPerformance[], cls: ScoutTimeClass): {
  scorePct: number;
  winRate: number;
  totalGames: number;
} | null {
  let w = 0;
  let d = 0;
  let l = 0;
  for (const b of buckets) {
    if (classifyTimeControl(b.timeControl) === cls) {
      w += b.wins;
      d += b.draws;
      l += b.losses;
    }
  }
  const total = w + d + l;
  if (total === 0) return null;
  return {
    scorePct: ((w + 0.5 * d) / total) * 100,
    winRate: (w / total) * 100,
    totalGames: total,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// matchUserHistoryClaim — 3-branch cross-checker
// ─────────────────────────────────────────────────────────────────────────

function matchUserHistoryClaim(
  claim: ParsedUserHistoryClaim,
  games: UserHistoryGame[],
  userName: string,
  nowMs: number
): MatchResult {
  const ex = claim.expected_in_data;

  switch (claim.claim_type) {
    case "time_control_performance": {
      const buckets = aggregateWinRateByTimeControl(games, userName);
      if (buckets.length === 0) return { matched: false };

      // (a) Specific time-control cited — match the exact bucket.
      if (ex.specific_time_control) {
        const bucket = buckets.find(
          (b) => lower(b.timeControl) === lower(ex.specific_time_control!)
        );
        if (!bucket) return { matched: false };
        if (ex.stated_pct === undefined) {
          // Existence-only — match if bucket has any games (true by construction).
          return { matched: true, matchedEntry: { timeControl: bucket.timeControl } };
        }
        const target = ex.stated_metric === "win_rate"
          ? (bucket.wins / bucket.totalGames) * 100
          : bucket.scorePct;
        if (withinPct(ex.stated_pct, target)) {
          return { matched: true, matchedEntry: { timeControl: bucket.timeControl, actual: target } };
        }
        return { matched: false, matchedEntry: { timeControl: bucket.timeControl, actual: target } };
      }

      // (b) Time class cited — aggregate buckets in that class.
      if (ex.time_class) {
        const cls = classWinRate(buckets, ex.time_class);
        if (!cls) return { matched: false };
        if (ex.stated_pct === undefined) {
          return { matched: true, matchedEntry: { time_class: ex.time_class, totalGames: cls.totalGames } };
        }
        const target = ex.stated_metric === "win_rate" ? cls.winRate : cls.scorePct;
        if (withinPct(ex.stated_pct, target)) {
          return { matched: true, matchedEntry: { time_class: ex.time_class, actual: target } };
        }
        return { matched: false, matchedEntry: { time_class: ex.time_class, actual: target } };
      }

      // (c) Neither cited — overall across all buckets.
      if (ex.stated_pct === undefined) return { matched: false };
      let w = 0, d = 0, l = 0;
      for (const b of buckets) {
        w += b.wins;
        d += b.draws;
        l += b.losses;
      }
      const total = w + d + l;
      if (total === 0) return { matched: false };
      const target = ex.stated_metric === "win_rate" ? (w / total) * 100 : ((w + 0.5 * d) / total) * 100;
      if (withinPct(ex.stated_pct, target)) {
        return { matched: true, matchedEntry: { overall: true, actual: target } };
      }
      return { matched: false, matchedEntry: { overall: true, actual: target } };
    }

    case "opening_repertoire_performance": {
      const entries = aggregateScoreByOpening(games, userName, ex.user_color);
      if (entries.length === 0) return { matched: false };

      // Match by ECO first (exact, case-insensitive) then by name (substring + token overlap).
      const candidates = entries.filter((e) => {
        if (ex.opening_eco) return lower(e.eco) === lower(ex.opening_eco);
        if (ex.opening_name) return substringMatch(`${e.opening} ${e.variation ?? ""}`, ex.opening_name);
        return false;
      });
      if (candidates.length === 0) return { matched: false };

      if (ex.stated_pct === undefined) {
        // Existence-only — pass if any candidate exists.
        return { matched: true, matchedEntry: { opening: candidates[0].opening, color: candidates[0].color } };
      }

      for (const c of candidates) {
        const target = ex.stated_metric === "win_rate"
          ? (c.wins / c.totalGames) * 100
          : c.scorePct;
        if (withinPct(ex.stated_pct, target)) {
          return { matched: true, matchedEntry: { opening: c.opening, color: c.color, actual: target } };
        }
      }
      return { matched: false, matchedEntry: { candidates: candidates.length } };
    }

    case "hours_played_claim": {
      if (ex.stated_count === undefined) return { matched: false };
      const rangeType: DateRangeType = ex.date_range_type ?? "all_time";
      const range = resolveDateRange(rangeType, { n: ex.date_range_n, year: ex.date_range_year }, nowMs);

      // Pre-filter by time class if cited.
      let scoped = games;
      if (ex.time_class) {
        scoped = games.filter(
          (g) => g.timeControl && classifyTimeControl(g.timeControl) === ex.time_class
        );
      }

      const result = countGamesInDateRange(scoped, range.fromMs, range.toMs);
      const tolerance = hoursPlayedTolerance(ex.stated_count);
      const ok = Math.abs(ex.stated_count - result.count) <= tolerance;
      return {
        matched: ok,
        matchedEntry: { actual: result.count, range, tolerance, skippedNoDate: result.skippedNoDate },
      };
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// countUserHistoryOpportunities
// ─────────────────────────────────────────────────────────────────────────

export function countUserHistoryOpportunities(
  games: UserHistoryGame[],
  userName: string
): UserHistoryOpportunity[] {
  const opps: UserHistoryOpportunity[] = [];
  if (!userName.trim() || games.length === 0) return opps;

  // time_control_performance: one opp per time-class with ≥10 games.
  const buckets = aggregateWinRateByTimeControl(games, userName);
  const classCounts = new Map<ScoutTimeClass, number>();
  for (const b of buckets) {
    const cls = classifyTimeControl(b.timeControl);
    if (cls === "unknown") continue;
    classCounts.set(cls, (classCounts.get(cls) ?? 0) + b.totalGames);
  }
  classCounts.forEach((count, cls) => {
    if (count >= OPP_TIME_CLASS_MIN_GAMES) {
      opps.push({
        dataSource: "user_history",
        claim_type: "time_control_performance",
        ref: { time_class: cls, count },
      });
    }
  });

  // opening_repertoire_performance: one opp per (color × opening) bucket with ≥5 games.
  const openings = aggregateScoreByOpening(games, userName);
  for (const o of openings) {
    if (o.totalGames >= OPP_OPENING_MIN_GAMES) {
      opps.push({
        dataSource: "user_history",
        claim_type: "opening_repertoire_performance",
        ref: { eco: o.eco, opening: o.opening, color: o.color },
      });
    }
  }

  // hours_played_claim: one opp total when the user has any games.
  // We check via aggregateWinRateByTimeControl rather than games.length because
  // the user may appear in games where they aren't the named player (filtered
  // out by detectUserColor). Any bucket existing → user has games.
  if (buckets.length > 0) {
    opps.push({
      dataSource: "user_history",
      claim_type: "hours_played_claim",
      ref: { hasGames: true },
    });
  }

  return opps;
}

// ─────────────────────────────────────────────────────────────────────────
// JSON parser
// ─────────────────────────────────────────────────────────────────────────

function tryParseClaims(raw: string): ParsedUserHistoryClaim[] | null {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const payload = fenced ? fenced[1].trim() : trimmed;
  try {
    const parsed = JSON.parse(payload);
    if (!Array.isArray(parsed)) return null;
    return parsed as ParsedUserHistoryClaim[];
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// validateUserHistoryCitation — public entry point
// ─────────────────────────────────────────────────────────────────────────

/**
 * Stage A.8 user-history citation validator. Parses LLM response for
 * factual_user_history_claims and cross-checks each against the three
 * Stage A.7 aggregators (aggregateWinRateByTimeControl,
 * aggregateScoreByOpening, countGamesInDateRange).
 *
 * Library-only — pipeline integration is Stage A.9 via dataSources extension.
 */
export async function validateUserHistoryCitation(
  opts: UserHistoryCitationOpts
): Promise<ValidatorResult> {
  const confidenceThreshold = opts.confidenceThreshold ?? PARSER_LOW_CONFIDENCE_THRESHOLD;
  const parseCall = opts.parseCall ?? defaultEvalParserCall;
  const nowMs = opts.nowMs ?? Date.now();

  const baseContext = {
    correlation_id: opts.correlationId,
  } as const;

  const issues: ValidatorIssue[] = [];
  const telemetry: TelemetryEvent[] = [];

  const userTurn = buildUserHistoryCitationUserTurn({
    llmResponse: opts.llmResponse,
    userName: opts.userName,
    nowMs,
  });

  const parsed = await parseCall({ system: USER_HISTORY_CITATION_PARSER_SYSTEM, user: userTurn });
  const claims = tryParseClaims(parsed.raw);

  if (claims === null) {
    telemetry.push(
      createTelemetryEvent({
        check_name: "user_history_citation_parser",
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
    if (c.claim_class !== "factual_user_history_claim") continue;

    if (c.confidence < confidenceThreshold) {
      telemetry.push(
        createTelemetryEvent({
          check_name: "user_history_citation_parser",
          fire_reason: "parser_low_confidence",
          llm_span: c.claim_text,
          expected: `confidence >= ${confidenceThreshold}`,
          actual: c.confidence,
          context: baseContext,
        })
      );
      continue;
    }

    const match = matchUserHistoryClaim(c, opts.games, opts.userName, nowMs);

    if (!match.matched) {
      issues.push({
        check_name: "user_history_citation_unsupported",
        severity: "error",
        llm_span: c.claim_text,
        expected: { claim_type: c.claim_type, expected_in_data: c.expected_in_data },
        actual: match.matchedEntry ?? null,
        detail: `LLM cited user-history claim "${c.claim_text}" (type=${c.claim_type}); no matching entry in user history data.`,
        parser_confidence: c.confidence,
      });
      telemetry.push(
        createTelemetryEvent({
          check_name: "user_history_citation_unsupported",
          fire_reason: "unsupported_citation",
          llm_span: c.claim_text,
          // Stage C aggregation requires claim_type explicit in telemetry —
          // mirrors scoutCitation pattern per Aayan's follow-up.
          expected: { claim_type: c.claim_type, expected_in_data: c.expected_in_data },
          actual: match.matchedEntry ?? null,
          context: baseContext,
        })
      );
    } else {
      telemetry.push(
        createTelemetryEvent({
          check_name: "user_history_citation",
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

// Suppress unused-imports linter for re-exported claim type (used by tests).
export type { UserHistoryClaimType };
