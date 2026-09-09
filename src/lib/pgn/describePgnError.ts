/**
 * Turn a chess.js `loadPgn` failure into something a person can act on.
 *
 * chess.js parses PGN with a generated grammar, so a stray word produces
 * "Expected brace comment, end of input, game termination marker, move
 * number, rest of line comment, standard algebraic notation, variation, or
 * whitespace but "a" found." — honest, and unreadable to anyone who did not
 * write the parser. The 2026-09-08 QA pass called it "raw parser gibberish".
 *
 * The headline says what kind of thing went wrong; the detail says where, and
 * keeps the parser's own words available for the one user who wants them.
 */

export interface PgnErrorDescription {
  headline: string;
  detail?: string;
}

const EXPECTED_RE = /^Expected [\s\S]* but (".*?"|end of input) found\.?$/;
const INVALID_MOVE_RE = /^Invalid move in PGN:\s*(.+)$/;
const INVALID_FEN_RE = /invalid fen/i;

export function describePgnError(
  message: string,
  pasted: string = ""
): PgnErrorDescription {
  const msg = message.trim();

  const invalidMove = INVALID_MOVE_RE.exec(msg);
  if (invalidMove) {
    const mv = invalidMove[1].trim();
    return {
      headline: `"${mv}" isn't a legal move where it appears.`,
      detail:
        "Check the move just before it — one typo earlier makes every move after it illegal.",
    };
  }

  if (INVALID_FEN_RE.test(msg)) {
    return {
      headline: "The [FEN] header isn't a valid position.",
      detail: "Remove the header, or paste the position separately as a FEN.",
    };
  }

  const expected = EXPECTED_RE.exec(msg);
  if (expected) {
    const looksLikeMoves = /\b\d+\.\s*[a-hNBRQKO]/.test(pasted);
    const where =
      expected[1] === "end of input"
        ? "The text ends before the game does."
        : `Reading stopped at ${expected[1]}.`;
    return {
      headline: looksLikeMoves
        ? "Something in that PGN isn't chess notation."
        : "That doesn't look like a PGN.",
      detail: `${where} A PGN is numbered moves like 1. e4 e5 2. Nf3 — headers in [brackets] are optional.`,
    };
  }

  return {
    headline: "Couldn't read that PGN.",
    detail: msg || undefined,
  };
}
