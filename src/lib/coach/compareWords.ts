/**
 * Which two moves a compare question names, read with the router's own
 * rules (pathway 3.5).
 *
 * A question is a compare only when the live rules read it as one
 * (`compare:or` in intentRules.ts, which runs before every anchor rule):
 * "8. Qxc1 or 8. Nd6+?", "Nf3 or Nc3 here?". "Is Nf3 better than Nc3?"
 * and "could I play Nf3 or Nc3?" are other rows. The page reads the words
 * here to draw both lines, and the chat route checks here that a verified
 * compare payload is about the two moves the words name, in the order they
 * name them, at that ply.
 *
 * Pure and client-safe (whatIfClientChain.test.ts keeps it so).
 */
import { Chess } from "chess.js";
import { resolveLiveIntent } from "./intentRules";
import {
  compareTokens,
  type CompareToken,
  type IntentContext,
} from "./questionIntent";
import type { VerifiedWhatIf } from "./clientEvals";

/** The two moves a compare names, in the order named, or null when the live rules read no compare. */
export function readCompare(
  question: string,
  ctx: IntentContext
): readonly [CompareToken, CompareToken] | null {
  if (resolveLiveIntent(question, ctx).rule !== "compare:or") return null;
  return compareTokens(question);
}

/** The move `san` makes at `fen`, played as written, as UCI, or null when it is no move there. */
function uciOf(fen: string, san: string): string | null {
  try {
    const m = new Chess(fen).move(san);
    return m ? `${m.from}${m.to}${m.promotion ?? ""}` : null;
  } catch {
    return null;
  }
}

/**
 * Whether the words name the verified compare's two moves: the first named
 * is the asked move and the second the compared one, each played as
 * written from the position before the move, and a number written beside
 * either is that position's number and side.
 */
export function compareMatchesWords(
  question: string,
  w: VerifiedWhatIf,
  ctx: IntentContext
): boolean {
  const tokens = readCompare(question, ctx);
  if (!tokens) return false;
  const asked = w.moves.find((m) => m.role === "asked");
  const compared = w.moves.find((m) => m.role === "compared");
  if (!asked || !compared) return false;
  if (uciOf(w.fenBefore, tokens[0].san) !== asked.uci) return false;
  if (uciOf(w.fenBefore, tokens[1].san) !== compared.uci) return false;
  return tokens.every(
    (t) =>
      !t.numbered ||
      (t.numbered.number === w.moveNumber && t.numbered.color === w.color)
  );
}
