// Cutting a game's movetext before parsing it.
//
// The function's own comment says the move-number token "is unambiguous even
// inside comments and variations: `17.` cannot appear as a SAN". True, and it
// can appear inside a COMMENT — this runs before comments are stripped, and
// Lichess writes `{ [%eval 9.33] }`, which matches the marker for a 14-ply
// build and cuts the game there instead.

import { describe, expect, it } from 'vitest';
import { truncateMovetext } from '../../../../scripts/process-master-pgn.mjs';

describe('truncateMovetext', () => {
  it('cuts at the move number, two moves past the budget', () => {
    // 14 plies -> cut at move 9.
    const text = '1. e4 e5 2. Nf3 Nc6 8. Bb5 a6 9. Ba4 Nf6 10. O-O';
    expect(truncateMovetext(text, 14).trim()).toBe('1. e4 e5 2. Nf3 Nc6 8. Bb5 a6');
  });

  // ── The bug ────────────────────────────────────────────────────────────────
  it('is not fooled by an evaluation that reads like a move number', () => {
    const text =
      '1. e4 { [%eval 0.2] } e5 2. Qh5 { [%eval 9.33] [%clk 0:02:54] } Nc6 9. Bc4 Nf6';
    // Everything up to move 9 survives: the `9.` inside the comment is not a
    // move number, and cutting there loses real plies.
    const cut = truncateMovetext(text, 14);
    expect(cut).toContain('Nc6');
    expect(cut).not.toContain('Bc4');

    // The control: with the comment gone, the same text cuts in the same place.
    const clean = '1. e4 e5 2. Qh5 Nc6 9. Bc4 Nf6';
    expect(truncateMovetext(clean, 14).trim()).toBe('1. e4 e5 2. Qh5 Nc6');
  });

  it('keeps looking past a comment rather than giving up on the game', () => {
    // A marker inside a comment must not make the function return the WHOLE
    // text either — the real move 9 is still there and still the right cut.
    const text = '1. e4 { [%eval 9.1] } e5 { [%eval -9.4] } 2. Nf3 Nc6 9. Bb5 a6 10. O-O';
    const cut = truncateMovetext(text, 14);
    expect(cut).toContain('Nc6');
    expect(cut).not.toContain('Bb5');
  });

  // ── Zero by definition ─────────────────────────────────────────────────────
  it('leaves a game shorter than the budget alone', () => {
    const text = '1. e4 e5 2. Nf3 Nc6';
    expect(truncateMovetext(text, 14)).toBe(text);
    expect(truncateMovetext('', 14)).toBe('');
  });

  it('handles an unclosed comment without hanging or throwing', () => {
    // Malformed input is a data problem, not a crash. The honest answer is to
    // keep what is certainly outside a comment.
    expect(() => truncateMovetext('1. e4 { unterminated 9. e5', 14)).not.toThrow();
  });
});
