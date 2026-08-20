// What a repertoire needs to be, at the level the player is actually at.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE THING EVERY OTHER OPENING PRODUCT GETS WRONG
//
// They sell the same repertoire to a 600 and a 2000. A "Lifetime Repertoire" in
// the Najdorf is forty hours of memorisation offered to somebody who is losing
// every third game to a back-rank mate, and it will not win them a single point
// they were not already going to win.
//
// A 600 does not need depth. King's Indian setup against 1.d4, something
// against the London because the London is everywhere, and a defence to 1.e4 —
// six moves deep, played the same way every game — is genuinely enough until
// somewhere around 1500. Past that the move order starts to matter and the same
// repertoire has to get deeper rather than wider.
//
// So this file decides three things from the rating we already know:
//
//   1. WHICH openings to put in front of them
//   2. HOW DEEP each line needs to go before it stops mattering
//   3. WHEN their repertoire is ENOUGH, said out loud, so they can stop
//      thinking about openings and go and do something that will actually
//      gain them rating
//
// Point 3 is the one worth defending. Telling somebody their opening work is
// finished is worth more to them than selling them another course, and nothing
// else in this space will ever say it.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT IS MEASURED AND WHAT IS JUDGED
//
// Measured, elsewhere and honestly: coverage, frequency, transposition, pawn
// structure, what people play, what it scores.
//
// JUDGED, here: which band an opening suits, and how much theory it costs.
// I tried three times to derive theory load from the corpus and all three
// attempts were confounded. Breadth-by-family measures how densely ECO happens
// to have catalogued an opening — it rates the Najdorf easier than the
// Caro-Kann, which is backwards. Cost-of-second-choice measures what happens
// when a 2300 plays a slightly worse move, which says nothing about what
// happens when a 600 plays a natural one. Opponent branching over three turns
// measures early flexibility, not total theory.
//
// The corpus can say what people play. It cannot say what is hard to learn.
// So that is a judgement, it lives in one small table, and it is labelled.
// ─────────────────────────────────────────────────────────────────────────────

import type { RepertoireChoice, TheoryLoad } from '@/types/repertoire';

export type BandId = 'new' | 'beginner' | 'improving' | 'club' | 'strong';

export interface Band {
  id: BandId;
  /** Inclusive floor of the band, in platform rating. */
  floor: number;
  name: string;
  /**
   * Plies of each line worth knowing.
   *
   * Not "the opening is this long" — every one of them goes twenty moves deep.
   * This is where knowing more stops changing your results at this level,
   * because the game leaves the book long before either player does.
   */
  depth: number;
  /** Coverage at which a repertoire is enough for this band, 0-1. */
  enoughAt: number;
  /** The heaviest theory load worth recommending here. */
  ceiling: TheoryLoad;
  /** What opening work is for, at this level. */
  advice: string;
}

/**
 * Five bands. The boundaries are round numbers rather than measured ones, and
 * they are deliberately coarse: nobody's opening needs change between 1190 and
 * 1210, and a band that pretended otherwise would be false precision.
 */
export const BANDS: Band[] = [
  {
    id: 'new',
    floor: 0,
    name: 'Starting out',
    depth: 4,
    enoughAt: 0.8,
    ceiling: 'light',
    advice:
      'Four moves, played the same way every game. Openings are not what is costing you games yet, and any time spent here is time not spent on tactics.',
  },
  {
    id: 'beginner',
    floor: 800,
    name: 'Club beginner',
    depth: 6,
    enoughAt: 0.85,
    ceiling: 'light',
    advice:
      'Six moves and a plan you can name. The goal is to reach a middlegame you understand, not to get an advantage out of the opening.',
  },
  {
    id: 'improving',
    floor: 1200,
    name: 'Improving',
    depth: 8,
    enoughAt: 0.9,
    ceiling: 'medium',
    advice:
      'Now the move order starts to matter, and the gaps in your repertoire start being punished on purpose rather than by accident.',
  },
  {
    id: 'club',
    floor: 1600,
    name: 'Strong club player',
    depth: 12,
    enoughAt: 0.93,
    ceiling: 'heavy',
    advice:
      'Depth is worth paying for now. Opponents at this level have preparation, and the difference between move ten and move fourteen is a real one.',
  },
  {
    id: 'strong',
    floor: 2000,
    name: 'Above our depth',
    depth: 14,
    enoughAt: 0.95,
    ceiling: 'heavy',
    advice:
      'Our lines run to about move fourteen, which is where yours start. Use this for the map — which branches exist and how often you meet them — and get the depth elsewhere.',
  },
];

/** The band a rating falls in. Unrated players are treated as improving. */
export function bandFor(rating: number | undefined | null): Band {
  // The middle band, not the lowest. Guessing "beginner" for somebody unrated
  // hides the sharp openings from a player who may well want them, and being
  // wrong upward only costs them a longer list.
  if (rating === undefined || rating === null || !Number.isFinite(rating)) {
    return BANDS[2];
  }
  let band = BANDS[0];
  for (const candidate of BANDS) if (rating >= candidate.floor) band = candidate;
  return band;
}

/** The band after this one, or null at the top. */
export function nextBand(band: Band): Band | null {
  const index = BANDS.findIndex(b => b.id === band.id);
  return index >= 0 && index < BANDS.length - 1 ? BANDS[index + 1] : null;
}

const LOAD_ORDER: Record<TheoryLoad, number> = { light: 0, medium: 1, heavy: 2 };

/** True when this opening is not more than the band should be taking on. */
export function withinCeiling(choice: Pick<RepertoireChoice, 'load'>, band: Band): boolean {
  return LOAD_ORDER[choice.load] <= LOAD_ORDER[band.ceiling];
}

/**
 * How well an opening suits a band.
 *
 * Positive is a fit, negative is a stretch. Deliberately a RANKING and never a
 * filter: a motivated 900 who wants the Najdorf should be able to choose the
 * Najdorf. Hiding it would be deciding for them, and the honest thing is to
 * order the list and say what it costs.
 */
export function levelFit(choice: Pick<RepertoireChoice, 'load' | 'level'>, band: Band): number {
  const bandIndex = BANDS.findIndex(b => b.id === band.id);
  const minIndex = BANDS.findIndex(b => b.id === choice.level);
  if (minIndex < 0) return 0;
  const stretch = minIndex - bandIndex;
  // One band up is NOT a warning. Almost every sound opening sits a band above
  // somebody, and flagging that turned every option in the 1.d4 list red for a
  // 700 — which tells them nothing and hides the two that really would cost
  // them a year. Only a two-band stretch is worth saying out loud.
  if (stretch <= 0) return 2;
  if (stretch === 1) return 1;
  // Graded rather than flat, so two bands above sorts ahead of three. A flat
  // penalty left the Grünfeld and the Nimzo-Indian tied for a 700 and the
  // order decided by whichever happened to be earlier in the catalogue.
  return -stretch;
}

export interface Sufficiency {
  /** True when this repertoire is enough for the band the player is in. */
  enough: boolean;
  /** Coverage still needed to be enough, 0-1. Zero once they are there. */
  shortBy: number;
  /** The rating at which this stops being enough, or null at the top band. */
  goodUntil: number | null;
}

/**
 * Is this repertoire finished, for now?
 *
 * The whole point of the feature. A repertoire is enough when it answers
 * enough of what the player actually meets — not when every branch is filled,
 * because at 900 the twelfth-most-common branch will not come up all year.
 */
export function sufficiency(coverage: number, band: Band): Sufficiency {
  const enough = coverage >= band.enoughAt;
  const after = nextBand(band);
  return {
    enough,
    shortBy: enough ? 0 : Number((band.enoughAt - coverage).toFixed(4)),
    goodUntil: after ? after.floor : null,
  };
}

/** The one line to put at the top of the page. */
export function verdict(coverage: number, band: Band): string {
  const state = sufficiency(coverage, band);
  if (!state.enough) {
    return `Not finished yet. ${Math.round(state.shortBy * 100)} more points of what you actually face still has no answer.`;
  }
  if (state.goodUntil === null) {
    return 'Complete by our measure. Our lines stop around move fourteen, which is where yours begin.';
  }
  return `This is enough. It will carry you to about ${state.goodUntil}, and past that the work is depth rather than more openings.`;
}
