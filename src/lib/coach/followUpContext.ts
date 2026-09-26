/**
 * The per-turn context for a follow-up, cut to the question.
 *
 * The follow-up path used to append the whole compact game context on every
 * turn: the PGN, one narrated sentence per half-move (eighty lines for a
 * forty-move game), the twelve worst moves, and a piece map of the FINAL
 * position, whatever the question was about. Then the contract block, then
 * the viewed board. Roughly fifteen thousand uncached characters a turn, most
 * of them about moves the player was not asking about — and none of them
 * about the move they were, unless it happened to be a card.
 *
 * Two builders here replace that:
 *
 *   - `buildAnchorBlock` describes the ONE move the question names (see
 *     questionAnchor.ts): the boards before and after it, the verified
 *     relational facts, the eval swing, the engine's preferred move and its
 *     line with what each move does (lineStory.ts), and what the game did
 *     next told the same way. It is what lets a follow-up about move 22 be
 *     as grounded as a follow-up about a card.
 *   - `buildFollowUpCondensedContext` is the slimmer standing context: the
 *     game overview, the PGN, the move table WINDOWED to the moves around the
 *     one under discussion, and the worst-moves list. Same numbers, same
 *     formatting, so the referee's licence for eval figures is unchanged.
 *
 * Everything is pure and everything is derived from what the analysis
 * context already stores.
 */
import { Chess } from "chess.js";
import type { AnalysisContext } from "@/lib/analysisContextCache";
import { buildGameOverview } from "./gameOverview";
import { buildRelationalFacts } from "@/lib/relational/relationalFactsBuilder";
import { convertPvToSan, uciToSan } from "@/lib/contract/chessFormat";
import { buildLineStory, projectLineStory } from "@/lib/contract/lineStory";
import type { QuestionAnchor } from "./questionAnchor";

/** The shape of one client-side Stockfish position, as far as this file reads it. */
interface EvalLineLike {
  cp?: number | null;
  mate?: number | null;
  depth?: number;
  pv?: string[];
}
interface PositionLike {
  lines?: EvalLineLike[];
  bestMove?: string;
}
interface GameEvalLike {
  positions?: PositionLike[];
}

/** Half-moves either side of the anchor kept in the move table. */
const TABLE_WINDOW_PLIES = 6;
/** Plies of an engine line shown to the model. */
const LINE_PLIES = 8;
/** Plies of the game's own continuation shown to the model. */
const GAME_PLIES = 6;

/** Same rule as positionFacts.isRealEval: a depth-0 line is a client timeout, not a 0.00. */
function realEval(line: EvalLineLike | undefined): line is EvalLineLike {
  if (!line || line.depth === 0) return false;
  return (
    (line.cp !== undefined && line.cp !== null) ||
    (line.mate !== undefined && line.mate !== null)
  );
}

/** Same formatting as the compact move table, so the strings match what the referee licenses. */
function formatEval(line: EvalLineLike): string {
  if (typeof line.mate === "number")
    return `M${line.mate > 0 ? "+" : ""}${line.mate}`;
  const cp = line.cp ?? 0;
  if (Math.abs(cp) >= 9000) return cp > 0 ? "M+" : "M-";
  return `${cp >= 0 ? "+" : ""}${(cp / 100).toFixed(2)}`;
}

function pieceMap(
  fen: string
): { white: string; black: string; toMove: "White" | "Black" } | null {
  let game: Chess;
  try {
    game = new Chess(fen);
  } catch {
    return null;
  }
  const white: string[] = [];
  const black: string[] = [];
  for (const row of game.board()) {
    for (const sq of row) {
      if (sq)
        (sq.color === "w" ? white : black).push(
          sq.type.toUpperCase() + sq.square
        );
    }
  }
  return {
    white: white.join(" "),
    black: black.join(" "),
    toMove: game.turn() === "w" ? "White" : "Black",
  };
}

/** Story lines for the chat block: no citation prefix, no ledger labels. */
function storyLines(fen: string, sans: string[]): string[] {
  if (sans.length === 0) return [];
  try {
    return projectLineStory(buildLineStory(fen, sans, { maxPlies: 6 })).map(
      (line) =>
        line
          .replace(/^s\d{1,2} /, "")
          .replace(/^material: /, "after these moves: ")
          .replace(/^offer: /, "note: ")
    );
  } catch {
    return [];
  }
}

function renderLine(
  startMoveNumber: number,
  startsWhite: boolean,
  sans: string[]
): string {
  const parts: string[] = [];
  let n = startMoveNumber;
  let white = startsWhite;
  for (const san of sans) {
    if (white) parts.push(`${n}. ${san}`);
    else {
      parts.push(parts.length === 0 ? `${n}... ${san}` : san);
      n += 1;
    }
    white = !white;
  }
  return parts.join(" ");
}

/**
 * Everything the model may say about the move the question names.
 */
/**
 * The engine's line from the position before the anchored move, as SAN, at
 * most LINE_PLIES long; empty without a real evaluation there.
 */
export function anchorEngineLine(
  anchor: QuestionAnchor,
  gameEval: GameEvalLike | undefined
): string[] {
  const before = gameEval?.positions?.[anchor.index];
  const pvUci = before?.lines?.[0]?.pv ?? [];
  if (pvUci.length === 0 || !realEval(before?.lines?.[0])) return [];
  try {
    return convertPvToSan(anchor.fenBefore, pvUci).slice(0, LINE_PLIES);
  } catch {
    return [];
  }
}

/**
 * The lines the referee may accept as sequences for this move, with the
 * ply each starts from. The game's own moves need no entry.
 */
export function anchorLicensedLines(
  anchor: QuestionAnchor,
  gameEval: GameEvalLike | undefined
): { startFen: string; startPly: number; sans: string[] }[] {
  const line = anchorEngineLine(anchor, gameEval);
  return line.length > 0
    ? [{ startFen: anchor.fenBefore, startPly: anchor.index, sans: line }]
    : [];
}

/** The board after the alternative the question asked about, when it is legal. */
export function anchorAlternativeFen(anchor: QuestionAnchor): string | null {
  if (!anchor.askedSan) return null;
  try {
    const g = new Chess(anchor.fenBefore);
    return g.move(anchor.askedSan) ? g.fen() : null;
  } catch {
    return null;
  }
}

export function buildAnchorBlock(
  anchor: QuestionAnchor,
  playedMoves: readonly string[],
  gameEval: GameEvalLike | undefined,
  playerColor: "w" | "b"
): string {
  const colorName = anchor.color === "w" ? "White" : "Black";
  const whose =
    anchor.color === playerColor ? "the player's move" : "the opponent's move";
  const label = `${anchor.moveNumber}${anchor.color === "w" ? "." : "..."} ${anchor.san}`;
  const out: string[] = [];
  out.push(
    `## MOVE UNDER DISCUSSION — ${label} (${colorName}, ${whose}). The board will show the position after it.`
  );
  if (anchor.askedSan) {
    out.push(
      `The player asks about ${anchor.askedSan} as an alternative at this point.`
    );
  }

  const before = gameEval?.positions?.[anchor.index];
  const after = gameEval?.positions?.[anchor.index + 1];
  const evalBefore = realEval(before?.lines?.[0])
    ? formatEval(before!.lines![0])
    : null;
  const evalAfter = realEval(after?.lines?.[0])
    ? formatEval(after!.lines![0])
    : null;
  if (evalBefore && evalAfter) {
    out.push(
      `Eval before the move: ${evalBefore}. After it: ${evalAfter}. (Pawns, White's perspective.)`
    );
  } else if (evalAfter) {
    out.push(
      `Eval after the move: ${evalAfter}. (Pawns, White's perspective.)`
    );
  } else {
    out.push(
      "Engine data for this move is unavailable — do not quote an evaluation for it."
    );
  }

  // The engine's preference and its line, narrated ply by ply.
  let bestSan: string | null = null;
  if (before?.bestMove && before.bestMove !== "N/A") {
    try {
      bestSan = uciToSan(anchor.fenBefore, before.bestMove) || null;
    } catch {
      bestSan = null;
    }
  }
  const lineSan = anchorEngineLine(anchor, gameEval);
  if (
    bestSan &&
    bestSan.replace(/[+#]/g, "") !== anchor.san.replace(/[+#]/g, "")
  ) {
    out.push(`Engine's preferred move here: ${bestSan}.`);
  } else if (bestSan) {
    out.push("The move played was the engine's preferred move.");
  }
  if (lineSan.length > 0) {
    // The line's rating is the rating of the position it starts from; said
    // next to the line so the number after the played move is never read as
    // the alternative's. And the played move is not in it: live, the coach
    // once had Black "recapture on c7" in a line where the knight never went
    // there.
    const rated = evalBefore
      ? ` (the engine rates this line ${evalBefore}, White's perspective)`
      : "";
    out.push(
      `Engine line from before the move${rated}: ${renderLine(anchor.moveNumber, anchor.color === "w", lineSan)}`
    );
    const story = storyLines(anchor.fenBefore, lineSan);
    if (story.length > 0) {
      out.push("  what the engine line does:");
      for (const l of story) out.push(`    - ${l}`);
    }
    out.push(
      `  This line replaces ${label}: ${anchor.san} is not played in it.`
    );
  }

  // What the game did from there, told the same way.
  const gameSans = playedMoves.slice(anchor.index, anchor.index + GAME_PLIES);
  if (gameSans.length > 0) {
    out.push(
      `What the game did next: ${renderLine(anchor.moveNumber, anchor.color === "w", gameSans)}`
    );
    const story = storyLines(anchor.fenBefore, gameSans);
    if (story.length > 0) {
      out.push("  what these moves do:");
      for (const l of story) out.push(`    - ${l}`);
    }
  }

  const pmBefore = pieceMap(anchor.fenBefore);
  if (pmBefore) {
    out.push(`Board BEFORE ${label} (${pmBefore.toMove} to move):`);
    out.push(`  White pieces: ${pmBefore.white}`);
    out.push(`  Black pieces: ${pmBefore.black}`);
    try {
      const rel = buildRelationalFacts(anchor.fenBefore).summary.trim();
      if (rel)
        out.push(
          rel
            .split("\n")
            .map((l) => `  ${l}`)
            .join("\n")
        );
    } catch {
      /* relational read is best-effort */
    }
  }
  const pmAfter = pieceMap(anchor.fenAfter);
  if (pmAfter) {
    out.push(`Board AFTER ${label} (${pmAfter.toMove} to move):`);
    out.push(`  White pieces: ${pmAfter.white}`);
    out.push(`  Black pieces: ${pmAfter.black}`);
  }
  // The alternative the question named gets its own board, so an answer
  // about it is not written from the board after the move that was played.
  const altFen = anchorAlternativeFen(anchor);
  const pmAlt = altFen ? pieceMap(altFen) : null;
  if (altFen && pmAlt) {
    out.push(
      `Board AFTER ${anchor.moveNumber}${anchor.color === "w" ? "." : "..."} ${anchor.askedSan} instead (the alternative asked about, ${pmAlt.toMove} to move):`
    );
    out.push(`  White pieces: ${pmAlt.white}`);
    out.push(`  Black pieces: ${pmAlt.black}`);
  }
  out.push(
    "The lines above are the only lines for this move. A move from another key moment's line belongs to that move, not to this one."
  );
  out.push(
    "Use only these facts for this move. Do not read or reconstruct the board from the move list."
  );
  return out.join("\n");
}

/**
 * Pull one "## SECTION" out of the stored compact context by heading.
 * Sections are separated by blank lines, exactly as buildCompactGameContext
 * joins them.
 */
function sectionOf(compact: string, heading: string): string | null {
  const sections = compact.split(/\n\n(?=## |Player is )/);
  const hit = sections.find((s) => s.startsWith(`## ${heading}`));
  return hit ?? null;
}

const TABLE_LINE_RE = /^Move (\d+) \((White|Black)\)/;

/**
 * The move table, cut to a window of plies around `centerPly` (half-moves
 * played). Lines with a severity label are kept wherever they are, so the
 * game's turning points never fall out of the window.
 */
export function windowMoveTable(
  compact: string,
  centerPly: number | null
): string | null {
  const section = sectionOf(compact, "MOVE-BY-MOVE NARRATIVE");
  if (!section) return null;
  const lines = section.split("\n");
  const head = lines[0];
  const body = lines.slice(1).filter((l) => TABLE_LINE_RE.test(l));
  if (body.length === 0) return null;
  const centerIndex =
    centerPly === null ? body.length - 1 : Math.max(0, centerPly - 1);
  const kept: string[] = [];
  let omitted = 0;
  body.forEach((line, i) => {
    const inWindow = Math.abs(i - centerIndex) <= TABLE_WINDOW_PLIES;
    const flagged = /— (BLUNDER|MISTAKE|INACCURACY)\b/.test(line);
    if (inWindow || flagged) kept.push(line);
    else omitted += 1;
  });
  const title = head
    .replace("## MOVE-BY-MOVE NARRATIVE", "## MOVE TABLE")
    .replace(
      "(One sentence per half-move.",
      "(The moves around the one under discussion, plus every flagged move."
    );
  const tail =
    omitted > 0
      ? [
          `(${omitted} routine ${omitted === 1 ? "move" : "moves"} not listed — ask about one by number to see it.)`,
        ]
      : [];
  return [title, ...kept, ...tail].join("\n");
}

/**
 * The standing context for a follow-up turn, cut to what the question needs.
 *
 * `centerPly` is the half-move count of the position under discussion (the
 * anchor's ply when the question named a move, the viewed ply otherwise,
 * null for the end of the game).
 */
export function buildFollowUpCondensedContext(
  context: AnalysisContext,
  centerPly: number | null
): string {
  const lines: string[] = [];
  lines.push("## THIS GAME");
  lines.push(
    `Player: ${context.playerColor === "w" ? "White" : "Black"} · Skill: ${context.skillLevel} · ${context.moveCount} full moves`
  );
  for (const l of buildGameOverview(context)) lines.push(l);
  lines.push(
    "Your review of this game is your first message in this conversation. Build on it; do not repeat it. If the player corrects something in it, take the correction."
  );

  const compact = context.compactGameContext ?? "";
  const pgn = sectionOf(compact, "MOVES PLAYED (PGN)");
  if (pgn) {
    lines.push("");
    lines.push(pgn);
  }
  const table = windowMoveTable(compact, centerPly);
  if (table) {
    lines.push("");
    lines.push(table);
  }
  const mistakes = sectionOf(compact, "TOP MISTAKES");
  if (mistakes) {
    lines.push("");
    lines.push(mistakes);
  }
  return lines.join("\n");
}
