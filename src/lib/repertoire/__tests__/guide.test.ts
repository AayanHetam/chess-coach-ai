import { describe, expect, it } from 'vitest';
import { guideLine } from '@/lib/repertoire/guide';

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
