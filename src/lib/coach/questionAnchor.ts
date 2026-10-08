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
  /**
   * How the question named the move; "what-if" when the client's verified
   * what-if placed it (lib/coach/clientEvals.ts), whatever the words said;
   * "cursor" for the move before the board on screen, when a turn about a
   * side asks what that side was thinking and names no move.
   */
  matched: "numbered" | "move-number" | "bare-san" | "what-if" | "cursor";
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
  "g"
);
/** "Move 3: Nxd4", "move 3 (Nxd4)" — the coach's own card phrasing, side unstated. */
const LABELLED_RE = new RegExp(
  `\\bmove\\s+(\\d{1,3})\\s*[:(]\\s*(${SAN_CORE})(?![A-Za-z0-9])`,
  "gi"
);
/** "move 8", "Move 12", "my 8th move", "the 12th move". */
const MOVE_NUMBER_RE =
  /\bmove\s+(\d{1,3})\b|\b(\d{1,3})(?:st|nd|rd|th)\s+move\b/gi;
/** A piece move, a castle or a pawn capture written bare ("Nc7+", "exd5", "O-O"). Pawn pushes need a cue. */
const BARE_SAN_RE =
  /(?<![A-Za-z0-9.])((?:[NBRQK][a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?)|O-O(?:-O)?[+#]?|[a-h]x[a-h][1-8](?:=[NBRQ])?[+#]?)(?![A-Za-z0-9])/g;
const CUED_PAWN_RE =
  /\b(?:play|played|plays|playing|pushed|push|pushing|move|moved|with|after|instead of|rather than|why not|was)\s+([a-h][1-8](?:=[NBRQ])?[+#]?)(?![A-Za-z0-9])/gi;

const strip = (s: string) => s.replace(/[+#!?]/g, "").toLowerCase();

/** The owner written right before a move: "my", "my opponent's", "Black's". */
const OWNER_BEFORE_RE =
  /\b((?:(?:my|the)\s+)?opponent['’]s|my|his|her|their|white['’]?s?|black['’]?s?)\s+(?:own\s+)?$/i;
/** The owner written right after a move number: "move 20 for Black", "by White". */
const OWNER_AFTER_RE = /^\s*(?:for|by)\s+(white|black)\b/i;
/** "after Black's move 7": the move asked about is the reply to it. */
const REPLY_BEFORE_RE =
  /\b(?:after|following|in\s+(?:reply|response|answer)\s+to)\s+$/i;
/** "move 3 pawns": a count of things moved, not a move number. */
const NOT_A_MOVE_AFTER_RE =
  /^\s+(?:pawns?|pieces?|times?|squares?|knights?|bishops?|rooks?|queens?|kings?)\b/i;

/**
 * The side an owner names, and where the owner starts in `before`. A
 * colour always counts; "my", "my opponent's", "his" only when the player's
 * side is confirmed (it is otherwise the board orientation, a guess).
 */
function ownerOf(
  before: string,
  after: string,
  playerColor: "w" | "b",
  sideConfirmed: boolean
): { side: "w" | "b"; start: number } | null {
  const other = playerColor === "w" ? "b" : "w";
  const b = OWNER_BEFORE_RE.exec(before);
  if (b) {
    const word = b[1].toLowerCase();
    if (word.startsWith("white")) return { side: "w", start: b.index };
    if (word.startsWith("black")) return { side: "b", start: b.index };
    if (sideConfirmed)
      return { side: word === "my" ? playerColor : other, start: b.index };
    return null;
  }
  const a = OWNER_AFTER_RE.exec(after);
  if (a)
    return {
      side: a[1].toLowerCase() === "white" ? "w" : "b",
      start: before.length,
    };
  return null;
}

/** How a turn about a side reads the question (questionPerspective.ts). */
export interface AnchorSideOptions {
  /** Whose "move N" a bare number is: the turn's subject, else the player. */
  defaultSide: "w" | "b";
  /** Whether "my", "my opponent's", "his" may be read against the player's side. */
  sideConfirmed: boolean;
  /**
   * The subject came from this message's words: a bare "move N" is that
   * side's or none, never the other side's in its place.
   */
  strictDefault?: boolean;
  /**
   * A bare move played by both sides ("O-O") is the default side's when it
   * played it. Set when the turn has a subject; without one, the nearest
   * occurrence to the board on screen, as before.
   */
  preferDefaultSide?: boolean;
  /** Called with a move the words name that the game never played (the side had no move N). */
  onMissing?: (missing: { moveNumber: number; color: "w" | "b" }) => void;
}

function fenAt(moves: readonly string[], halfMoves: number): string | null {
  try {
    const g = new Chess();
    for (let i = 0; i < halfMoves; i++) g.move(moves[i]);
    return g.fen();
  } catch {
    return null;
  }
}

/** Whether `san` is a legal move in the game's position before `index`. */
function legalAt(
  moves: readonly string[],
  index: number,
  san: string
): boolean {
  const fen = fenAt(moves, index);
  if (!fen) return false;
  try {
    return !!new Chess(fen).move(san);
  } catch {
    return false;
  }
}

function build(
  moves: readonly string[],
  index: number,
  matched: QuestionAnchor["matched"],
  askedSan?: string
): QuestionAnchor | null {
  if (index < 0 || index >= moves.length) return null;
  const fenBefore = fenAt(moves, index);
  const fenAfter = fenAt(moves, index + 1);
  if (!fenBefore || !fenAfter) return null;
  const san = moves[index];
  const asked =
    askedSan && strip(askedSan) !== strip(san) ? askedSan : undefined;
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
 * The anchor at a ply the client's verified what-if names: the game's move
 * there, with the alternative asked about unless it is that move. Both
 * SANs are the server's own, so they are compared as written: Bxc4 is not
 * the pawn's bxc4 (the words' reading folds case, since a player may type
 * "nf3"). Null when the index is not a move of the game (a what-if at the
 * final position has no played move to anchor on).
 */
export function anchorAtIndex(
  moves: readonly string[],
  index: number,
  askedSan?: string
): QuestionAnchor | null {
  const anchor = build(moves, index, "what-if");
  if (!anchor || !askedSan) return anchor;
  const exact = (san: string) => san.replace(/[+#!?]/g, "");
  return exact(askedSan) === exact(anchor.san)
    ? anchor
    : { ...anchor, askedSan };
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
  /**
   * The follow-up route's reading under COACH_PERSPECTIVE
   * (questionPerspective.ts). With it, "move N" is `defaultSide`'s move N,
   * an owner beside a move is read ("my" the player's, "my opponent's" and
   * "his" the other side's, "Black's" and "for Black" that colour's, with
   * no fallback to the other side), "after Black's move 7" is the reply,
   * "20. Ka7" is Black's 20th when Ka7 is Black's move there and no move
   * for White, and a bare move prefers the default side's occurrences.
   * Absent, the reading is exactly what it was.
   */
  opts?: AnchorSideOptions
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
    let index = (n - 1) * 2 + (black ? 1 : 0);
    // "20. Ka7" for Black's 20... Ka7: no move for White there, and the
    // other side's move at that number.
    if (opts) {
      const otherIndex = (n - 1) * 2 + (black ? 0 : 1);
      if (
        index >= 0 &&
        index < moves.length &&
        otherIndex < moves.length &&
        strip(moves[index]) !== strip(m[3]) &&
        strip(moves[otherIndex]) === strip(m[3]) &&
        !legalAt(moves, index, m[3])
      )
        index = otherIndex;
    }
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
    const a = build(
      moves,
      pick.index,
      "numbered",
      played ? undefined : pick.san
    );
    if (a) return a;
  }

  // 2. "move 8" with no notation: the player's own move by default.
  for (const m of Array.from(text.matchAll(MOVE_NUMBER_RE))) {
    const n = Number(m[1] ?? m[2]);
    if (!Number.isFinite(n) || n < 1) continue;
    if (opts) {
      const before = text.slice(0, m.index ?? 0);
      const after = text.slice((m.index ?? 0) + m[0].length);
      if (NOT_A_MOVE_AFTER_RE.test(after)) continue;
      const owner = ownerOf(before, after, playerColor, opts.sideConfirmed);
      if (owner) {
        const index = (n - 1) * 2 + (owner.side === "b" ? 1 : 0);
        const reply = REPLY_BEFORE_RE.test(before.slice(0, owner.start));
        const a = build(moves, index + (reply ? 1 : 0), "move-number");
        if (a) return a;
        if (index >= moves.length)
          opts.onMissing?.({ moveNumber: n, color: owner.side });
        continue;
      }
      const own = (n - 1) * 2 + (opts.defaultSide === "b" ? 1 : 0);
      const other = (n - 1) * 2 + (opts.defaultSide === "b" ? 0 : 1);
      const a =
        build(moves, own, "move-number") ??
        (opts.strictDefault ? null : build(moves, other, "move-number"));
      if (a) return a;
      if (own >= moves.length)
        opts.onMissing?.({ moveNumber: n, color: opts.defaultSide });
      continue;
    }
    const own = (n - 1) * 2 + (playerColor === "b" ? 1 : 0);
    const other = (n - 1) * 2 + (playerColor === "b" ? 0 : 1);
    const a =
      build(moves, own, "move-number") ?? build(moves, other, "move-number");
    if (a) return a;
  }

  // 3. A bare move: the occurrence nearest the viewed board, else the first.
  const bare = [
    ...Array.from(text.matchAll(BARE_SAN_RE)).map((m) => ({
      san: m[1],
      at: m.index ?? 0,
    })),
    ...Array.from(text.matchAll(CUED_PAWN_RE)).map((m) => ({
      san: m[1],
      at: (m.index ?? 0) + m[0].lastIndexOf(m[1]),
    })),
  ];
  for (const { san, at } of bare) {
    const key = strip(san);
    let hits: number[] = [];
    moves.forEach((mv, i) => {
      if (strip(mv) === key) hits.push(i);
    });
    if (opts && hits.length > 0) {
      // "my O-O-O", "Black's O-O-O": that side's; otherwise the default
      // side's when it played the move, else wherever it was played.
      const owner = ownerOf(
        text.slice(0, at),
        "",
        playerColor,
        opts.sideConfirmed
      );
      const sideOf = (i: number) => (i % 2 === 0 ? "w" : "b");
      if (owner) hits = hits.filter((i) => sideOf(i) === owner.side);
      else if (
        opts.preferDefaultSide &&
        hits.some((i) => sideOf(i) === opts.defaultSide)
      )
        hits = hits.filter((i) => sideOf(i) === opts.defaultSide);
    }
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
