/**
 * Robust UCI-or-SAN puzzle-solution parser.
 *
 * Shared by src/components/InlinePuzzleSet.tsx and
 * src/components/PracticeChessBoard.tsx — both were inlining a
 * fragile version that broke silently on the first move that didn't
 * round-trip through chess.js cleanly. Symptom: long puzzles freeze
 * mid-sequence because parseSolutionMoves returned a truncated array
 * and `solutionMoves[nextIdx]` became undefined inside the opponent-
 * response setTimeout.
 *
 * Three fixes vs the old inline version:
 *
 *   1. Trim whitespace off each input. The Lichess CSV import path
 *      occasionally leaves trailing spaces on individual UCI strings.
 *   2. Lowercase the promotion letter. chess.js v1.x rejects "Q"
 *      where it accepts "q". Most data sources are lowercase but the
 *      defensive coercion is free.
 *   3. SAN fallback. If UCI parse fails, try the raw string as SAN
 *      via chess.js's overloaded .move(string). Catches edge cases
 *      where the dataset has mixed formats.
 *   4. Return BOTH the parsed array AND an error string so the caller
 *      can surface a visible "puzzle data is malformed" state instead
 *      of silently freezing.
 */

import { Chess, Square } from "chess.js";

export interface ParsedMove {
  from: Square;
  to: Square;
  promotion?: string;
}

export interface ParseResult {
  parsed: ParsedMove[];
  /**
   * Set when parsing bailed early. Includes the failing index, the
   * raw input that broke, and the FEN we were at — enough to debug
   * without needing the whole puzzle context.
   */
  error: string | null;
}

export function parseSolutionMoves(
  fen: string,
  rawMoves: string[],
): ParseResult {
  const parsed: ParsedMove[] = [];
  let g: Chess;
  try {
    g = new Chess(fen);
  } catch (e) {
    return {
      parsed: [],
      error: `Invalid puzzle FEN: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  for (let i = 0; i < rawMoves.length; i++) {
    const raw = (rawMoves[i] ?? "").trim();
    if (raw.length < 2) {
      // Anything shorter than 2 chars (SAN like "e4" is the minimum)
      // can't be a real move. Surface as malformed.
      return {
        parsed,
        error: `Move ${i + 1} is malformed (${JSON.stringify(rawMoves[i])})`,
      };
    }

    let played = false;

    // Try UCI first ({from, to, promotion?}) for the common Lichess case.
    if (raw.length >= 4) {
      const from = raw.slice(0, 2) as Square;
      const to = raw.slice(2, 4) as Square;
      const promotion =
        raw.length > 4 ? raw.charAt(4).toLowerCase() : undefined;
      try {
        const result = g.move({ from, to, promotion });
        if (result) {
          parsed.push({
            from: result.from as Square,
            to: result.to as Square,
            promotion: result.promotion,
          });
          played = true;
        }
      } catch {
        /* fall through to SAN fallback */
      }
    }

    // SAN fallback — handles datasets that mix formats, and short SAN
    // strings like "e4" or "Nc3" that don't satisfy the UCI shape.
    if (!played) {
      try {
        const result = g.move(raw);
        if (result) {
          parsed.push({
            from: result.from as Square,
            to: result.to as Square,
            promotion: result.promotion,
          });
          played = true;
        }
      } catch {
        /* both UCI + SAN failed — surface the error */
      }
    }

    if (!played) {
      return {
        parsed,
        error: `Move ${i + 1} "${raw}" doesn't apply to FEN ${g.fen()}`,
      };
    }
  }

  return { parsed, error: null };
}
