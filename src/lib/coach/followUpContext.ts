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
import type { VerifiedWhatIf } from "./clientEvals";
import {
  sideMoments,
  sideMomentsSection,
  type SideMoments,
} from "./compactGameContext";
import { fensAlongGame } from "@/lib/contract/chessFormat";

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
  return engineLineAt(anchor.index, anchor.fenBefore, gameEval);
}

/** The engine's line from the position before the game's move at `index`, as SAN. */
function engineLineAt(
  index: number,
  fenBefore: string,
  gameEval: GameEvalLike | undefined
): string[] {
  const before = gameEval?.positions?.[index];
  const pvUci = before?.lines?.[0]?.pv ?? [];
  if (pvUci.length === 0 || !realEval(before?.lines?.[0])) return [];
  try {
    return convertPvToSan(fenBefore, pvUci).slice(0, LINE_PLIES);
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

/**
 * The what-if's lines for the referee: each move the client's search scored,
 * from the position it is played from, at the ply it starts on. Marked as
 * replacing the game's move there: a sentence about the alternative may open
 * its line with an unnumbered move (the referee's what-if root), and the
 * lines stay out of its shared ply table and its pool, so no other line can
 * borrow their moves.
 */
export function whatIfLicensedLines(
  whatIf: VerifiedWhatIf
): { startFen: string; startPly: number; sans: string[]; replacing: true }[] {
  return whatIf.moves.map((m) => ({
    startFen: whatIf.fenBefore,
    startPly: whatIf.index,
    sans: m.lineSan,
    replacing: true as const,
  }));
}

/**
 * The what-if's numbers as the referee licenses them, in the anchor block's
 * own spelling, each tied to its move: a sentence may quote +2.51 for 8.
 * Qxc1, never for 8. Nc7+. Passed as they stand, since the block's WHAT-IF
 * lines are not in the text the referee reads its licence from.
 */
export function whatIfLicensedEvals(
  whatIf: VerifiedWhatIf
): { eval: string; san: string }[] {
  return whatIf.moves.map((m) => ({ eval: formatEval(m), san: m.san }));
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
  playerColor: "w" | "b",
  /**
   * The client's what-if for this move, verified (clientEvals.ts): its own
   * search's numbers and lines, told as their own regime. Absent, the block
   * is byte for byte what it was.
   */
  whatIf?: VerifiedWhatIf | null,
  /**
   * The side this turn is about (questionPerspective.ts), when it is not
   * the player's: said in the header. "The player's move" and "the
   * opponent's move" stay the player's, who is "you", and are left out
   * when the player's side is a guess. Absent, the header is as it was.
   */
  subject?: { side: "w" | "b"; confirmed: boolean } | null
): string {
  const colorName = anchor.color === "w" ? "White" : "Black";
  const whose =
    anchor.color === playerColor ? "the player's move" : "the opponent's move";
  const label = `${anchor.moveNumber}${anchor.color === "w" ? "." : "..."} ${anchor.san}`;
  const about =
    subject && subject.side !== playerColor
      ? `${subject.confirmed ? `, ${whose}` : ""}, and this turn is about ${subject.side === "w" ? "White" : "Black"}'s moves`
      : `, ${whose}`;
  const out: string[] = [];
  out.push(
    `## MOVE UNDER DISCUSSION — ${label} (${colorName}${about}). The board will show the position after it.`
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
  } else if (whatIf && whatIf.index === anchor.index) {
    out.push(
      "The review has no evaluation for this move: quote only the what-if search's numbers below."
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
  // The what-if's own search: the alternative beside the game's move and
  // the engine's best there, from one search at one depth on the player's
  // device. Its numbers are compared with each other only, never with the
  // review's evals above (another search, at another depth, on a warm
  // table). Every figure is followed by its perspective, never by a full
  // stop, so the referee reads it, and none is put as "the engine rates",
  // which the eval parser takes for attribution and does not check.
  if (whatIf && whatIf.index === anchor.index && whatIf.moves.length > 0) {
    // Asked about by name, the game's own move is no alternative to itself.
    const roleWord = (role: string) =>
      role === "asked"
        ? anchor.askedSan
          ? "the alternative asked about"
          : "the move played, asked about"
        : role === "played"
          ? "the move played"
          : "the engine's best";
    out.push(
      `WHAT-IF SEARCH of the position before ${label}, at depth ${whatIf.depth}: one search on the player's device that scored these moves side by side. Its numbers compare with each other only, never with the evals above, which come from another search.`
    );
    for (const m of whatIf.moves) {
      const shown = `${anchor.moveNumber}${anchor.color === "w" ? "." : "..."} ${m.san}`;
      out.push(
        `  ${shown} (${roleWord(m.role)}): ${formatEval(m)} (White's perspective), line ${renderLine(anchor.moveNumber, anchor.color === "w", m.lineSan)}`
      );
      if (m.role === "asked") {
        const story = storyLines(whatIf.fenBefore, m.lineSan);
        if (story.length > 0) {
          out.push("    what this line does:");
          for (const l of story) out.push(`      - ${l}`);
        }
      }
    }
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
  centerPly: number | null,
  /**
   * The side this turn is about, when it is not the player's
   * (questionPerspective.ts): its costliest moves are listed in place of
   * the player's, under a heading that names whose they are, with its
   * accuracy. With the player's side unconfirmed, the player's colour is
   * labelled a guess and the player's accuracy left out. Absent, the
   * context is byte for byte what it was.
   */
  subject?: { side: "w" | "b"; confirmed: boolean } | null
): string {
  const player = context.playerColor === "w" ? "w" : "b";
  const other = subject && subject.side !== player ? subject : null;
  const lines: string[] = [];
  lines.push("## THIS GAME");
  lines.push(
    `Player: ${player === "w" ? "White" : "Black"}${other && !other.confirmed ? " (a guess, not confirmed)" : ""} · Skill: ${context.skillLevel} · ${context.moveCount} full moves`
  );
  for (const l of buildGameOverview(context)) {
    if (other && !other.confirmed && /^(?:Your accuracy|Estimated Elo)/.test(l))
      continue;
    lines.push(l);
  }
  if (other) {
    const name = other.side === "w" ? "White" : "Black";
    const acc = (
      context.gameEval as
        | { accuracy?: { white?: number; black?: number } }
        | undefined
    )?.accuracy?.[other.side === "w" ? "white" : "black"];
    if (typeof acc === "number" && Number.isFinite(acc))
      lines.push(
        `${name}'s accuracy this game${other.confirmed ? " (the player's opponent)" : ""}: ${acc.toFixed(1)}%`
      );
  }
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
  // The other side's list never falls back to the player's: under the
  // turn's clause the player's mistakes would be read as the other side's.
  const mistakes = other
    ? sideMomentsSection(
        subjectMomentsOf(context, other.side),
        `${other.side === "w" ? "WHITE" : "BLACK"}'S COSTLIEST MOVES (${other.confirmed ? "the player's opponent, " : ""}by the engine's winning chances, worst first, max 12)`
      )
    : sectionOf(compact, "TOP MISTAKES");
  if (mistakes) {
    lines.push("");
    lines.push(mistakes);
  }
  return lines.join("\n");
}

const subjectMoments = new WeakMap<
  AnalysisContext,
  Map<"w" | "b", SideMoments>
>();

/** One side's moments for this context, read once per context and side. */
function subjectMomentsOf(
  context: AnalysisContext,
  side: "w" | "b"
): SideMoments {
  let memo = subjectMoments.get(context);
  if (!memo) {
    memo = new Map();
    subjectMoments.set(context, memo);
  }
  const hit = memo.get(side);
  if (hit) return hit;
  const read = sideMoments(
    context.playedMoves ?? [],
    context.gameEval as never,
    side
  );
  memo.set(side, read);
  return read;
}

/** Moments in the block for a turn about the other side with no move named. */
const SUBJECT_MOMENTS = 3;

/**
 * For a turn about the other side that names no move and asks about its
 * mistakes ("from Black's side, what went wrong?"): that side's costliest
 * moments, the same ones and in the same order as its list in the standing
 * context, each with its swing, the engine's preferred move and line
 * instead of it, and the best reply after it. The anchored block covers one
 * move the question names; this covers the moves the question means.
 *
 * `text` is the model's copy. `licenceText` is what the referee licenses
 * from it, without the lines: they are licensed as lines of their own
 * (`lines`, replacing the game's move at their ply), kept out of the
 * referee's shared ply table and pool, so no other move borrows their moves
 * at their numbers (a what-if's lines are licensed the same way).
 *
 * Null when the engine scored none of the side's moves.
 */
export interface SubjectMomentsBlock {
  text: string;
  licenceText: string;
  fens: string[];
  lines: {
    startFen: string;
    startPly: number;
    sans: string[];
    replacing: true;
  }[];
}

const subjectBlocks = new WeakMap<
  AnalysisContext,
  Map<string, SubjectMomentsBlock | null>
>();

export function buildSubjectMomentsBlock(
  context: AnalysisContext,
  side: "w" | "b",
  confirmed: boolean
): SubjectMomentsBlock | null {
  // Built once per context, side and confirmation: the first moment's
  // story is most of its cost (about 0.1 s on a long game), and the
  // context is the same object for every turn of a conversation.
  let memo = subjectBlocks.get(context);
  if (!memo) {
    memo = new Map();
    subjectBlocks.set(context, memo);
  }
  const key = `${side}:${confirmed ? 1 : 0}`;
  if (memo.has(key)) return memo.get(key)!;
  const block = readSubjectMomentsBlock(context, side, confirmed);
  memo.set(key, block);
  return block;
}

function readSubjectMomentsBlock(
  context: AnalysisContext,
  side: "w" | "b",
  confirmed: boolean
): SubjectMomentsBlock | null {
  const playedMoves = context.playedMoves ?? [];
  const gameEval = context.gameEval as GameEvalLike | undefined;
  const read = subjectMomentsOf(context, side);
  if (read.scored === 0) return null;
  const name = side === "w" ? "White" : "Black";
  const replier = side === "w" ? "Black" : "White";
  const head = [
    `## ${name.toUpperCase()}'S KEY MOMENTS (${confirmed ? "the player's opponent, " : ""}the moves this turn is about)`,
  ];
  const moments = read.moments.slice(0, SUBJECT_MOMENTS);
  if (moments.length === 0) {
    head.push(
      read.scored === read.played
        ? `By the engine's count, no ${name} move lost half a pawn or more while the result was still open.`
        : `The engine scored ${read.scored} of ${name}'s ${read.played} moves, and none of those lost half a pawn or more while the result was still open.`
    );
    const text = head.join("\n");
    return { text, licenceText: text, fens: [], lines: [] };
  }
  head.push(
    `${name}'s costliest moves by the engine, worst first. Evals in pawns, White's perspective. These are flagged moves, so the opening rule does not apply to them.`
  );
  const fens = fensAlongGame(playedMoves);
  const text: string[] = [...head];
  const licence: string[] = [...head];
  const boards: string[] = [];
  const licensed: {
    startFen: string;
    startPly: number;
    sans: string[];
    replacing: true;
  }[] = [];
  moments.forEach((m, k) => {
    const fenBefore = fens[m.index];
    const fenAfter = fens[m.index + 1];
    boards.push(fenBefore, fenAfter);
    const mark = side === "w" ? "." : "...";
    const label = `${m.moveNum}${mark} ${m.moveSan}`;
    const severity =
      m.drop >= 300
        ? "a BLUNDER"
        : m.drop >= 150
          ? "a MISTAKE"
          : "an INACCURACY";
    const lost =
      m.mateBefore === undefined && m.mateAfter === undefined
        ? ` (${name} lost ${(m.drop / 100).toFixed(1)} pawns)`
        : "";
    const before = gameEval?.positions?.[m.index]?.lines?.[0];
    const after = gameEval?.positions?.[m.index + 1]?.lines?.[0];
    const swing =
      realEval(before) && realEval(after)
        ? ` Eval ${formatEval(before)} → ${formatEval(after)}.`
        : "";
    // The preferred move and its line from one source, the line's first
    // move; none when the engine's line starts with the move played.
    const line = engineLineAt(m.index, fenBefore, gameEval);
    const lineIsPlayed =
      line.length > 0 &&
      line[0].replace(/[+#]/g, "") === m.moveSan.replace(/[+#]/g, "");
    const preferred = lineIsPlayed ? undefined : (line[0] ?? m.bestSan);
    const row = `- ${label}, ${severity}${lost}.${swing}${preferred ? ` The engine preferred ${label.replace(m.moveSan, preferred)}.` : ""}`;
    text.push(row);
    licence.push(row);
    if (line.length > 0 && !lineIsPlayed) {
      licensed.push({
        startFen: fenBefore,
        startPly: m.index,
        sans: line,
        replacing: true,
      });
      text.push(
        `  Engine line instead of it: ${renderLine(m.moveNum, side === "w", line)}`
      );
      if (k === 0) {
        const story = storyLines(fenBefore, line);
        if (story.length > 0) {
          text.push("    what the engine line does:");
          for (const l of story) text.push(`      - ${l}`);
          // Its words are licensed (a faithful "takes the pawn on a2"),
          // its moves only along the line itself.
          const words = story
            .map((l) => l.replace(/^\d+\.(?:\.\.)?\S+(?:\s+—\s+)?/, ""))
            .filter((l) => l.trim().length > 0);
          if (words.length > 0) {
            licence.push("    what the engine line does:");
            for (const l of words) licence.push(`      - ${l}`);
          }
        }
      }
    }
    const reply = engineLineAt(m.index + 1, fenAfter, gameEval);
    if (reply.length > 0) {
      const replyNumber = side === "w" ? m.moveNum : m.moveNum + 1;
      const first = renderLine(replyNumber, side === "b", reply.slice(0, 1));
      text.push(
        `  ${replier}'s best reply after it: ${first} (the engine's line runs ${renderLine(replyNumber, side === "b", reply)})`
      );
      licence.push(`  ${replier}'s best reply after it: ${first}`);
    }
  });
  const tail =
    "Each line belongs to the move it is listed under. A move from one moment's line is not a move at another.";
  text.push(tail);
  licence.push(tail);
  return {
    text: text.join("\n"),
    licenceText: licence.join("\n"),
    fens: boards,
    lines: licensed,
  };
}
