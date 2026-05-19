import { ParserCall, defaultEvalParserCall } from "./evalClaim";
import {
  SCOUT_CITATION_PARSER_SYSTEM,
  buildScoutCitationUserTurn,
} from "./parserPrompts";
import { createTelemetryEvent } from "./telemetry";
import {
  ValidatorResult,
  ValidatorIssue,
  TelemetryEvent,
  ParsedScoutClaim,
  ScoutOpportunity,
  ScoutClaimType,
  ScoutTimeClass,
  PARSER_LOW_CONFIDENCE_THRESHOLD,
} from "./types";
import type {
  ScoutAnalytics,
  Collisions,
  OpeningSummary,
  FrequentRival,
  CollisionLine,
  ChecklistItem,
  NoveltyFinding,
  RecentFormBucket,
  StalkerFactor,
} from "@/types/scout";

// ─────────────────────────────────────────────────────────────────────────
// Tolerances (per PR_1C_SCOUT_CITATION_PLAN.md §3 / §5). Codified as
// constants so the implementation is auditable and the test suite can
// exercise boundary conditions deterministically.
// ─────────────────────────────────────────────────────────────────────────

export const SCOUT_TOLERANCE = {
  /** ±5 percentage points for any %-valued claim (frequencies, scores, rates). */
  pct: 5,
  /** ±25 ELO for any rating claim (by-time-class, peak, low, latest, phase). */
  rating: 25,
  /** ±50 cp for phase-vs-phase ELO delta claims. */
  phaseDelta: 50,
  /** ±10 for stalker factor scores (0-100 scale). */
  factorScore: 10,
  /** ±5 for stalker total + profile dimensions (0-100 scale). */
  scoreOutOfHundred: 5,
  /** ±1 for streak counts and recent-form W/D/L counts. */
  count: 1,
  /** ±10 plies for average game length. */
  plies: 10,
} as const;

// Opportunity-counter thresholds (§3.7 / §6 of the plan). "Non-default" is
// existence-based for arrays; threshold-based for rates (only count as
// "notable" — i.e., a coach would plausibly cite it — when the rate
// crosses a meaningful bar).
const OPP_THRESHOLD = {
  /** psychology.timeoutRate > 5% counts as an opportunity. */
  timeoutPct: 5,
  /** psychology.resignRate > 30% counts. */
  resignPct: 30,
  /** psychology.checkmateRate > 20% counts. */
  checkmatePct: 20,
  /** psychology.quickLossRate > 5%. */
  quickLossPct: 5,
  /** psychology.longGameLossRate > 5%. */
  longGamePct: 5,
  /** psychology.tiltAfterLossLossRate differs from baseline win rate by ≥5pp. */
  tiltDeltaPct: 5,
  /** psychology streak counts ≥4 to be noteworthy. */
  streakNotable: 4,
  /** profile dimension considered "notable" if ≥10 above or below the midpoint. */
  dimensionNotable: 10,
} as const;

export interface ScoutCitationOpts {
  llmResponse: string;
  scout: ScoutAnalytics;
  collisions?: Collisions;
  opponentUsername: string;
  primaryTimeClass?: ScoutTimeClass;
  correlationId: string;
  confidenceThreshold?: number;
  parseCall?: ParserCall;
}

interface MatchResult {
  matched: boolean;
  matchedEntry?: unknown;
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function lower(s: string | undefined): string {
  return (s ?? "").toLowerCase().trim();
}

/**
 * Case-insensitive name match. Returns true when:
 *   (a) `needle` is a contiguous substring of `haystack`, OR
 *   (b) all of `needle`'s whitespace-split tokens appear in `haystack`'s
 *       tokens (word-order-tolerant).
 *
 * Both are lowercased + trimmed. The token-overlap fallback was added
 * during Stage A.6 implementation as a documented deviation from the
 * plan §5 substring spec — the plan anticipated word-order variation
 * ("LLM may phrase 'Sicilian Najdorf' or 'Najdorf Sicilian'") but
 * literal substring fails when intermediate words like "Defense" sit
 * between the matched terms. Token-overlap handles all word-order
 * variants without needing claim-side normalization.
 */
function substringMatch(haystack: string, needle: string): boolean {
  const h = lower(haystack);
  const n = lower(needle);
  if (!n) return false;
  if (h.includes(n)) return true;
  const haystackTokens = new Set(h.split(/\s+/).filter(Boolean));
  const needleTokens = n.split(/\s+/).filter(Boolean);
  if (needleTokens.length === 0) return false;
  return needleTokens.every((t) => haystackTokens.has(t));
}

/**
 * Match an OpeningSummary against the claim's opening hints. Prefers ECO
 * if the claim cites it (most specific); falls back to substring matching
 * on `name + ' ' + variation`.
 */
function matchOpening(opening: OpeningSummary, claim: ParsedScoutClaim["expected_in_data"]): boolean {
  if (claim.opening_eco && opening.eco) {
    if (lower(opening.eco) === lower(claim.opening_eco)) return true;
  }
  if (claim.opening_name) {
    const haystack = `${opening.name ?? ""} ${opening.variation ?? ""}`;
    return substringMatch(haystack, claim.opening_name);
  }
  return false;
}

function pickOpeningPool(
  scout: ScoutAnalytics,
  claim: ParsedScoutClaim["expected_in_data"],
  bucket: "weaknesses" | "strengths" | "all"
): OpeningSummary[] {
  const pool: OpeningSummary[] = [];
  const colors: ("white" | "black")[] = claim.opponent_color
    ? [claim.opponent_color]
    : ["white", "black"];
  for (const c of colors) {
    const slot = c === "white" ? scout.prep.asWhite : scout.prep.asBlack;
    if (bucket === "weaknesses" || bucket === "all") pool.push(...slot.weaknesses);
    if (bucket === "strengths" || bucket === "all") pool.push(...slot.strengths);
  }
  return pool;
}

function withinPct(stated: number | undefined, actual: number): boolean {
  if (stated === undefined) return false;
  return Math.abs(stated - actual) <= SCOUT_TOLERANCE.pct;
}

function withinRating(stated: number | undefined, actual: number | undefined): boolean {
  if (stated === undefined || actual === undefined) return false;
  return Math.abs(stated - actual) <= SCOUT_TOLERANCE.rating;
}

function withinCount(stated: number | undefined, actual: number): boolean {
  if (stated === undefined) return false;
  return Math.abs(stated - actual) <= SCOUT_TOLERANCE.count;
}

// ─────────────────────────────────────────────────────────────────────────
// matchScoutClaim — the 26-branch cross-checker
// ─────────────────────────────────────────────────────────────────────────

function matchScoutClaim(
  claim: ParsedScoutClaim,
  scout: ScoutAnalytics,
  collisions: Collisions | undefined
): MatchResult {
  const ex = claim.expected_in_data;

  switch (claim.claim_type) {
    // §3.1 Opening / prep ─────────────────────────────────────────────
    // Implementation deviation 2026-05-18: when multiple openings in the
    // pool match the claim's name (e.g., "Najdorf" matches both
    // asWhite.weaknesses [Sicilian Najdorf English Attack] AND
    // asBlack.strengths [Sicilian Defense Najdorf]), first-match-by-pool-
    // order is brittle. Instead, try every matching entry and report
    // matched if any one validates the stated value; this aligns with
    // coaching intent ("did the coach cite SOMETHING the scout supports?").
    case "opponent_plays_opening": {
      const pool = pickOpeningPool(scout, ex, "all");
      const matches = pool.filter((o) => matchOpening(o, ex));
      if (matches.length === 0) return { matched: false };
      const total = pool.reduce((s, o) => s + o.totalGames, 0);
      if (total === 0) return { matched: false, matchedEntry: { matchCount: matches.length } };
      for (const found of matches) {
        const computedPct = (found.totalGames / total) * 100;
        if (withinPct(ex.stated_pct, computedPct)) {
          return { matched: true, matchedEntry: { opening: found.name, computedPct } };
        }
      }
      return { matched: false, matchedEntry: { matchCount: matches.length } };
    }
    case "opponent_strength_opening": {
      const pool = pickOpeningPool(scout, ex, "strengths");
      const matches = pool.filter((o) => matchOpening(o, ex));
      if (matches.length === 0) return { matched: false };
      for (const found of matches) {
        if (withinPct(ex.stated_pct, found.scorePct)) {
          return { matched: true, matchedEntry: { opening: found.name, scorePct: found.scorePct } };
        }
      }
      return { matched: false, matchedEntry: { matchCount: matches.length } };
    }
    case "opponent_weakness_opening": {
      const pool = pickOpeningPool(scout, ex, "weaknesses");
      const matches = pool.filter((o) => matchOpening(o, ex));
      if (matches.length === 0) return { matched: false };
      for (const found of matches) {
        if (withinPct(ex.stated_pct, found.scorePct)) {
          return { matched: true, matchedEntry: { opening: found.name, scorePct: found.scorePct } };
        }
      }
      return { matched: false, matchedEntry: { matchCount: matches.length } };
    }

    // §3.2 Profile ────────────────────────────────────────────────────
    case "archetype": {
      if (!ex.stated_archetype) return { matched: false };
      const ok = substringMatch(scout.profile.archetype, ex.stated_archetype) ||
                 substringMatch(ex.stated_archetype, scout.profile.archetype);
      return { matched: ok, matchedEntry: { archetype: scout.profile.archetype } };
    }
    case "profile_dimension": {
      const dim = ex.dimension;
      if (!dim) return { matched: false };
      const actual = scout.profile[dim];
      if (ex.stated_value === undefined) return { matched: false };
      const ok = Math.abs(ex.stated_value - actual) <= SCOUT_TOLERANCE.scoreOutOfHundred;
      return { matched: ok, matchedEntry: { dimension: dim, actual } };
    }
    case "rating_by_timeclass": {
      const tc = ex.time_class;
      if (!tc) return { matched: false };
      const actual = scout.profile.ratings[tc];
      const ok = withinRating(ex.stated_rating, actual);
      return { matched: ok, matchedEntry: { time_class: tc, actual } };
    }
    case "peak_rating": {
      const ok = withinRating(ex.stated_rating, scout.profile.peakRating);
      return { matched: ok, matchedEntry: { peakRating: scout.profile.peakRating } };
    }
    case "low_rating": {
      const ok = withinRating(ex.stated_rating, scout.profile.lowRating);
      return { matched: ok, matchedEntry: { lowRating: scout.profile.lowRating } };
    }
    case "latest_rating": {
      const ok = withinRating(ex.stated_rating, scout.profile.latestRating);
      return { matched: ok, matchedEntry: { latestRating: scout.profile.latestRating } };
    }
    case "recent_form_trend": {
      // Coach claims "won X of last N". recent[] is the chronological list.
      const recent = scout.profile.recent;
      const lastN = ex.stated_value ?? recent.length;
      const window = recent.slice(Math.max(0, recent.length - lastN));
      const actualWins = window.filter((r) => r.outcome === "win").length;
      const actualDraws = window.filter((r) => r.outcome === "draw").length;
      const actualLosses = window.filter((r) => r.outcome === "loss").length;
      const winsOk = ex.stated_wins !== undefined ? withinCount(ex.stated_wins, actualWins) : true;
      const drawsOk = ex.stated_draws !== undefined ? withinCount(ex.stated_draws, actualDraws) : true;
      const lossesOk = ex.stated_losses !== undefined ? withinCount(ex.stated_losses, actualLosses) : true;
      // Require at least one of W/D/L was stated AND matches.
      const stated = [ex.stated_wins, ex.stated_draws, ex.stated_losses].filter((v) => v !== undefined);
      if (stated.length === 0) return { matched: false };
      return {
        matched: winsOk && drawsOk && lossesOk,
        matchedEntry: { window: window.length, actualWins, actualDraws, actualLosses },
      };
    }
    case "phase_elo": {
      const phase = ex.phase;
      if (!phase) return { matched: false };
      // "Endgame ELO 1800" → stated_rating present, compare directly to phaseElo[phase].
      // "Endgame ELO 200 below middlegame" → stated_value present (delta), compare
      // against |phaseElo[phase] − phaseElo.middle|; without an explicit second phase,
      // compare against |phaseElo[phase] − phaseElo.baseline|.
      if (ex.stated_rating !== undefined) {
        const actual = phase === "opening"
          ? scout.profile.phaseElo.opening
          : phase === "middle"
            ? scout.profile.phaseElo.middle
            : scout.profile.phaseElo.endgame;
        const ok = Math.abs(ex.stated_rating - actual) <= SCOUT_TOLERANCE.rating;
        return { matched: ok, matchedEntry: { phase, actual } };
      }
      if (ex.stated_value !== undefined) {
        const baseline = scout.profile.phaseElo.baseline;
        const target = phase === "opening"
          ? scout.profile.phaseElo.opening
          : phase === "middle"
            ? scout.profile.phaseElo.middle
            : scout.profile.phaseElo.endgame;
        const actualDelta = Math.abs(baseline - target);
        const ok = Math.abs(actualDelta - ex.stated_value) <= SCOUT_TOLERANCE.phaseDelta;
        return { matched: ok, matchedEntry: { phase, actualDelta } };
      }
      return { matched: false };
    }

    // §3.3 Stalker ────────────────────────────────────────────────────
    case "stalker_total": {
      if (ex.stated_value === undefined) return { matched: false };
      const ok = Math.abs(ex.stated_value - scout.stalker.total) <= SCOUT_TOLERANCE.scoreOutOfHundred;
      return { matched: ok, matchedEntry: { total: scout.stalker.total } };
    }
    case "stalker_factor": {
      const fid = ex.factor_id;
      if (!fid) return { matched: false };
      const factor = scout.stalker.factors.find((f) => f.id === fid);
      if (!factor) return { matched: false };
      if (ex.stated_value === undefined) {
        // Existence-only claim ("they tilt") matches if the factor is present.
        return { matched: true, matchedEntry: { factor: fid, actual: factor.score } };
      }
      const ok = Math.abs(ex.stated_value - factor.score) <= SCOUT_TOLERANCE.factorScore;
      return { matched: ok, matchedEntry: { factor: fid, actual: factor.score } };
    }

    // §3.4 Psychology ─────────────────────────────────────────────────
    case "tilt_pattern": {
      const ok = withinPct(ex.stated_pct, scout.psychology.tiltAfterLossLossRate);
      return { matched: ok, matchedEntry: { actual: scout.psychology.tiltAfterLossLossRate } };
    }
    case "timeout_pattern": {
      const ok = withinPct(ex.stated_pct, scout.psychology.timeoutRate);
      return { matched: ok, matchedEntry: { actual: scout.psychology.timeoutRate } };
    }
    case "resign_pattern": {
      const ok = withinPct(ex.stated_pct, scout.psychology.resignRate);
      return { matched: ok, matchedEntry: { actual: scout.psychology.resignRate } };
    }
    case "checkmate_rate": {
      const ok = withinPct(ex.stated_pct, scout.psychology.checkmateRate);
      return { matched: ok, matchedEntry: { actual: scout.psychology.checkmateRate } };
    }
    case "quick_loss_pattern": {
      const ok = withinPct(ex.stated_pct, scout.psychology.quickLossRate);
      return { matched: ok, matchedEntry: { actual: scout.psychology.quickLossRate } };
    }
    case "long_game_pattern": {
      const ok = withinPct(ex.stated_pct, scout.psychology.longGameLossRate);
      return { matched: ok, matchedEntry: { actual: scout.psychology.longGameLossRate } };
    }
    case "streak_claim": {
      if (ex.stated_value === undefined) return { matched: false };
      // Coach may name either max win or max loss streak; match either.
      const maxWin = scout.psychology.maxWinStreak;
      const maxLoss = scout.psychology.maxLossStreak;
      const okWin = withinCount(ex.stated_value, maxWin);
      const okLoss = withinCount(ex.stated_value, maxLoss);
      return {
        matched: okWin || okLoss,
        matchedEntry: { matchedAgainst: okWin ? "maxWinStreak" : okLoss ? "maxLossStreak" : null, maxWin, maxLoss },
      };
    }
    case "avg_game_length": {
      if (ex.stated_value === undefined) return { matched: false };
      const ok = Math.abs(ex.stated_value - scout.psychology.avgGameLength) <= SCOUT_TOLERANCE.plies;
      return { matched: ok, matchedEntry: { actual: scout.psychology.avgGameLength } };
    }

    // §3.5 Rivals / collisions / novelty / checklist / recent-form ────
    case "rival_record": {
      const name = ex.rival_name;
      if (!name) return { matched: false };
      const rival = scout.rivals.find((r) => substringMatch(r.name, name));
      if (!rival) return { matched: false };
      const winsOk = ex.stated_wins !== undefined ? withinCount(ex.stated_wins, rival.wins) : true;
      const drawsOk = ex.stated_draws !== undefined ? withinCount(ex.stated_draws, rival.draws) : true;
      const lossesOk = ex.stated_losses !== undefined ? withinCount(ex.stated_losses, rival.losses) : true;
      const pctOk = ex.stated_pct !== undefined ? withinPct(ex.stated_pct, rival.scorePct) : true;
      // Require at least one stated metric.
      const stated = [ex.stated_wins, ex.stated_draws, ex.stated_losses, ex.stated_pct].filter((v) => v !== undefined);
      if (stated.length === 0) {
        return { matched: true, matchedEntry: { rival: rival.name, games: rival.games } };
      }
      return {
        matched: winsOk && drawsOk && lossesOk && pctOk,
        matchedEntry: { rival: rival.name, actual: { wins: rival.wins, draws: rival.draws, losses: rival.losses, scorePct: rival.scorePct } },
      };
    }
    case "collision_edge": {
      if (!collisions) return { matched: false };
      const yourColor = ex.your_color;
      if (!yourColor) return { matched: false };
      const lines = yourColor === "white" ? collisions.whenYouPlayWhite : collisions.whenYouPlayBlack;
      const found = lines.find((l) =>
        ex.opening_eco
          ? lower(l.eco) === lower(ex.opening_eco)
          : ex.opening_name
            ? substringMatch(`${l.name} ${l.variation}`, ex.opening_name)
            : false
      );
      if (!found) return { matched: false };
      const ok = withinPct(ex.stated_pct, found.yourScorePct);
      return { matched: ok, matchedEntry: { line: found.name, yourScorePct: found.yourScorePct } };
    }
    case "novelty_finding": {
      // Match by gameId first, then by playedMove + ply, then existence.
      if (ex.novelty_game_id) {
        const found = scout.novelty.find((n) => n.gameId === ex.novelty_game_id);
        if (!found) return { matched: false };
        return { matched: true, matchedEntry: { gameId: found.gameId } };
      }
      if (ex.novelty_played_move !== undefined) {
        const found = scout.novelty.find(
          (n) => n.playedMove === ex.novelty_played_move &&
                 (ex.novelty_ply === undefined || withinCount(ex.novelty_ply, n.ply))
        );
        if (!found) return { matched: false };
        return { matched: true, matchedEntry: { playedMove: found.playedMove, ply: found.ply } };
      }
      // Generic "they deviated from book" — matches if there's any novelty entry.
      return { matched: scout.novelty.length > 0, matchedEntry: { count: scout.novelty.length } };
    }
    case "checklist_item": {
      const title = ex.checklist_title;
      if (!title) return { matched: false };
      const item = scout.checklist.find(
        (c) => substringMatch(c.title, title) || lower(c.id) === lower(title)
      );
      if (!item) return { matched: false };
      return { matched: true, matchedEntry: { id: item.id, severity: item.severity } };
    }
    case "recent_form_bucket": {
      const label = ex.form_bucket_label;
      if (!label) return { matched: false };
      const bucket = scout.recentBuckets.find((b) => substringMatch(b.label, label));
      if (!bucket) return { matched: false };
      const winsOk = ex.stated_wins !== undefined ? withinCount(ex.stated_wins, bucket.wins) : true;
      const drawsOk = ex.stated_draws !== undefined ? withinCount(ex.stated_draws, bucket.draws) : true;
      const lossesOk = ex.stated_losses !== undefined ? withinCount(ex.stated_losses, bucket.losses) : true;
      return {
        matched: winsOk && drawsOk && lossesOk,
        matchedEntry: { label: bucket.label, actual: { wins: bucket.wins, draws: bucket.draws, losses: bucket.losses } },
      };
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// countScoutOpportunities — for the citation-rate denominator
// ─────────────────────────────────────────────────────────────────────────

function notableDimension(score: number): boolean {
  // Notable if ≥10 above OR ≥10 below the 50 midpoint.
  return Math.abs(score - 50) >= OPP_THRESHOLD.dimensionNotable;
}

export function countScoutOpportunities(
  scout: ScoutAnalytics,
  collisions?: Collisions
): ScoutOpportunity[] {
  const opps: ScoutOpportunity[] = [];
  const push = (claim_type: ScoutClaimType, ref: unknown) =>
    opps.push({ dataSource: "scout", claim_type, ref });

  // §3.1 Opening / prep — each weakness/strength entry (both colors) = 1 opp each
  for (const c of ["asWhite", "asBlack"] as const) {
    const slot = scout.prep[c];
    slot.weaknesses.forEach((o) => {
      push("opponent_plays_opening", { color: c, name: o.name });
      push("opponent_weakness_opening", { color: c, name: o.name });
    });
    slot.strengths.forEach((o) => {
      push("opponent_plays_opening", { color: c, name: o.name });
      push("opponent_strength_opening", { color: c, name: o.name });
    });
  }

  // §3.2 Profile
  if (scout.profile.archetype) push("archetype", { archetype: scout.profile.archetype });
  (["ovr", "atk", "def", "time", "mind"] as const).forEach((dim) => {
    if (notableDimension(scout.profile[dim])) push("profile_dimension", { dim });
  });
  (["bullet", "blitz", "rapid", "classical", "daily"] as const).forEach((tc) => {
    if (scout.profile.ratings[tc] !== undefined) push("rating_by_timeclass", { tc });
  });
  if (scout.profile.peakRating !== undefined) push("peak_rating", { v: scout.profile.peakRating });
  if (scout.profile.lowRating !== undefined) push("low_rating", { v: scout.profile.lowRating });
  if (scout.profile.latestRating !== undefined) push("latest_rating", { v: scout.profile.latestRating });
  if (scout.profile.recent.length > 0) push("recent_form_trend", { n: scout.profile.recent.length });
  (["opening", "middle", "endgame"] as const).forEach((phase) => {
    const v = phase === "opening"
      ? scout.profile.phaseElo.opening
      : phase === "middle"
        ? scout.profile.phaseElo.middle
        : scout.profile.phaseElo.endgame;
    if (Math.abs(v - scout.profile.phaseElo.baseline) >= OPP_THRESHOLD.dimensionNotable * 5) {
      // Phase ELO is on the rating scale; ≥50 difference from baseline is notable.
      push("phase_elo", { phase });
    }
  });

  // §3.3 Stalker
  if (scout.stalker.total > 0) push("stalker_total", { total: scout.stalker.total });
  scout.stalker.factors.forEach((f) => {
    if (f.score > 0) push("stalker_factor", { id: f.id, score: f.score });
  });

  // §3.4 Psychology — threshold-based
  if (scout.psychology.tiltAfterLossLossRate >= scout.profile.lossRate + OPP_THRESHOLD.tiltDeltaPct) {
    push("tilt_pattern", { rate: scout.psychology.tiltAfterLossLossRate });
  }
  if (scout.psychology.timeoutRate > OPP_THRESHOLD.timeoutPct) {
    push("timeout_pattern", { rate: scout.psychology.timeoutRate });
  }
  if (scout.psychology.resignRate > OPP_THRESHOLD.resignPct) {
    push("resign_pattern", { rate: scout.psychology.resignRate });
  }
  if (scout.psychology.checkmateRate > OPP_THRESHOLD.checkmatePct) {
    push("checkmate_rate", { rate: scout.psychology.checkmateRate });
  }
  if (scout.psychology.quickLossRate > OPP_THRESHOLD.quickLossPct) {
    push("quick_loss_pattern", { rate: scout.psychology.quickLossRate });
  }
  if (scout.psychology.longGameLossRate > OPP_THRESHOLD.longGamePct) {
    push("long_game_pattern", { rate: scout.psychology.longGameLossRate });
  }
  if (scout.psychology.maxWinStreak >= OPP_THRESHOLD.streakNotable) {
    push("streak_claim", { kind: "win", v: scout.psychology.maxWinStreak });
  }
  if (scout.psychology.maxLossStreak >= OPP_THRESHOLD.streakNotable) {
    push("streak_claim", { kind: "loss", v: scout.psychology.maxLossStreak });
  }
  if (scout.psychology.avgGameLength > 0) push("avg_game_length", { plies: scout.psychology.avgGameLength });

  // §3.5 Rivals / collisions / novelty / checklist / recent-form
  scout.rivals.forEach((r) => push("rival_record", { name: r.name }));
  scout.novelty.forEach((n) => push("novelty_finding", { gameId: n.gameId, ply: n.ply }));
  scout.checklist.forEach((c) => push("checklist_item", { id: c.id }));
  scout.recentBuckets.forEach((b) => push("recent_form_bucket", { label: b.label }));
  if (collisions) {
    collisions.whenYouPlayWhite.forEach((l) => push("collision_edge", { your_color: "white", eco: l.eco }));
    collisions.whenYouPlayBlack.forEach((l) => push("collision_edge", { your_color: "black", eco: l.eco }));
  }

  return opps;
}

// ─────────────────────────────────────────────────────────────────────────
// JSON parser
// ─────────────────────────────────────────────────────────────────────────

function tryParseClaims(raw: string): ParsedScoutClaim[] | null {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const payload = fenced ? fenced[1].trim() : trimmed;
  try {
    const parsed = JSON.parse(payload);
    if (!Array.isArray(parsed)) return null;
    return parsed as ParsedScoutClaim[];
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// validateScoutCitation — public entry point
// ─────────────────────────────────────────────────────────────────────────

/**
 * Stage A.6 scout-citation validator. Parses the LLM response for
 * factual_scouting_claims and cross-checks each against ScoutAnalytics +
 * Collisions. Same parser-then-cross-check shape as PR 1.B's
 * validateFeatureDeltaCitations.
 *
 * Library-only at this commit (Stage A.6). The pipeline integration that
 * threads scout output into runValidationPipeline lands in Stage A.9 via
 * the dataSources extension.
 */
export async function validateScoutCitation(opts: ScoutCitationOpts): Promise<ValidatorResult> {
  const confidenceThreshold = opts.confidenceThreshold ?? PARSER_LOW_CONFIDENCE_THRESHOLD;
  const parseCall = opts.parseCall ?? defaultEvalParserCall;

  const baseContext = {
    correlation_id: opts.correlationId,
  } as const;

  const issues: ValidatorIssue[] = [];
  const telemetry: TelemetryEvent[] = [];

  const userTurn = buildScoutCitationUserTurn({
    llmResponse: opts.llmResponse,
    opponentUsername: opts.opponentUsername,
    primaryTimeClass: opts.primaryTimeClass,
  });

  const parsed = await parseCall({ system: SCOUT_CITATION_PARSER_SYSTEM, user: userTurn });
  const claims = tryParseClaims(parsed.raw);

  if (claims === null) {
    telemetry.push(
      createTelemetryEvent({
        check_name: "scout_citation_parser",
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
    if (c.claim_class !== "factual_scouting_claim") continue;

    if (c.confidence < confidenceThreshold) {
      telemetry.push(
        createTelemetryEvent({
          check_name: "scout_citation_parser",
          fire_reason: "parser_low_confidence",
          llm_span: c.claim_text,
          expected: `confidence >= ${confidenceThreshold}`,
          actual: c.confidence,
          context: baseContext,
        })
      );
      continue;
    }

    const match = matchScoutClaim(c, opts.scout, opts.collisions);

    if (!match.matched) {
      issues.push({
        check_name: "scout_citation_unsupported",
        severity: "error",
        llm_span: c.claim_text,
        expected: { claim_type: c.claim_type, expected_in_data: c.expected_in_data },
        actual: match.matchedEntry ?? null,
        detail: `LLM cited scouting claim "${c.claim_text}" (type=${c.claim_type}); no matching entry in scout data.`,
        parser_confidence: c.confidence,
      });
      telemetry.push(
        createTelemetryEvent({
          check_name: "scout_citation_unsupported",
          fire_reason: "unsupported_citation",
          llm_span: c.claim_text,
          // Per Aayan 2026-05-18 Stage C follow-up: telemetry carries claim_type
          // explicitly so the sweep can aggregate per-claim-type firing rates.
          expected: { claim_type: c.claim_type, expected_in_data: c.expected_in_data },
          actual: match.matchedEntry ?? null,
          context: baseContext,
        })
      );
    } else {
      telemetry.push(
        createTelemetryEvent({
          check_name: "scout_citation",
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
