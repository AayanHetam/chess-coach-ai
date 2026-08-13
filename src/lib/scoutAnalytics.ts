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

  // ATK — attacking aggression: win rate + mate-finishing bonus + quick wins.
  // Scale so a 50% win rate + decent mate rate lands around 60-70.
  const quickWinRate = clamp01(1 - psychology.avgGameLength / 80);
  const atk = clamp(
    25 +
      60 * winRate +
      20 * psychology.checkmateRate +
      10 * quickWinRate
  );

  // DEF — ability to not-lose: inverse loss rate + draw solidity + short-games-with-loss bonus
  // (losing quickly hurts defense score).
  const quickLossPenalty = clamp01(psychology.quickLossRate);
  const def = clamp(
    30 +
      55 * (1 - lossRate) +
      20 * drawRate -
      20 * quickLossPenalty
  );

  // TIME — time management: heavily penalise timeouts; slight penalty for very long games.
  const timeScore = clamp(
    100 -
      120 * psychology.timeoutRate -
      15 * clamp01((psychology.avgGameLength - 60) / 40)
  );

  // MIND — psychological composure: penalise tilt & long losing streaks.
  const streakPenalty = clamp(psychology.maxLossStreak * 5, 0, 40);
  const tiltPenalty = clamp(psychology.tiltAfterLossLossRate * 60, 0, 40);
  const mind = clamp(100 - streakPenalty - tiltPenalty);

  const atkR = Math.round(atk);
  const defR = Math.round(def);
  const timeR = Math.round(timeScore);
  const mindR = Math.round(mind);

  const ovr = Math.round((atkR + defR + timeR + mindR) / 4);

  const archetype = computeArchetype({ atk: atkR, def: defR, time: timeR, mind: mindR });

  const ratingInfo = computeRatings(games, target);

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
  const tilts = Math.round(
    clamp(
      15 + 9 * psychology.maxLossStreak + 80 * psychology.tiltAfterLossLossRate
    )
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
  const prep = computeTargetedPrep(games, target, { treeWhite, treeBlack });
  const checklist = computeChecklist(prep, psychology, total);
  const rivals = computeRivals(games, target);
  const recentBuckets = computeRecentBuckets(games, target);
  const novelty = computeNovelty(games, target, { white: treeWhite, black: treeBlack });

  return {
    profile,
    tells,
    prep,
    checklist,
    rivals,
    psychology,
    recentBuckets,
    novelty,
  };
}
