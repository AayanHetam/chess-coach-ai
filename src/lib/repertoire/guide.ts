// The one line Masti says at the top of /learn.
//
// Pure, so the sentence is tested rather than eyeballed. The mood that goes
// with it lives beside the other reducers in components/masti/mood.ts
// (`repertoireMood`); both read the same inputs, so face and line agree.
//
// Short on purpose. The page used to open with three sentences explaining the
// idea of a repertoire bracket; this replaces them with the next thing to do.

export type Side = 'white' | 'black';

export interface GuideInput {
  side: Side;
  /** Picks made on the side being shown. */
  picks: number;
  /** Coverage on the shown side has reached the band's enough line. */
  enough: boolean;
  locked: { white: boolean; black: boolean };
  /**
   * What the biggest open slot is an answer to, in a player's words
   * (`facing()`), or null when every branch we can measure is answered.
   */
  next: string | null;
}

const cap = (s: Side) => (s === 'white' ? 'White' : 'Black');

export function guideLine(i: GuideInput): string {
  const here = cap(i.side);
  const other = cap(i.side === 'white' ? 'black' : 'white');
  if (i.locked.white && i.locked.black) return 'Both sides locked. Go learn it.';
  if (i.locked[i.side]) return `${here} is locked. ${other} next.`;
  if (i.enough) return `Enough for your level. Lock ${here}.`;
  if (i.picks === 0) return 'Tap a card to start.';
  if (i.next) return `Next up: ${i.next}.`;
  return 'Every branch answered.';
}

// ── The chooser ──────────────────────────────────────────────────────────────

/** The name the way it is said out loud: "the London System", but "1.e4". */
const named = (name: string) => (/^(the\s|\d)/i.test(name) ? name : `the ${name}`);

export interface PickInput {
  /** The top-ranked choice's name. */
  name: string;
  coverage: 'family' | 'system' | 'move';
  /** Level, theory load and character all line up (`fitOf().recommended`). */
  recommended: boolean;
  /** Pitched at their band (`fitOf().level === 'suits'`). */
  suits: boolean;
  /** The move they measurably already play here, when the top choice commits to it. */
  alreadyPlays: string | null;
}

/**
 * What Masti says over the list of suggestions: which one, and the one reason.
 *
 * The list is already ranked, so "my pick" is simply the first card, and the
 * reason is the strongest true thing about it. Their own move outranks
 * every judgement, because it is measured and the rest are inferred.
 */
export function pickLine(i: PickInput): string {
  const who = named(i.name);
  if (i.alreadyPlays) return `You already play ${i.alreadyPlays}. Keep ${who}?`;
  if (i.recommended) return `My pick: ${who}. Level, theory and style all fit.`;
  if (i.coverage === 'system') return `My pick: ${who}. One setup, nothing to memorise.`;
  if (i.suits) return `My pick: ${who}. It suits your level.`;
  return `My pick: ${who}.`;
}

/** The chooser with nothing curated to say. */
export const NO_PICK_LINE = 'Nothing to recommend this deep. Pick a move below, or search.';

