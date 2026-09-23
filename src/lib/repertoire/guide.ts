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
