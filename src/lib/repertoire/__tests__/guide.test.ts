import { describe, expect, it } from 'vitest';
import { guideLine, pickLine } from '@/lib/repertoire/guide';

const open = { white: false, black: false };

describe('guideLine', () => {
  it('asks for a first tap on an empty side', () => {
    expect(guideLine({ side: 'white', picks: 0, enough: false, locked: open, next: 'your first move' }))
      .toBe('Tap a card to start.');
  });

  it('points at the biggest open branch once something is chosen', () => {
    expect(guideLine({ side: 'black', picks: 1, enough: false, locked: open, next: 'the Sicilian Defense' }))
      .toBe('Next up: the Sicilian Defense.');
  });

  it('says to lock a side that is enough, before it is locked', () => {
    expect(guideLine({ side: 'black', picks: 2, enough: true, locked: open, next: '1.c4' }))
      .toBe('Enough for your level. Lock Black.');
  });

  it('sends a locked side to the other colour', () => {
    expect(guideLine({ side: 'white', picks: 1, enough: true, locked: { white: true, black: false }, next: null }))
      .toBe('White is locked. Black next.');
  });

  it('is done when both are locked, whatever else is true', () => {
    expect(guideLine({ side: 'black', picks: 0, enough: false, locked: { white: true, black: true }, next: '1.e4' }))
      .toBe('Both sides locked. Go learn it.');
  });

  it('has a line for a side with nothing left to answer and nothing locked', () => {
    expect(guideLine({ side: 'white', picks: 3, enough: false, locked: open, next: null }))
      .toBe('Every branch answered.');
  });
});

describe('pickLine', () => {
  const base = { coverage: 'family' as const, recommended: false, suits: false, alreadyPlays: null };

  it('names the top card with the strongest true reason', () => {
    expect(pickLine({ ...base, name: 'Grünfeld Defence', recommended: true }))
      .toBe('My pick: the Grünfeld Defence. Level, theory and style all fit.');
    expect(pickLine({ ...base, name: 'London System', coverage: 'system', suits: true }))
      .toBe('My pick: the London System. One setup, nothing to memorise.');
    expect(pickLine({ ...base, name: "King's Indian Defence", suits: true }))
      .toBe("My pick: the King's Indian Defence. It suits your level.");
    expect(pickLine({ ...base, name: 'Nimzo-Indian Defence' })).toBe('My pick: the Nimzo-Indian Defence.');
  });

  it('puts what they already play above every judgement', () => {
    expect(pickLine({ ...base, name: 'Caro-Kann Defence', recommended: true, alreadyPlays: 'c6' }))
      .toBe('You already play c6. Keep the Caro-Kann Defence?');
  });

  it('never articles a move', () => {
    expect(pickLine({ ...base, name: '1.e4', coverage: 'move', suits: true })).toBe('My pick: 1.e4. It suits your level.');
  });
});

