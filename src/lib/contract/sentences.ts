/**
 * Chess-aware sentence splitting (PR-CI-4 gate recovery).
 *
 * WHY THIS EXISTS: chess prose is full of move numbers — "8. e5", "31... h5",
 * "9. Bd2 Bb4". A naive `/(?<=[.!?])\s+/` split treats every one of those
 * dots as a sentence terminator, which broke two things at once on the
 * 2026-08-10 verification run:
 *
 *  1. CITATION COVERAGE (measured 70.4% vs the >=80% gate) — a single properly
 *     cited sentence like
 *       "The engine line shows 8... Ba5+ 9. Bd2 Bb4 [F:I1.pv0] — your bishop
 *        harasses White's pieces with tempo."
 *     split into THREE "sentences", two of which carry no [F:] token, so the
 *     coverage denominator counted two phantom uncited claims. Re-measuring
 *     the same committed generations with move-number-aware splitting moved
 *     coverage 73.3% -> 79.4% with zero model change: ~6pp of the miss was a
 *     measurement artifact, not model behaviour.
 *
 *  2. PERSONA / VOICE (measured 3.45 vs the >=3.55 gate) — the ladder's
 *     deterministic sentence-drop excises "the sentence containing the
 *     violating span". With fragment sentences, dropping the fragment left
 *     dangling stubs mid-paragraph in the SHIPPED prose:
 *       "Idea: White pushed 8."
 *       "Solution: The engine line shows 8... Ba5+ 9."
 *       "Problem: After 5... The eval shifts from +0.50 to +1.40"
 *     which is exactly the flattened, broken rhythm the persona judge marked
 *     down (fixture 02 scored 2/5 twice).
 *
 * THE RULE: a period (or "...") that closes a MOVE NUMBER is not a sentence
 * terminator. We recognise that positionally — digits, then "." or "...",
 * then whitespace, then something that can start a SAN token (a piece letter,
 * a file letter, or castling "O"/"0"). A genuine sentence end like "…a forced
 * mate in 4. The position is winning" is untouched, because "The" cannot
 * start a SAN token.
 */

/** Mask char for non-terminating dots — never appears in model prose. */
const DOT_MASK = String.fromCharCode(0);

/**
 * Move-number dot(s): `\d{1,3}` + "." or "..." + whitespace + a SAN starter.
 * SAN starters: K Q R B N (piece), a-h (file/pawn), O/0 (castling).
 */
const MOVE_NUMBER_DOTS_RE = /\b(\d{1,3})(\.\.\.|\.)(?=\s+[KQRBNOa-h0])/g;

/** Replace move-number dots with a mask char so they never terminate.
 * Length-preserving, so character offsets into the text are unchanged. */
export function maskMoveNumberDots(text: string): string {
  return text.replace(
    MOVE_NUMBER_DOTS_RE,
    (_m, num: string, dots: string) => `${num}${DOT_MASK.repeat(dots.length)}`,
  );
}

/** Inverse of {@link maskMoveNumberDots}. */
export function unmaskMoveNumberDots(text: string): string {
  return text.split(DOT_MASK).join(".");
}

/**
 * Split prose into sentences, treating move-number dots as ordinary text.
 * Newlines still terminate (the insight grammar is line-oriented). Returned
 * strings are the ORIGINAL substrings — masking is internal only.
 */
export function splitProseSentences(text: string): string[] {
  return maskMoveNumberDots(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .map(unmaskMoveNumberDots);
}

/** Same split, but newlines are NOT terminators (single-line callers). */
export function splitLineSentences(line: string): string[] {
  return maskMoveNumberDots(line)
    .split(/(?<=[.!?])\s+/)
    .map(unmaskMoveNumberDots);
}
