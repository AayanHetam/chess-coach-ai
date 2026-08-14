// ─────────────────────────────────────────────────────────────────────────────
// Scout Analytics
//
// Consumes a fully-normalised game list from /api/scout and produces the full
// dashboard bundle the UI renders: profile (strength dimensions), Tells
// Score, targeted prep by color, pre-game checklist, frequent rivals,
// psychology, and recent-form buckets.
//
// All math is deliberately bounded to 0-100 ranges so the UI can render them
// uniformly; formulas are heuristics tuned to feel responsive on typical
// 100-2000 game histories. They are NOT statistically calibrated.
// ─────────────────────────────────────────────────────────────────────────────

import {
  ScoutGame,
  ScoutAnalytics,
  OpeningTreeNode,
  OpeningSummary,
  ProfileSnapshot,
  TellsProfile,
  Tell,
  ClockWindows,
  TimeBucket,
  TargetedPrep,
  ChecklistItem,
  FrequentRival,
  PsychologySnapshot,
  RecentFormBucket,
  RatingsByTimeClass,
  TimeClass,
  RecentResult,
  PhaseElo,
  NoveltyFinding,
} from '@/types/scout';
import { buildOpeningTree } from '@/lib/scoutService';
import { getOpeningName } from '@/lib/scoutEco';

// ─── Helpers ────────────────────────────────────────────────────────────────

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, v));
}

function playerColor(g: ScoutGame, target: string): 'w' | 'b' | null {
  const t = target.toLowerCase();
  if (g.whiteUsername.toLowerCase() === t) return 'w';
  if (g.blackUsername.toLowerCase() === t) return 'b';
  return null;
}

function outcomeFor(g: ScoutGame, color: 'w' | 'b'): 'win' | 'draw' | 'loss' | null {
  if (g.result === '1-0') return color === 'w' ? 'win' : 'loss';
  if (g.result === '0-1') return color === 'b' ? 'win' : 'loss';
  if (g.result === '1/2-1/2') return 'draw';
  return null;
}

function opponentName(g: ScoutGame, color: 'w' | 'b'): string {
  return color === 'w' ? g.blackUsername : g.whiteUsername;
}

function targetRating(g: ScoutGame, color: 'w' | 'b'): number | undefined {
  return color === 'w' ? g.whiteRating : g.blackRating;
}

// ─── Profile snapshot ───────────────────────────────────────────────────────

function computeArchetype(stats: {
  atk: number;
  def: number;
  time: number;
  mind: number;
}): string {
  const { atk, def, time, mind } = stats;
  const max = Math.max(atk, def, time, mind);
  const spread = max - Math.min(atk, def, time, mind);
  if (spread < 6) return 'The All-Rounder';
  if (atk === max) return 'The Berserker';
  if (def === max) return 'The Fortress';
  if (time === max) return 'The Clockwork';
  return 'The Stoic';
}

function computeRatings(games: ScoutGame[], target: string): {
  ratings: RatingsByTimeClass;
  latest?: number;
  peak?: number;
  low?: number;
} {
  // Latest + per-class-average.
  const byClass: Partial<Record<TimeClass, { sum: number; n: number }>> = {};
  let latest: { date: number; rating: number } | undefined;
  let peak = -Infinity;
  let low = Infinity;
  for (const g of games) {
    const c = playerColor(g, target);
    if (!c) continue;
    const r = targetRating(g, c);
    if (!r || r < 100) continue;
    const tc: TimeClass = g.timeClass ?? 'unknown';
    const slot = byClass[tc] ?? { sum: 0, n: 0 };
    slot.sum += r;
    slot.n += 1;
    byClass[tc] = slot;
    if (!latest || g.date > latest.date) latest = { date: g.date, rating: r };
    if (r > peak) peak = r;
    if (r < low) low = r;
  }
  const ratings: RatingsByTimeClass = {};
  for (const k of ['bullet', 'blitz', 'rapid', 'classical', 'daily'] as TimeClass[]) {
    const s = byClass[k];
    if (s && s.n > 0) (ratings as any)[k] = Math.round(s.sum / s.n);
  }
  return {
    ratings,
    latest: latest?.rating,
    peak: peak === -Infinity ? undefined : peak,
    low: low === Infinity ? undefined : low,
  };
}

// ─── Clock windows ──────────────────────────────────────────────────────────
//
// Every game carries an absolute timestamp and nothing read it. Bucketing the
// record by hour and weekday answers the one question a scouting report should
// answer right before you click "play": is now a good time to catch them?

/**
 * Minimum games in a bucket before its rate is reportable.
 *
 * Without a floor a single 3 AM loss renders as "0% at 3 AM" — a confident
 * claim built on n=1. Eight is enough that a bucket has to be genuinely bad
 * rather than unlucky.
 */
export const TIME_BUCKET_MIN_GAMES = 8;

/**
 * Wilson score interval for a proportion — the standard answer to "rank things
 * by rate when the sample sizes differ wildly".
 *
 * Exported for the tests, which pin the small-sample behaviour that motivated it.
 */
export function wilsonBounds(
  p: number,
  n: number,
  z = 1.96
): { lower: number; upper: number } {
  if (n <= 0) return { lower: 0, upper: 1 };
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / denom;
  return {
    lower: Math.max(0, centre - margin),
    upper: Math.min(1, centre + margin),
  };
}

function emptyBucket(index: number): TimeBucket {
  return {
    index,
    games: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    scorePct: 0,
    timeoutPct: 0,
    reliable: false,
  };
}

function finalizeBucket(b: TimeBucket, timeouts: number): TimeBucket {
  const games = b.games;
  const scorePct = games > 0 ? ((b.wins + 0.5 * b.draws) / games) * 100 : 0;
  return {
    ...b,
    scorePct: Math.round(scorePct * 10) / 10,
    timeoutPct: b.losses > 0 ? Math.round((timeouts / b.losses) * 1000) / 10 : 0,
    reliable: games >= TIME_BUCKET_MIN_GAMES,
  };
}

function computeClockWindows(games: ScoutGame[], target: string): ClockWindows {
  const hours = Array.from({ length: 24 }, (_, i) => emptyBucket(i));
  const weekdays = Array.from({ length: 7 }, (_, i) => emptyBucket(i));
  const hourTimeouts = new Array(24).fill(0);
  const weekdayTimeouts = new Array(7).fill(0);
  let sampled = 0;

  for (const g of games) {
    // A missing or zero date is "unknown", not 1970 — dropping it is the only
    // honest option, and `sampled` reports how much survived.
    if (!g.date || g.date <= 0) continue;
    const c = playerColor(g, target);
    if (!c) continue;
    const o = outcomeFor(g, c);
    if (!o) continue;

    const d = new Date(g.date);
    const h = d.getHours();
    const wd = d.getDay();
    if (!Number.isFinite(h) || !Number.isFinite(wd)) continue;

    sampled += 1;
    for (const b of [hours[h], weekdays[wd]]) {
      b.games += 1;
      if (o === 'win') b.wins += 1;
      else if (o === 'draw') b.draws += 1;
      else b.losses += 1;
    }
    if (o === 'loss' && g.termination === 'timeout') {
      hourTimeouts[h] += 1;
      weekdayTimeouts[wd] += 1;
    }
  }

  const byHour = hours.map((b, i) => finalizeBucket(b, hourTimeouts[i]));
  const byWeekday = weekdays.map((b, i) => finalizeBucket(b, weekdayTimeouts[i]));

  // Rank the extremes by Wilson score bounds, not raw rate.
  //
  // Raw rate lets the smallest buckets hijack both ends, because small samples
  // produce the loudest rates — a 10-game hour at 60% would outrank a 96-game
  // hour at 50% and get printed as advice. Wilson asks "what can we actually
  // defend at 95% confidence", which penalises thin samples in *both*
  // directions while still respecting a small sample that is genuinely extreme.
  //
  // Strongest ranks on the lower bound (confidently high); weakest ranks on the
  // upper bound (confidently low).
  const reliableHours = byHour.filter(b => b.reliable);
  const weakestHour = reliableHours.length
    ? reliableHours.reduce((lo, b) =>
        wilsonBounds(b.scorePct / 100, b.games).upper <
        wilsonBounds(lo.scorePct / 100, lo.games).upper
          ? b
          : lo
      )
    : undefined;
  const strongestHour = reliableHours.length
    ? reliableHours.reduce((hi, b) =>
        wilsonBounds(b.scorePct / 100, b.games).lower >
        wilsonBounds(hi.scorePct / 100, hi.games).lower
          ? b
          : hi
      )
    : undefined;
  const busiestHour = byHour.some(b => b.games > 0)
    ? byHour.reduce((mx, b) => (b.games > mx.games ? b : mx))
    : undefined;

  return { byHour, byWeekday, weakestHour, strongestHour, busiestHour, sampled };
}

// ─── Strength ───────────────────────────────────────────────────────────────
//
// The headline number has to answer "how strong is this opponent", and the
// only signal that carries that is rating. Win/loss ratios cannot: rating
// pools are self-equilibrating, so a 3200 and a 1200 both hover near a 50%
// score against their own opposition. Scoring off ratios alone put Carlsen
// five points clear of a club player.

/**
 * Rating → 0-100, by interpolation between anchor points.
 *
 * Anchors rather than a formula because the mapping is a judgement call about
 * what each band should *feel* like, and judgement calls should be legible and
 * tunable. Roughly calibrated to chess.com/Lichess blitz.
 */
const STRENGTH_ANCHORS: Array<[rating: number, score: number]> = [
  [400, 4],
  [800, 14],
  [1000, 22],
  [1200, 30],
  [1400, 38],
  [1600, 47],
  [1800, 56],
  [2000, 65],
  [2200, 74],
  [2400, 82],
  [2600, 88],
  [2800, 93],
  [3000, 96],
  [3200, 98],
  [3400, 100],
];

export function strengthFromRating(rating: number): number {
  const first = STRENGTH_ANCHORS[0];
  const last = STRENGTH_ANCHORS[STRENGTH_ANCHORS.length - 1];
  if (rating <= first[0]) return first[1];
  if (rating >= last[0]) return last[1];

  for (let i = 0; i < STRENGTH_ANCHORS.length - 1; i += 1) {
    const [r0, s0] = STRENGTH_ANCHORS[i];
    const [r1, s1] = STRENGTH_ANCHORS[i + 1];
    if (rating >= r0 && rating <= r1) {
      const t = (rating - r0) / (r1 - r0);
      return s0 + t * (s1 - s0);
    }
  }
  return last[1];
}

/** Human-readable band for the strength score — explains the number instead of asserting it. */
export function strengthBand(rating: number): string {
  if (rating >= 2900) return 'World elite';
  if (rating >= 2600) return 'Super-GM level';
  if (rating >= 2400) return 'Master level';
  if (rating >= 2200) return 'Expert';
  if (rating >= 1900) return 'Advanced';
  if (rating >= 1600) return 'Intermediate';
  if (rating >= 1300) return 'Improver';
  if (rating >= 1000) return 'Casual';
  return 'Beginner';
}

/**
 * The rating the strength score is anchored to: the player's best across time
 * classes, which is the ceiling they have actually demonstrated. Falls back to
 * peak, then latest, then undefined when the archive carries no ratings at all.
 */
function anchorRating(
  ratings: RatingsByTimeClass,
  peak?: number,
  latest?: number
): number | undefined {
  const values = Object.values(ratings).filter(
    (r): r is number => typeof r === 'number' && r > 0
  );
  if (values.length > 0) return Math.max(...values);
  return peak ?? latest;
}

/**
 * Longest losing streak expected by chance, given n games at loss rate p.
 *
 * Raw streak length grows with archive size, so penalising it directly scores
 * "how many games did we fetch" rather than "does this player tilt". Comparing
 * observed against expected removes the sample-size dependence.
 */
function expectedMaxLossStreak(n: number, p: number): number {
  if (n <= 1 || p <= 0.01) return 1;
  if (p >= 0.99) return n;
  return Math.max(1, Math.log(n * (1 - p)) / Math.log(1 / p));
}

/**
 * How much worse than chance the player's worst slide was: 1 = exactly as
 * expected, >1 = streakier than chance, <1 = steadier.
 */
function streakExcess(maxLossStreak: number, n: number, lossRate: number): number {
  const expected = expectedMaxLossStreak(n, lossRate);
  if (expected <= 0) return 1;
  return maxLossStreak / expected;
}

/** How much more often they lose after a loss than they lose in general. */
function tiltLift(tiltAfterLossLossRate: number, lossRate: number): number {
  if (lossRate <= 0.01) return 1;
  return tiltAfterLossLossRate / lossRate;
}

function computeRecentResults(games: ScoutGame[], target: string, n = 20): RecentResult[] {
  const sorted = [...games].sort((a, b) => a.date - b.date);
  const out: RecentResult[] = [];
  for (let i = sorted.length - 1; i >= 0 && out.length < n; i--) {
    const g = sorted[i];
    const c = playerColor(g, target);
    if (!c) continue;
    const o = outcomeFor(g, c);
    if (!o) continue;
    out.push({ outcome: o, date: g.date });
  }
  return out.reverse(); // chronological
}

function computeProfile(
  games: ScoutGame[],
  target: string,
  psychology: PsychologySnapshot,
  counts: { wins: number; draws: number; losses: number; total: number },
  topThreeShare: number
): ProfileSnapshot {
  const { wins, draws, losses, total } = counts;
  const winRate = total ? wins / total : 0;
  const drawRate = total ? draws / total : 0;
  const lossRate = total ? losses / total : 0;

  const ratingInfo = computeRatings(games, target);

  // Absolute strength, from rating. This is the spine of the profile: every
  // dimension is a deviation around it, so a 3200 cannot read as a 1200 no
  // matter how their results-against-peers happen to fall.
  const anchor = anchorRating(ratingInfo.ratings, ratingInfo.peak, ratingInfo.latest);
  const baseline = anchor === undefined ? 50 : strengthFromRating(anchor);

  // Behavioural signals, each expressed as a deviation in roughly [-1, +1]
  // around typical play. These describe *style*, not strength.
  const quickWinRate = clamp01(1 - psychology.avgGameLength / 80);
  const atkDev =
    1.6 * (winRate - 0.5) + 0.8 * (psychology.checkmateRate - 0.25) + 0.4 * (quickWinRate - 0.3);

  const defDev =
    1.6 * (0.5 - lossRate) + 0.8 * (drawRate - 0.1) - 0.8 * (clamp01(psychology.quickLossRate) - 0.2);

  const timeDev = -2.5 * (psychology.timeoutRate - 0.1) - 0.4 * clamp01((psychology.avgGameLength - 60) / 40);

  // Both composure inputs are normalised against what chance alone produces at
  // this sample size and loss rate, so a longer archive no longer drags the
  // score toward the floor.
  const excess = streakExcess(psychology.maxLossStreak, total, lossRate);
  const lift = tiltLift(psychology.tiltAfterLossLossRate, lossRate);
  const mindDev = -0.9 * (excess - 1) - 1.1 * (lift - 1);

  // Spread controls how far style can move a dimension off the strength
  // baseline. Scaled by the headroom on the side it is moving toward, so an
  // elite profile shows its relative weaknesses without every strength pinning
  // flat at 100 — saturation there would throw away the signal the panel exists
  // to show.
  const SPREAD = 14;
  const dim = (dev: number) => {
    const d = Math.max(-1.2, Math.min(1.2, dev));
    const headroom = d >= 0 ? 100 - baseline : baseline;
    const factor = Math.min(1, headroom / 30);
    return clamp(baseline + SPREAD * d * factor, 1, 100);
  };

  const atkR = Math.round(dim(atkDev));
  const defR = Math.round(dim(defDev));
  const timeR = Math.round(dim(timeDev));
  const mindR = Math.round(dim(mindDev));

  // OVR is the strength score itself, not the average of the dimensions — it
  // means one thing and the reader can check it against the rating shown
  // beside it.
  const ovr = Math.round(baseline);

  const archetype = computeArchetype({ atk: atkR, def: defR, time: timeR, mind: mindR });

  const recent = computeRecentResults(games, target, 20);
  const recentAccuracy =
    recent.length === 0
      ? 0
      : Math.round((recent.filter(r => r.outcome !== 'loss').length / recent.length) * 100);

  const dates = games.map(g => g.date).filter(d => d > 0);
  const spanDays =
    dates.length > 1 ? Math.round((Math.max(...dates) - Math.min(...dates)) / 86_400_000) : 0;

  const phaseElo = computePhaseElo(games, target, ratingInfo.ratings, psychology, topThreeShare);

  return {
    ovr,
    atk: atkR,
    def: defR,
    time: timeR,
    mind: mindR,
    ratings: ratingInfo.ratings,
    latestRating: ratingInfo.latest,
    peakRating: ratingInfo.peak,
    lowRating: ratingInfo.low,
    totalGames: total,
    spanDays,
    recent,
    recentAccuracy,
    winRate,
    drawRate,
    lossRate,
    archetype,
    phaseElo,
  };
}

function clamp01(v: number): number { return Math.max(0, Math.min(1, v)); }

// ─── Phase ELO (opening / middlegame / endgame strengths) ──────────────────

function pickBaselineRating(ratings: RatingsByTimeClass): number {
  // Prefer the most "serious" time class the player has data for.
  for (const key of ['blitz', 'rapid', 'classical', 'bullet', 'daily'] as TimeClass[]) {
    const r = (ratings as any)[key];
    if (typeof r === 'number' && r > 0) return r;
  }
  return 1500;
}

/**
 * Decomposes a player's overall strength into opening/middle/endgame ELO.
 *
 * All three start from the same `baseline` rating and are then adjusted by:
 *   - opening: repertoire concentration (narrow rep → better theory) +
 *              quick-loss penalty (getting mated early = weak openings)
 *   - middle:  anchored to baseline; win-rate delta vs overall in the 30–100
 *              ply band pulls it up or down.
 *   - endgame: win-rate in games > 100 plies vs overall, plus a timeout penalty
 *              (losing on the clock in long games hurts endgame ELO).
 *
 * Deltas are clamped to ±250 per phase. The returned ELO is also clamped to
 * [600, 3000] so downstream engine consumers never get nonsense values.
 */
function computePhaseElo(
  games: ScoutGame[],
  target: string,
  ratings: RatingsByTimeClass,
  psychology: PsychologySnapshot,
  topThreeShare: number
): PhaseElo {
  const baseline = pickBaselineRating(ratings);

  // Per-phase win rates.
  let overallWin = 0, overallN = 0;
  let midWin = 0, midN = 0;
  let endWin = 0, endN = 0;
  let openingDisasters = 0, openingDisasterGames = 0;

  for (const g of games) {
    const c = playerColor(g, target);
    if (!c) continue;
    const o = outcomeFor(g, c);
    if (!o) continue;
    const ply = g.numMoves ?? g.moves.length;

    overallN += 1;
    if (o === 'win') overallWin += 1;

    if (ply > 30 && ply <= 100) {
      midN += 1;
      if (o === 'win') midWin += 1;
    } else if (ply > 100) {
      endN += 1;
      if (o === 'win') endWin += 1;
    } else if (ply > 0 && ply <= 30) {
      openingDisasterGames += 1;
      if (o === 'loss') openingDisasters += 1;
    }
  }

  const overallRate = overallN > 0 ? overallWin / overallN : 0.5;
  const midRate = midN > 0 ? midWin / midN : overallRate;
  const endRate = endN > 0 ? endWin / endN : overallRate;
  const openingDisasterRate =
    openingDisasterGames > 0 ? openingDisasters / openingDisasterGames : 0;

  // Opening: repertoire concentration + opening-disaster penalty.
  const openingDelta =
    Math.round(
      clamp(
        // Narrow rep (topThreeShare high) → +100 at most.
        160 * (topThreeShare - 0.45) -
          // Opening disasters → up to -120.
          120 * openingDisasterRate,
        -250,
        250
      )
    );

  // Middle: baseline, nudged by middle-phase net result.
  const middleDelta = Math.round(clamp(400 * (midRate - overallRate), -250, 250));

  // Endgame: long-game performance, but heavily penalise timeouts in long games.
  const endgameDelta = Math.round(
    clamp(
      400 * (endRate - overallRate) - 220 * psychology.timeoutRate,
      -250,
      250
    )
  );

  const clampElo = (v: number) => Math.round(Math.max(600, Math.min(3000, v)));

  return {
    baseline,
    opening: clampElo(baseline + openingDelta),
    middle: clampElo(baseline + middleDelta),
    endgame: clampElo(baseline + endgameDelta),
  };
}

// ─── Psychology ─────────────────────────────────────────────────────────────

function computePsychology(games: ScoutGame[], target: string): PsychologySnapshot {
  const sorted = [...games].sort((a, b) => a.date - b.date);
  let lengthSum = 0;
  let lengthN = 0;
  let lossCount = 0;
  let quickLosses = 0;
  let longLosses = 0;
  let timeoutLosses = 0;
  let resignLosses = 0;
  let winCount = 0;
  let checkmateWins = 0;
  let curWinStreak = 0;
  let maxWinStreak = 0;
  let curLossStreak = 0;
  let maxLossStreak = 0;
  let lastOutcome: 'win' | 'draw' | 'loss' | null = null;
  let afterLossGames = 0;
  let afterLossLosses = 0;

  for (const g of sorted) {
    const color = playerColor(g, target);
    if (!color) continue;
    const o = outcomeFor(g, color);
    if (!o) continue;

    const ply = g.numMoves ?? g.moves.length;
    lengthSum += ply;
    lengthN += 1;

    if (lastOutcome === 'loss') {
      afterLossGames += 1;
      if (o === 'loss') afterLossLosses += 1;
    }

    if (o === 'win') {
      winCount += 1;
      if (g.termination === 'checkmate') checkmateWins += 1;
      curWinStreak += 1;
      if (curWinStreak > maxWinStreak) maxWinStreak = curWinStreak;
      curLossStreak = 0;
    } else if (o === 'loss') {
      lossCount += 1;
      if (ply > 0 && ply < 50) quickLosses += 1;
      if (ply > 120) longLosses += 1;
      if (g.termination === 'timeout') timeoutLosses += 1;
      if (g.termination === 'resign') resignLosses += 1;
      curLossStreak += 1;
      if (curLossStreak > maxLossStreak) maxLossStreak = curLossStreak;
      curWinStreak = 0;
    } else {
      curWinStreak = 0;
      curLossStreak = 0;
    }

    lastOutcome = o;
  }

  const avg = lengthN > 0 ? lengthSum / lengthN : 0;
  return {
    avgGameLength: avg,
    quickLossRate: lossCount > 0 ? quickLosses / lossCount : 0,
    longGameLossRate: lossCount > 0 ? longLosses / lossCount : 0,
    timeoutRate: lossCount > 0 ? timeoutLosses / lossCount : 0,
    resignRate: lossCount > 0 ? resignLosses / lossCount : 0,
    checkmateRate: winCount > 0 ? checkmateWins / winCount : 0,
    maxWinStreak,
    maxLossStreak,
    tiltAfterLossLossRate: afterLossGames > 0 ? afterLossLosses / afterLossGames : 0,
  };
}

// ─── Tells ──────────────────────────────────────────────────────────

function repertoireDiversity(games: ScoutGame[], target: string): {
  uniqueFirstMoves: number;
  topThreeShare: number;
} {
  // Look at the *opponent's* first move of the game (target color dependent).
  const counts = new Map<string, number>();
  let n = 0;
  for (const g of games) {
    const c = playerColor(g, target);
    if (!c) continue;
    if (g.moves.length === 0) continue;
    // A player's first *own* move:
    //   - when target is white, moves[0] is their own 1.?
    //   - when target is black, moves[1] is their first reply
    const idx = c === 'w' ? 0 : 1;
    const mv = g.moves[idx];
    if (!mv) continue;
    counts.set(mv, (counts.get(mv) ?? 0) + 1);
    n += 1;
  }
  if (n === 0) return { uniqueFirstMoves: 0, topThreeShare: 0 };
  const sorted = Array.from(counts.values()).sort((a, b) => b - a);
  const top3 = sorted.slice(0, 3).reduce((s, v) => s + v, 0);
  return {
    uniqueFirstMoves: counts.size,
    topThreeShare: top3 / n,
  };
}

function computeTells(
  games: ScoutGame[],
  target: string,
  psychology: PsychologySnapshot,
  precomputedRep?: { uniqueFirstMoves: number; topThreeShare: number }
): TellsProfile {
  const rep = precomputedRep ?? repertoireDiversity(games, target);

  const time_trouble = Math.round(
    clamp(
      15 +
        140 * psychology.timeoutRate +
        25 * clamp01((psychology.avgGameLength - 70) / 40)
    )
  );
  // Normalised against chance for this sample size — the raw streak length
  // grows with archive size, which made every long-history player look tilty.
  let played = 0;
  let lost = 0;
  for (const g of games) {
    const c = playerColor(g, target);
    if (!c) continue;
    const o = outcomeFor(g, c);
    if (!o) continue;
    played += 1;
    if (o === 'loss') lost += 1;
  }
  const lossRate = played > 0 ? lost / played : 0;
  const excess = streakExcess(psychology.maxLossStreak, played, lossRate);
  const lift = tiltLift(psychology.tiltAfterLossLossRate, lossRate);
  const tilts = Math.round(
    clamp(30 + 45 * (excess - 1) + 55 * (lift - 1))
  );
  const limited_rep = Math.round(clamp(100 - rep.uniqueFirstMoves * 7));
  const repetitive = Math.round(clamp(rep.topThreeShare * 100));

  const factors: Tell[] = [
    { id: 'time_trouble', label: 'Time trouble', score: time_trouble },
    { id: 'tilts', label: 'Tilts easily', score: tilts },
    { id: 'limited_rep', label: 'Limited repertoire', score: limited_rep },
    { id: 'repetitive', label: 'Repetitive patterns', score: repetitive },
  ];
  const total = Math.round(
    0.3 * time_trouble + 0.25 * tilts + 0.25 * limited_rep + 0.2 * repetitive
  );
  const predScore = (limited_rep + repetitive) / 2;
  const predictability = predScore >= 70 ? 'High' : predScore >= 40 ? 'Medium' : 'Low';

  return { total, factors, predictability };
}

// ─── Targeted prep (weaknesses & strengths) ─────────────────────────────────

function collectOpeningSummaries(
  tree: OpeningTreeNode,
  mode: 'weak' | 'strong',
  depthRange: [number, number] = [3, 8],
  minGames = 5
): OpeningSummary[] {
  const out: OpeningSummary[] = [];
  const seen = new Map<string, OpeningSummary>(); // dedupe by eco+name

  const walk = (node: OpeningTreeNode, path: string[]): void => {
    const depth = path.length;
    if (depth >= depthRange[0] && depth <= depthRange[1] && node.totalGames >= minGames) {
      const score = (node.wins + 0.5 * node.draws) / Math.max(1, node.totalGames) * 100;
      const qualify = mode === 'weak' ? score < 45 : score > 55;
      if (qualify) {
        const info = getOpeningName(path);
        const summary: OpeningSummary = {
          eco: info.eco,
          name: info.name,
          variation: info.variation,
          moves: [...path],
          totalGames: node.totalGames,
          scorePct: score,
          wins: node.wins,
          draws: node.draws,
          losses: node.losses,
          lowSample: node.totalGames < 10,
        };
        const key = `${info.eco}|${info.name}`;
        const prev = seen.get(key);
        if (!prev || prev.totalGames < summary.totalGames) {
          seen.set(key, summary);
        }
      }
    }
    for (const child of node.children) {
      walk(child, [...path, child.move]);
    }
  };
  walk(tree, []);

  seen.forEach(s => out.push(s));
  // Rank: weaknesses sort by (bad score) * log(games); strengths sort by (good score) * log(games).
  out.sort((a, b) => {
    const sa =
      mode === 'weak'
        ? (50 - a.scorePct) * Math.log(a.totalGames + 1)
        : (a.scorePct - 50) * Math.log(a.totalGames + 1);
    const sb =
      mode === 'weak'
        ? (50 - b.scorePct) * Math.log(b.totalGames + 1)
        : (b.scorePct - 50) * Math.log(b.totalGames + 1);
    return sb - sa;
  });
  return out.slice(0, 5);
}

function computeTargetedPrep(
  games: ScoutGame[],
  target: string,
  precomputed?: { treeWhite: OpeningTreeNode; treeBlack: OpeningTreeNode }
): TargetedPrep {
  // Build one tree per color, then mine weaknesses / strengths.
  const treeWhite = precomputed?.treeWhite ?? buildOpeningTree(games, target, 'white', 14, 2);
  const treeBlack = precomputed?.treeBlack ?? buildOpeningTree(games, target, 'black', 14, 2);
  return {
    // When target plays Black, WE play White → opponent weaknesses (our exploits) come from target's Black tree.
    asWhite: {
      weaknesses: collectOpeningSummaries(treeBlack, 'weak'),
      strengths: collectOpeningSummaries(treeBlack, 'strong'),
    },
    // Symmetric: we play Black, target plays White → target's White tree.
    asBlack: {
      weaknesses: collectOpeningSummaries(treeWhite, 'weak'),
      strengths: collectOpeningSummaries(treeWhite, 'strong'),
    },
  };
}

// ─── Novelty / deviation finder ─────────────────────────────────────────────

/** Pick the most-played child at a tree node (the target's "book move" here). */
function bookChildOf(node: OpeningTreeNode): OpeningTreeNode | null {
  if (!node.children.length) return null;
  let best = node.children[0];
  for (const c of node.children) {
    if (c.totalGames > best.totalGames) best = c;
  }
  return best;
}

/**
 * Scan each target game and find the earliest ply where the target deviated
 * from their *own* most-popular line (as recorded in their color-specific tree).
 *
 * Only deviations in the first 20 plies are considered; this is where
 * preparation matters. Parent positions need enough sample (default 8 games)
 * and the book move needs to dominate (>=40% share) to count.
 */
function computeNovelty(
  games: ScoutGame[],
  target: string,
  trees: { white: OpeningTreeNode; black: OpeningTreeNode }
): NoveltyFinding[] {
  const findings: NoveltyFinding[] = [];
  const MIN_PARENT_GAMES = 8;
  const MIN_BOOK_SHARE = 0.4;
  const MAX_PLY = 20;

  for (const g of games) {
    const c = playerColor(g, target);
    if (!c) continue;
    const outcome = outcomeFor(g, c);
    if (!outcome) continue;
    const tree = c === 'w' ? trees.white : trees.black;

    let node: OpeningTreeNode | null = tree;
    const path: string[] = [];

    // Only plies where target is to move matter for *their* repertoire:
    //   - target white: plies 0, 2, 4, ...
    //   - target black: plies 1, 3, 5, ...
    const targetPlyParity = c === 'w' ? 0 : 1;

    for (let i = 0; i < Math.min(g.moves.length, MAX_PLY); i++) {
      if (!node) break;
      const mv = g.moves[i];
      if (i % 2 === targetPlyParity) {
        // Target's move — evaluate deviation BEFORE descending.
        const book = bookChildOf(node);
        if (
          book &&
          node.totalGames >= MIN_PARENT_GAMES &&
          book.totalGames / Math.max(1, node.totalGames) >= MIN_BOOK_SHARE &&
          book.move !== mv
        ) {
          const info = getOpeningName(path);
          findings.push({
            moves: [...path],
            playedMove: mv,
            bookMove: book.move,
            bookFrequency: book.totalGames,
            totalGames: node.totalGames,
            ply: i,
            gameLost: outcome === 'loss',
            gameId: g.id,
            eco: info.eco,
            name: info.name,
            variation: info.variation,
          });
          break; // one deviation per game
        }
      }
      // Descend along actual game move (regardless of whose turn).
      const next: OpeningTreeNode | undefined = node.children.find(ch => ch.move === mv);
      node = next ?? null;
      path.push(mv);
    }
  }

  // Dedupe by (eco + playedMove) — keep the one with the highest "surprise" score.
  const dedup = new Map<string, NoveltyFinding>();
  for (const f of findings) {
    const key = `${f.eco}|${f.moves.join('|')}|${f.playedMove}`;
    const score =
      (20 - f.ply) * 3 +
      (f.bookFrequency / Math.max(1, f.totalGames)) * 10 +
      (f.gameLost ? 6 : 0);
    const prev = dedup.get(key);
    if (!prev) {
      dedup.set(key, f);
    } else {
      const prevScore =
        (20 - prev.ply) * 3 +
        (prev.bookFrequency / Math.max(1, prev.totalGames)) * 10 +
        (prev.gameLost ? 6 : 0);
      if (score > prevScore) dedup.set(key, f);
    }
  }

  const out = Array.from(dedup.values());
  out.sort((a, b) => {
    const sa =
      (20 - a.ply) * 3 +
      (a.bookFrequency / Math.max(1, a.totalGames)) * 10 +
      (a.gameLost ? 6 : 0);
    const sb =
      (20 - b.ply) * 3 +
      (b.bookFrequency / Math.max(1, b.totalGames)) * 10 +
      (b.gameLost ? 6 : 0);
    return sb - sa;
  });
  return out.slice(0, 10);
}

// ─── Checklist ──────────────────────────────────────────────────────────────

function computeChecklist(
  prep: TargetedPrep,
  psychology: PsychologySnapshot,
  total: number
): ChecklistItem[] {
  const items: ChecklistItem[] = [];

  const topWeakness =
    prep.asWhite.weaknesses[0] || prep.asBlack.weaknesses[0] || null;
  if (topWeakness) {
    items.push({
      id: 'top-weakness',
      title: `Play ${topWeakness.eco} ${topWeakness.name}${
        topWeakness.variation ? ' ' + topWeakness.variation : ''
      }`,
      detail: `Loses ${topWeakness.scorePct.toFixed(1)}% as ${
        prep.asWhite.weaknesses[0] ? 'black' : 'white'
      } (${topWeakness.totalGames} games)`,
      severity: 'high',
    });
  }

  if (psychology.maxLossStreak >= 3) {
    items.push({
      id: 'streak',
      title: 'Search multiple consecutive games',
      detail: `Max streak: ${psychology.maxLossStreak} losses — prone to tilt`,
      severity: psychology.maxLossStreak >= 6 ? 'high' : 'medium',
    });
  }

  if (psychology.timeoutRate > 0.08) {
    items.push({
      id: 'timeouts',
      title: 'Play fast in endgames',
      detail: `${Math.round(psychology.timeoutRate * 100)}% loses on time — pressure the clock`,
      severity: psychology.timeoutRate > 0.2 ? 'high' : 'medium',
    });
  } else if (psychology.avgGameLength > 70) {
    items.push({
      id: 'long-games',
      title: 'Avoid deep theoretical lines',
      detail: `Avg ${Math.round(psychology.avgGameLength)} plies — grinds long games well`,
      severity: 'medium',
    });
  }

  if (psychology.quickLossRate > 0.2) {
    items.push({
      id: 'traps',
      title: 'Prepare opening traps',
      detail: `${Math.round(psychology.quickLossRate * 100)}% of losses under 25 moves — vulnerable to tactics`,
      severity: 'high',
    });
  } else if (psychology.checkmateRate > 0.15) {
    items.push({
      id: 'endgame',
      title: 'Trade into endgames',
      detail: `${Math.round(psychology.checkmateRate * 100)}% wins by mate — neutralise attack`,
      severity: 'medium',
    });
  }

  if (items.length < 4 && total > 0) {
    items.push({
      id: 'volume',
      title: 'Preparing against rival',
      detail: `Based on ${total} games analyzed`,
      severity: 'low',
    });
  }

  return items.slice(0, 4);
}

// ─── Frequent rivals ────────────────────────────────────────────────────────

function computeRivals(games: ScoutGame[], target: string): FrequentRival[] {
  const map = new Map<string, FrequentRival>();
  for (const g of games) {
    const c = playerColor(g, target);
    if (!c) continue;
    const opp = opponentName(g, c);
    if (!opp) continue;
    const o = outcomeFor(g, c);
    if (!o) continue;
    let rival = map.get(opp);
    if (!rival) {
      rival = { name: opp, games: 0, wins: 0, draws: 0, losses: 0, scorePct: 0 };
      map.set(opp, rival);
    }
    rival.games += 1;
    if (o === 'win') rival.wins += 1;
    else if (o === 'draw') rival.draws += 1;
    else rival.losses += 1;
  }
  const rivals = Array.from(map.values())
    .filter(r => r.games >= 3)
    .map(r => ({
      ...r,
      scorePct: ((r.wins + 0.5 * r.draws) / r.games) * 100,
    }));
  rivals.sort((a, b) => b.games - a.games);
  return rivals.slice(0, 10);
}

// ─── Recent form buckets ────────────────────────────────────────────────────

function computeRecentBuckets(games: ScoutGame[], target: string): RecentFormBucket[] {
  // Last 10 games per bucket, most-recent first → display left-to-right oldest→newest.
  const sorted = [...games]
    .filter(g => {
      const c = playerColor(g, target);
      if (!c) return false;
      return outcomeFor(g, c) !== null;
    })
    .sort((a, b) => b.date - a.date)
    .slice(0, 100); // last 100 games

  const bucketSize = 10;
  const buckets: RecentFormBucket[] = [];
  for (let i = 0; i < sorted.length; i += bucketSize) {
    const slice = sorted.slice(i, i + bucketSize);
    let w = 0, d = 0, l = 0;
    for (const g of slice) {
      const c = playerColor(g, target)!;
      const o = outcomeFor(g, c)!;
      if (o === 'win') w += 1;
      else if (o === 'draw') d += 1;
      else l += 1;
    }
    buckets.push({ label: `${i + 1}-${i + slice.length}`, wins: w, draws: d, losses: l });
  }
  // reverse so left→right is oldest→newest
  return buckets.reverse();
}

// ─── Top-level orchestrator ─────────────────────────────────────────────────

export function computeAnalytics(games: ScoutGame[], target: string): ScoutAnalytics {
  // Tally wins/draws/losses from target's PoV across the full (color-unfiltered) set.
  let wins = 0, draws = 0, losses = 0, total = 0;
  for (const g of games) {
    const c = playerColor(g, target);
    if (!c) continue;
    const o = outcomeFor(g, c);
    if (!o) continue;
    total += 1;
    if (o === 'win') wins += 1;
    else if (o === 'draw') draws += 1;
    else losses += 1;
  }

  const psychology = computePsychology(games, target);
  const rep = repertoireDiversity(games, target);

  // Build per-color trees once and reuse for targeted prep + novelty finder.
  const treeWhite = buildOpeningTree(games, target, 'white', 14, 2);
  const treeBlack = buildOpeningTree(games, target, 'black', 14, 2);

  const profile = computeProfile(
    games,
    target,
    psychology,
    { wins, draws, losses, total },
    rep.topThreeShare
  );
  const tells = computeTells(games, target, psychology, rep);
  const clockWindows = computeClockWindows(games, target);
  const prep = computeTargetedPrep(games, target, { treeWhite, treeBlack });
  const checklist = computeChecklist(prep, psychology, total);
  const rivals = computeRivals(games, target);
  const recentBuckets = computeRecentBuckets(games, target);
  const novelty = computeNovelty(games, target, { white: treeWhite, black: treeBlack });

  return {
    profile,
    tells,
    clockWindows,
    prep,
    checklist,
    rivals,
    psychology,
    recentBuckets,
    novelty,
  };
}
