/**
 * Which move is this question about?
 *
 * A follow-up on /analysis is grounded on the board the client says it is
 * showing. That is the right default and the wrong answer whenever the
 * question names a move: "why was 8. Nc7+ a mistake?" asked from the start
 * position was answered about the start position, with the validators and
 * the referee checking the reply against a board the question never
 * mentioned. This resolver reads the move out of the question so the route
 * can ground, validate and referee on the position the player is actually
 * asking about — and tell the client to put that position on the board.
 *
 * Pure. The move list is the game's SAN history from the standard start
 * (the same assumption `getFenAtHalfMove` and the rest of the follow-up
 * grounding already make).
 */
import { Chess } from "chess.js";

export interface QuestionAnchor {
  /** 0-based index into the SAN history of the move under discussion. */
  index: number;
  moveNumber: number;
  color: "w" | "b";
  /** The move that was played there. */
  san: string;
  /** Half-moves on the board AFTER the move: the client's cursor for it. */
  ply: number;
  fenBefore: string;
  fenAfter: string;
  /** How the question named the move. */
  matched: "numbered" | "move-number" | "bare-san";
  /**
   * A move the question wrote in notation at that spot that is NOT the one
   * played ("why not 8. Qxc1?"): an alternative, not a misreading.
   */
  askedSan?: string;
}

const SAN_CORE =
  "(?:[NBRQK][a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?|O-O(?:-O)?[+#]?|[a-h]x[a-h][1-8](?:=[NBRQ])?[+#]?|[a-h][1-8](?:=[NBRQ])?[+#]?)";
/** "8. Nc7+", "8.Nc7+", "8... Kd8", "8...Kd8" — the number decides the ply. */
const NUMBERED_RE = new RegExp(
  `(?<![A-Za-z0-9])(\\d{1,3})\\s*(\\.{1,3})\\s*(${SAN_CORE})(?![A-Za-z0-9])`,
  "g",
);
/** "Move 3: Nxd4", "move 3 (Nxd4)" — the coach's own card phrasing, side unstated. */
const LABELLED_RE = new RegExp(
  `\\bmove\\s+(\\d{1,3})\\s*[:(]\\s*(${SAN_CORE})(?![A-Za-z0-9])`,
  "gi",
);
/** "move 8", "Move 12", "my 8th move", "the 12th move". */
const MOVE_NUMBER_RE = /\bmove\s+(\d{1,3})\b|\b(\d{1,3})(?:st|nd|rd|th)\s+move\b/gi;
/** A piece move, a castle or a pawn capture written bare ("Nc7+", "exd5", "O-O"). Pawn pushes need a cue. */
const BARE_SAN_RE =
  /(?<![A-Za-z0-9.])((?:[NBRQK][a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?)|O-O(?:-O)?[+#]?|[a-h]x[a-h][1-8](?:=[NBRQ])?[+#]?)(?![A-Za-z0-9])/g;
const CUED_PAWN_RE =
  /\b(?:play|played|plays|playing|pushed|push|pushing|move|moved|with|after|instead of|rather than|why not|was)\s+([a-h][1-8](?:=[NBRQ])?[+#]?)(?![A-Za-z0-9])/gi;

const strip = (s: string) => s.replace(/[+#!?]/g, "").toLowerCase();

function fenAt(moves: readonly string[], halfMoves: number): string | null {
  try {
    const g = new Chess();
    for (let i = 0; i < halfMoves; i++) g.move(moves[i]);
    return g.fen();
  } catch {
    return null;
  }
}

function build(
  moves: readonly string[],
  index: number,
  matched: QuestionAnchor["matched"],
  askedSan?: string,
): QuestionAnchor | null {
  if (index < 0 || index >= moves.length) return null;
  const fenBefore = fenAt(moves, index);
  const fenAfter = fenAt(moves, index + 1);
  if (!fenBefore || !fenAfter) return null;
  const san = moves[index];
  const asked = askedSan && strip(askedSan) !== strip(san) ? askedSan : undefined;
  return {
    index,
    moveNumber: Math.floor(index / 2) + 1,
    color: index % 2 === 0 ? "w" : "b",
    san,
    ply: index + 1,
    fenBefore,
    fenAfter,
    matched,
    ...(asked ? { askedSan: asked } : {}),
  };
}

/**
 * Resolve the move a question is about, or null when it names none (the
 * route then grounds on the viewed board, as before).
 *
 * `playerColor` decides whose move "move 12" is when the question gives no
 * side; `viewedPly` breaks ties for a bare "Nc7+" that was played more than
 * once (the occurrence nearest the board the player is looking at).
 */
export function resolveQuestionAnchor(
  question: string,
  moves: readonly string[],
  playerColor: "w" | "b" = "w",
  viewedPly?: number,
): QuestionAnchor | null {
  if (!question || moves.length === 0) return null;
  const text = question.trim();

  // 1. Numbered notation. Prefer a reference to a move that WAS played at
  //    that spot ("why 8. Nc7+ instead of 8. Qxc1" is about Nc7+); otherwise
  //    the first reference, whose SAN becomes the alternative asked about.
  const numbered: Array<{ index: number; san: string }> = [];
  for (const m of Array.from(text.matchAll(NUMBERED_RE))) {
    const n = Number(m[1]);
    const black = m[2].length >= 2;
    const index = (n - 1) * 2 + (black ? 1 : 0);
    if (index >= 0 && index < moves.length) numbered.push({ index, san: m[3] });
  }
  // "Move 3: Nxd4" gives no side: whichever side played that move there.
  for (const m of Array.from(text.matchAll(LABELLED_RE))) {
    const n = Number(m[1]);
    for (const index of [(n - 1) * 2, (n - 1) * 2 + 1]) {
      if (index < moves.length && strip(moves[index]) === strip(m[2])) {
        numbered.push({ index, san: m[2] });
      }
    }
  }
  if (numbered.length > 0) {
    const played = numbered.find((r) => strip(moves[r.index]) === strip(r.san));
    const pick = played ?? numbered[0];
    const a = build(moves, pick.index, "numbered", played ? undefined : pick.san);
    if (a) return a;
  }

  // 2. "move 8" with no notation: the player's own move by default.
  for (const m of Array.from(text.matchAll(MOVE_NUMBER_RE))) {
    const n = Number(m[1] ?? m[2]);
    if (!Number.isFinite(n) || n < 1) continue;
    const own = (n - 1) * 2 + (playerColor === "b" ? 1 : 0);
    const other = (n - 1) * 2 + (playerColor === "b" ? 0 : 1);
    const a = build(moves, own, "move-number") ?? build(moves, other, "move-number");
    if (a) return a;
  }

  // 3. A bare move: the occurrence nearest the viewed board, else the first.
  const bare = [
    ...Array.from(text.matchAll(BARE_SAN_RE)).map((m) => m[1]),
    ...Array.from(text.matchAll(CUED_PAWN_RE)).map((m) => m[1]),
  ];
  for (const san of bare) {
    const key = strip(san);
    const hits: number[] = [];
    moves.forEach((mv, i) => {
      if (strip(mv) === key) hits.push(i);
    });
    if (hits.length === 0) continue;
    let best = hits[0];
    if (typeof viewedPly === "number") {
      let d = Infinity;
      for (const h of hits) {
        const dist = Math.abs(h + 1 - viewedPly);
        if (dist < d) {
          d = dist;
          best = h;
        }
      }
    }
    const a = build(moves, best, "bare-san");
    if (a) return a;
  }

  return null;
}
