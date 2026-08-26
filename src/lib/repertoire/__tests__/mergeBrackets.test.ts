import { describe, expect, it } from 'vitest';
import { EMPTY, mergeBrackets, stampBracket, type BracketState } from '../store';
import type { RepertoirePick } from '@/types/repertoire';

const pick = (slotId: string, label = slotId): RepertoirePick => ({ slotId, label });

function bracket(over: Partial<BracketState> = {}): BracketState {
  return { ...EMPTY, ...over };
}

describe('mergeBrackets', () => {
  // The case the whole thing exists for.
  it('keeps a colour edited on one device and a colour edited on the other', () => {
    const laptop = bracket({
      white: [pick('white:')],
      updatedAt: 100,
      whiteAt: 100,
      blackAt: 0,
    });
    const phone = bracket({
      black: [pick('black:e4')],
      updatedAt: 200,
      whiteAt: 0,
      blackAt: 200,
    });
    const merged = mergeBrackets(laptop, phone);
    expect(merged.white.map(p => p.slotId)).toEqual(['white:']);
    expect(merged.black.map(p => p.slotId)).toEqual(['black:e4']);
  });

  // Why the grain is a colour and not a pick. `clearBelow` deletes a subtree,
  // so a union would put back precisely what switching openings removed.
  it('does not resurrect picks that switching an opening deleted', () => {
    const before = bracket({
      black: [pick('black:d4'), pick('black:d4 Nf6 Bf4'), pick('black:d4 Nf6 Bg5')],
      updatedAt: 100,
      blackAt: 100,
    });
    // Same colour, later, after clearBelow cascaded.
    const after = bracket({
      black: [pick('black:d4')],
      updatedAt: 200,
      blackAt: 200,
    });
    expect(mergeBrackets(before, after).black.map(p => p.slotId)).toEqual(['black:d4']);
    // And the other way round: argument order must not decide it, the clock must.
    expect(mergeBrackets(after, before).black.map(p => p.slotId)).toEqual(['black:d4']);
  });

  // ── Zero by definition ────────────────────────────────────────────────────
  // A device that has never been used holds EMPTY at updatedAt 0. Pushing it
  // must not erase an account built over months. This is the single most
  // destructive thing this function could do, and it is one comparison away.
  it('never lets a fresh device wipe the account', () => {
    const account = bracket({
      white: [pick('white:')],
      black: [pick('black:e4')],
      quiz: { load: 'light', character: 'solid' },
      updatedAt: 500,
      whiteAt: 500,
      blackAt: 500,
    });
    const merged = mergeBrackets(account, EMPTY);
    expect(merged.white).toHaveLength(1);
    expect(merged.black).toHaveLength(1);
    expect(merged.quiz).not.toBeNull();
  });

  it('is a no-op against itself', () => {
    const one = bracket({ white: [pick('white:')], updatedAt: 7, whiteAt: 7, blackAt: 7 });
    expect(mergeBrackets(one, one)).toEqual(expect.objectContaining({ white: one.white, updatedAt: 7 }));
  });

  it('falls back to updatedAt for a state written before per-colour stamps', () => {
    // Everything already stored is this shape: no whiteAt, no blackAt.
    const old = bracket({ white: [pick('white:')], updatedAt: 300 });
    const newer = bracket({ white: [pick('white:c4')], updatedAt: 400 });
    expect(mergeBrackets(old, newer).white.map(p => p.slotId)).toEqual(['white:c4']);
    expect(mergeBrackets(newer, old).white.map(p => p.slotId)).toEqual(['white:c4']);
  });

  it('takes the lock with the colour it belongs to', () => {
    const lockedWhite = bracket({ locked: { white: true, black: false }, updatedAt: 100, whiteAt: 100, blackAt: 0 });
    const lockedBlack = bracket({ locked: { white: false, black: true }, updatedAt: 200, whiteAt: 0, blackAt: 200 });
    expect(mergeBrackets(lockedWhite, lockedBlack).locked).toEqual({ white: true, black: true });
  });

  it('takes the quiz answers from whichever state is newer overall', () => {
    const older = bracket({ quiz: { load: 'light', character: 'solid' }, updatedAt: 100 });
    const newer = bracket({ quiz: { load: 'heavy', character: 'attack' }, updatedAt: 200 });
    expect(mergeBrackets(older, newer).quiz).toEqual({ load: 'heavy', character: 'attack' });
    expect(mergeBrackets(newer, older).quiz).toEqual({ load: 'heavy', character: 'attack' });
  });

  it('carries the newest clock forward so the next merge can order against it', () => {
    const a = bracket({ updatedAt: 100, whiteAt: 100, blackAt: 20 });
    const b = bracket({ updatedAt: 200, whiteAt: 5, blackAt: 200 });
    const merged = mergeBrackets(a, b);
    expect(merged.updatedAt).toBe(200);
    expect(merged.whiteAt).toBe(100);
    expect(merged.blackAt).toBe(200);
  });
});

describe('stampBracket', () => {
  const now = 1_000;

  it('stamps only the colour that changed', () => {
    const prev = bracket({ white: [pick('white:')], updatedAt: 100, whiteAt: 100, blackAt: 100 });
    const next = { ...prev, black: [pick('black:e4')] };
    const stamped = stampBracket(prev, next, now);
    expect(stamped.blackAt).toBe(now);
    // White did not move, so its clock must not either — otherwise this device
    // would beat a genuinely newer White pick made somewhere else.
    expect(stamped.whiteAt).toBe(100);
    expect(stamped.updatedAt).toBe(now);
  });

  it('counts locking a colour as changing it', () => {
    const prev = bracket({ updatedAt: 100, whiteAt: 100, blackAt: 100 });
    const next = { ...prev, locked: { white: true, black: false } };
    const stamped = stampBracket(prev, next, now);
    expect(stamped.whiteAt).toBe(now);
    expect(stamped.blackAt).toBe(100);
  });

  // Zero by definition: a save that changes no colour must move no colour clock.
  it('moves no colour clock when only the quiz answer changed', () => {
    const prev = bracket({ updatedAt: 100, whiteAt: 100, blackAt: 100 });
    const next = { ...prev, quiz: { load: 'heavy' as const, character: 'attack' as const } };
    const stamped = stampBracket(prev, next, now);
    expect(stamped.whiteAt).toBe(100);
    expect(stamped.blackAt).toBe(100);
    expect(stamped.updatedAt).toBe(now);
  });

  it('gives a colour its first stamp when there was none', () => {
    const prev = bracket({ updatedAt: 100 });
    const next = { ...prev, white: [pick('white:')] };
    const stamped = stampBracket(prev, next, now);
    expect(stamped.whiteAt).toBe(now);
    // Black never had one and did not change, so it still has none — and
    // `sideAt` reads it as `updatedAt`, which is what it always meant.
    expect(stamped.blackAt).toBeUndefined();
  });
});
