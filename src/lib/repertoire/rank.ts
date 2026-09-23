// The rank a repertoire has reached, for the game layer on /learn.
//
// Coverage is the measured number and stays the measured number. What this
// adds is a LADDER over it, so a player sees a next rung instead of a
// percentage that moves by seven points at a time: five names, and the
// distance to the next one.
//
// The rungs are fractions of the band's OWN "enough" line, not fixed
// percentages. A 700 is done at 80% and a 1700 at 93%, so a fixed ladder
// would tell the 700 they were "nearly there" for their last thirty points and
// tell the 1700 they had finished a rung early. Scaled, the top rung is
// exactly `sufficiency().enough`, and the test pins that.

import { sufficiency, type Band } from './levels';

export type RankTier = 0 | 1 | 2 | 3 | 4;

export const RANK_NAMES: Record<RankTier, string> = {
  0: 'Blank board',
  1: 'First moves',
  2: 'Half built',
  3: 'Nearly there',
  4: 'Battle ready',
};

export interface Rank {
  tier: RankTier;
  name: string;
  /** Coverage (0-1) at which the next rung starts, or null on the top one. */
  nextAt: number | null;
  nextName: string | null;
}

/** Where the middle rungs sit, as a share of the band's enough line. */
const HALF = 0.4;
const NEAR = 0.75;

const clamp = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

/**
 * Four decimals, the same grain `sufficiency` keeps. 0.75 x 0.8 is
 * 0.6000000000000001 in floating point, and a rung that a 60% repertoire
 * missed by that much would be a bug nobody could see.
 */
const round4 = (v: number) => Number(v.toFixed(4));

export function rankFor(coverage: number, band: Band): Rank {
  const c = clamp(coverage);
  const enough = band.enoughAt;
  const half = round4(enough * HALF);
  const near = round4(enough * NEAR);
  if (sufficiency(c, band).enough) {
    return { tier: 4, name: RANK_NAMES[4], nextAt: null, nextName: null };
  }
  if (c >= near) return { tier: 3, name: RANK_NAMES[3], nextAt: enough, nextName: RANK_NAMES[4] };
  if (c >= half) return { tier: 2, name: RANK_NAMES[2], nextAt: near, nextName: RANK_NAMES[3] };
  // The first rung is any answer at all, so the rung worth naming as "next" is
  // the one after it: "+12% to Half built", never "+0% to First moves".
  const tier: RankTier = c > 0 ? 1 : 0;
  return { tier, name: RANK_NAMES[tier], nextAt: half, nextName: RANK_NAMES[2] };
}

/** Points of coverage still to climb to the next rung, or null at the top. */
export function pointsToNext(coverage: number, band: Band): number | null {
  const rank = rankFor(coverage, band);
  if (rank.nextAt === null) return null;
  // Rounded to a hundredth of a point BEFORE the ceiling, or 0.32 - 0 reads
  // as 32.000000000000007 points and rounds up to 33.
  const points = Number(((rank.nextAt - clamp(coverage)) * 100).toFixed(2));
  return Math.max(1, Math.ceil(points));
}
