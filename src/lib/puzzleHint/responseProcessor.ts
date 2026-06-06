/**
 * Post-process a raw LLM response for the puzzle-hint pipeline.
 *
 * Two responsibilities:
 *
 *   1. Parse the structured trailer (`===MENTIONS===` + one
 *      `term;squares;color` line per highlight) out of the model's prose,
 *      returning prose-without-trailer + a typed mentions[] array.
 *      Also extracts [SHOW_MOVE:...] for the `answer` stage.
 *
 *   2. Leak detection for `why_wrong` and `hint` stages — the model is
 *      told not to mention the solution move or its destination square,
 *      but models drift. This module flags any leak so the route can
 *      retry once with a stricter prompt or fall back to generic prose.
 *
 * Leak heuristic is conservative — false positives only cost a retry; a
 * false negative ships the solution to the user.
 */

import { Chess } from "chess.js";
import { parseSolutionMoves } from "@/lib/puzzleSolution";
import {
  mentionColorSchema,
  type MentionColor,
  type TermMention,
} from "@/lib/validation/puzzleHintSchemas";

const TRAILER_DELIM = "===MENTIONS===";
const SHOW_MOVE_RE = /\[SHOW_MOVE:\s*([^\]]+)\]/g;

export interface ParsedHintResponse {
  /** Prose with the trailer + SHOW_MOVE tag (if extracted separately) removed. */
  prose: string;
  /** Mentions parsed from the trailer. */
  mentions: TermMention[];
  /** SAN sequence extracted from the first [SHOW_MOVE:...] tag in the prose,
   *  if any. Used for the `answer` stage's demo handshake. */
  showMoves?: string[];
}

/**
 * Split prose / trailer. Robust against missing trailer (model forgot
 * the delimiter), missing color (defaults to "red"), and stray whitespace.
 */
export function parseHintResponse(raw: string): ParsedHintResponse {
  // 1. Split prose from trailer.
  const delimIdx = raw.indexOf(TRAILER_DELIM);
  const beforeTrailer = delimIdx >= 0 ? raw.slice(0, delimIdx) : raw;
  const trailerBody =
    delimIdx >= 0 ? raw.slice(delimIdx + TRAILER_DELIM.length) : "";

  // 2. Extract SHOW_MOVE tag from the prose (don't touch the body of the
  //    tag — the bubble's renderer expects it intact).
  let showMoves: string[] | undefined;
  const showMatch = SHOW_MOVE_RE.exec(beforeTrailer);
  if (showMatch) {
    showMoves = showMatch[1]
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  // Reset the regex's lastIndex — it's a /g flag, stateful between calls.
  SHOW_MOVE_RE.lastIndex = 0;

  // 3. Parse mention lines from the trailer.
  const mentions: TermMention[] = [];
  for (const rawLine of trailerBody.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const parts = line.split(";").map((p) => p.trim());
    if (parts.length < 2) continue;
    const [term, squaresRaw, colorRaw] = parts;
    if (!term || !squaresRaw) continue;
    const squares = squaresRaw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => /^[a-h][1-8]$/.test(s));
    if (squares.length === 0) continue;
    const colorParsed = mentionColorSchema.safeParse(
      (colorRaw ?? "red").toLowerCase(),
    );
    const color: MentionColor = colorParsed.success ? colorParsed.data : "red";
    mentions.push({ term: term.toLowerCase(), squares, color });
  }

  return {
    prose: beforeTrailer.trimEnd(),
    mentions,
    showMoves,
  };
}

export interface SolutionFingerprint {
  /** The SAN of the user's first correct move (e.g. "Nxf7+"). */
  firstSan: string;
  /** Bare destination square of the user's first move (e.g. "f7"). */
  firstDestSquare: string;
  /** Bare destination squares of ALL user moves in the solution. */
  allDestSquares: string[];
}

/** Derive the solution fingerprint used by the leak validator. */
export function computeSolutionFingerprint(
  puzzleFen: string,
  solution: string[],
): SolutionFingerprint | null {
  // Apply opponent setup move (solution[0]) to get the student's start.
  let studentStartFen = puzzleFen;
  try {
    const g = new Chess(puzzleFen);
    const opp = solution[0];
    if (opp) {
      g.move({
        from: opp.slice(0, 2),
        to: opp.slice(2, 4),
        promotion: opp.length > 4 ? opp.slice(4, 5) : undefined,
      });
    }
    studentStartFen = g.fen();
  } catch {
    return null;
  }

  // Parse user-side solution moves and re-walk to capture SANs.
  const userMoves = solution.slice(1);
  const { parsed } = parseSolutionMoves(studentStartFen, userMoves);
  const g = new Chess(studentStartFen);
  const sans: string[] = [];
  const dests: string[] = [];
  for (const m of parsed) {
    try {
      const r = g.move({ from: m.from, to: m.to, promotion: m.promotion });
      if (!r) break;
      sans.push(r.san);
      dests.push(r.to);
    } catch {
      break;
    }
  }
  if (sans.length === 0) return null;

  return {
    firstSan: sans[0],
    firstDestSquare: dests[0],
    allDestSquares: dests,
  };
}

/**
 * True if `prose` reveals the solution. We check two things:
 *
 *   1. The bare SAN of the first solution move appears anywhere in the
 *      prose (case-insensitive, after stripping check/mate marks).
 *   2. A bare destination square of the user's NEXT move (e.g. "f7")
 *      appears in algebraic-notation context (e.g. "to f7", "on f7",
 *      "Nf7", "Bxf7"). We use a heuristic: word-boundary match in any
 *      context flags as a leak. False positives only cost a retry.
 *
 * The first solution move's destination is the most sensitive — that's
 * the answer. We don't flag later-move destinations because the user
 * needs to find the FIRST move; subsequent moves are less of a giveaway.
 *
 * Note: this is intentionally aggressive. A "loose" version that only
 * blocks the exact SAN substring let too many leaks through in my
 * eyeball testing of Sonnet's why_wrong drafts.
 */
export function detectSolutionLeak(
  prose: string,
  fingerprint: SolutionFingerprint,
): boolean {
  const proseLower = prose.toLowerCase();

  // 1. Bare SAN match (strip + / # / = decorations for a tighter match).
  const sanCore = fingerprint.firstSan
    .replace(/[+#!?=]/g, "")
    .toLowerCase();
  if (sanCore.length >= 2) {
    // Pad with non-letter boundaries on both sides so e.g. "g4" doesn't
    // match inside the word "g4ming" — but "...play g4" hits.
    const sanRe = new RegExp(
      `(^|[^a-zA-Z0-9])${escapeRegex(sanCore)}([^a-zA-Z0-9]|$)`,
      "i",
    );
    if (sanRe.test(prose)) return true;
  }

  // 2. Bare destination square match — only flag the first move's dest.
  //    Looser squares (e.g. "e4" mentioned in a why-other-move-fails
  //    explanation) get false-positived; that's the price of conservatism.
  const dest = fingerprint.firstDestSquare.toLowerCase();
  if (/^[a-h][1-8]$/.test(dest)) {
    const destRe = new RegExp(
      `(^|[^a-zA-Z0-9])${dest}([^a-zA-Z0-9]|$)`,
      "i",
    );
    if (destRe.test(proseLower)) return true;
  }

  return false;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Generic fallback prose for when both attempts leaked. Stage-specific. */
export function leakFallbackProse(stage: "why_wrong" | "hint"): string {
  if (stage === "why_wrong") {
    return "That move doesn't quite work — it loses material or misses a stronger reply. Try a different idea, or tap \"Get a hint\" for a clue.";
  }
  return "Look for an unprotected piece or a king that's running out of squares. Tap \"Show the answer\" if you want to see it.";
}
