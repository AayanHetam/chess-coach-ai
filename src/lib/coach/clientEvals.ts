/**
 * A what-if's numbers, scored by the client's own engine and checked here.
 *
 * The client (coachWhatIf.ts) scores the move a question names beside the
 * game's move and the review's best there in one `searchmoves` search, and
 * can send the result with the follow-up as `clientEvals`. The route never
 * takes it on trust: `verifyClientEvals` replays the game to the position
 * the numbers are about and requires the client's FEN byte for byte, every
 * move and every line move to be legal, the played move to be the game's,
 * the best move to be the review's own, and every number to be in bounds.
 * What survives is licensed like the review's own lines (the referee and
 * the anchor block) and gives the eval validator a reference per move, so a
 * correct number about the alternative is no longer checked against the
 * played move's eval.
 *
 * Client-safe: zod and chess.js only, so the client can build the payload
 * against the same type (lib/coach/__tests__/whatIfClientChain.test.ts keeps
 * the chain clear of the prompt modules and the routes).
 *
 * Scores are White-relative, the convention every number on the page and in
 * the chat context uses; a cold what-if number is never subtracted from the
 * review's warm one (the two regimes disagree by up to 367 cp at p99 for the
 * same position). Each verified move carries the review's own number beside
 * it where the review has one (the played move's eval after it, the best
 * move's eval before it), as a second reference, never a difference.
 *
 * Not for the final position (there is no game move to anchor on) or a
 * FEN-rooted game (the route replays from the standard start): the route
 * drops one it gets.
 */
import { z } from "zod";
import { Chess } from "chess.js";

/**
 * The server switch (read by the chat route only): `COACH_WHATIF_EVALS=1`
 * verifies and licenses a turn's clientEvals; off, the field is ignored and
 * the turn is answered byte for byte as before.
 */
export function isWhatIfEvalsEnabled(): boolean {
  const v = (process.env.COACH_WHATIF_EVALS ?? "").trim().toLowerCase();
  return v === "1" || v === "on" || v === "true";
}

/**
 * The server switch for a compare (pathway 3.5, read by the chat route
 * only): `COACH_COMPARE=1` verifies a payload with a `compared` move and
 * answers it as two moves set side by side. It acts only with the intent
 * router and COACH_WHATIF_EVALS on. Off, such a payload is dropped as
 * "shape", as before.
 */
export function isCompareEnabled(): boolean {
  const v = (process.env.COACH_COMPARE ?? "").trim().toLowerCase();
  return v === "1" || v === "on" || v === "true";
}

/** What the route did with a turn's clientEvals, echoed in its response. */
export type ClientEvalsOutcome =
  | { status: "absent" }
  | { status: "off" }
  | {
      status: "dropped";
      reason: ClientEvalsDropReason | "final_position" | "not_compare";
    }
  | { status: "verified"; index: number; depth: number; compare?: true };

/** UCI as chess.js writes it (e1g1 for castling). */
const UCI_RE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

/** The plies of a line that are licensed and told: the anchor block's own length. */
export const CLIENT_EVALS_LINE_PLIES = 8;

/** One scored move, for the roles a payload may carry. */
function moveSchemaFor<R extends string>(roles: readonly [R, ...R[]]) {
  return z.object({
    role: z.enum(roles),
    uci: z.string().regex(UCI_RE),
    cp: z.number().int().min(-8999).max(8999).optional(),
    mate: z
      .number()
      .int()
      .min(-100)
      .max(100)
      .refine((m) => m !== 0)
      .optional(),
    depth: z.number().int().min(1).max(64),
    pv: z.array(z.string().regex(UCI_RE)).min(1).max(CLIENT_EVALS_LINE_PLIES),
  });
}

/** The payload around the moves. */
function payloadSchemaFor<R extends string>(roles: readonly [R, ...R[]]) {
  return z.object({
    /** Plies before the position the moves are played from. */
    index: z.number().int().min(0).max(1024),
    /** That position, as the client replayed it. */
    fen: z.string().min(1).max(120),
    /** The depth of the search the numbers come from: at least the pathway's stable first depth. */
    depth: z.number().int().min(10).max(64),
    moves: z.array(moveSchemaFor(roles)).min(1).max(10),
  });
}

/** The wire shape, exactly as the client sends it. */
export const clientEvalsSchema = payloadSchemaFor([
  "asked",
  "played",
  "best",
] as const);

/**
 * A compare's wire shape (pathway 3.5): the what-if's, with a second move
 * the player names beside the first (`compared`). Read only under
 * COACH_COMPARE.
 */
export const compareEvalsSchema = payloadSchemaFor([
  "asked",
  "compared",
  "played",
  "best",
] as const);

/** The wire type, a compare's included. */
export type ClientEvals = z.infer<typeof compareEvalsSchema>;
export type ClientEvalsMove = ClientEvals["moves"][number];

/** A move of a verified what-if, with what the server derived from it. */
export interface VerifiedWhatIfMove {
  role: "asked" | "compared" | "played" | "best";
  uci: string;
  /** SAN derived here, never the client's. */
  san: string;
  cp?: number;
  mate?: number;
  depth: number;
  /** The line from the position, as SAN, at most CLIENT_EVALS_LINE_PLIES long; the move first. */
  lineSan: string[];
  /**
   * The review's own number for this move, from its warm sweep: the eval
   * after the played move, the eval before the move for the review's best.
   * A second reference beside the cold one, never subtracted from it.
   */
  review?: { cp?: number; mate?: number };
}

export interface VerifiedWhatIf {
  index: number;
  fenBefore: string;
  moveNumber: number;
  color: "w" | "b";
  depth: number;
  /** The asked move first, then the compared, the played and the best where present. */
  moves: VerifiedWhatIfMove[];
}

/** The second move of a verified compare, or null for a plain what-if. */
export function comparedOf(w: VerifiedWhatIf): VerifiedWhatIfMove | null {
  return w.moves.find((m) => m.role === "compared") ?? null;
}

export type ClientEvalsVerdict =
  | { ok: true; value: VerifiedWhatIf }
  | { ok: false; reason: ClientEvalsDropReason };

export type ClientEvalsDropReason =
  | "shape"
  | "roles"
  | "no_score"
  | "replay"
  | "fen"
  | "illegal_move"
  | "line_mismatch"
  | "illegal_line"
  | "played_mismatch"
  | "best_mismatch"
  | "mate_mismatch"
  | "depth";

interface ReviewLine {
  cp?: number | null;
  mate?: number | null;
  depth?: number;
  pv?: string[];
}

export interface ClientEvalsGame {
  /** The game's SAN moves from the standard start, as the route stores them. */
  playedMoves: readonly string[];
  /** The review's sweep, for the engine's best move at the position. */
  gameEval?: { positions?: Array<{ lines?: ReviewLine[] }> } | null;
}

function uciParts(uci: string): {
  from: string;
  to: string;
  promotion?: string;
} {
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.length === 5 ? uci[4] : undefined,
  };
}

function playUci(
  game: Chess,
  uci: string
): { san: string; uci: string } | null {
  try {
    const m = game.move(uciParts(uci));
    return m
      ? { san: m.san, uci: `${m.from}${m.to}${m.promotion ?? ""}` }
      : null;
  } catch {
    return null;
  }
}

/**
 * Check a `clientEvals` payload against the stored game. Never throws; a
 * payload that fails any check is dropped with the reason, and the turn is
 * answered as if it had not been sent.
 */
export function verifyClientEvals(
  raw: unknown,
  game: ClientEvalsGame,
  /**
   * `compare`: a payload may name a second move (`compared`), under
   * COACH_COMPARE. Without it a compare payload is dropped as "shape" and
   * every other outcome is what it was.
   */
  opts?: { compare?: boolean }
): ClientEvalsVerdict {
  const parsed: { success: true; data: ClientEvals } | { success: false } =
    opts?.compare
      ? compareEvalsSchema.safeParse(raw)
      : clientEvalsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "shape" };
  const payload = parsed.data;

  // One asked move, at most one played and one best, and no move twice. A
  // compare names one second move, and the game's move then plays no
  // separate part.
  const roles = payload.moves.map((m) => m.role);
  const count = (r: string) => roles.filter((x) => x === r).length;
  if (count("asked") !== 1 || count("played") > 1 || count("best") > 1)
    return { ok: false, reason: "roles" };
  if (count("compared") > 1 || (count("compared") === 1 && count("played") > 0))
    return { ok: false, reason: "roles" };
  if (payload.moves.some((m) => m.cp === undefined && m.mate === undefined))
    return { ok: false, reason: "no_score" };
  // Every number from the search the payload names: a move scored shallower
  // is not that search's.
  if (payload.moves.some((m) => m.depth < payload.depth))
    return { ok: false, reason: "depth" };

  // The position, replayed strictly from the start: the client's FEN is
  // compared with it, never used.
  const sans = game.playedMoves;
  if (payload.index > sans.length) return { ok: false, reason: "replay" };
  const board = new Chess();
  let playedUci: string | null = null;
  try {
    for (let i = 0; i < payload.index; i++) {
      if (!board.move(sans[i])) return { ok: false, reason: "replay" };
    }
    if (payload.index < sans.length) {
      const probe = new Chess(board.fen());
      const m = probe.move(sans[payload.index]);
      if (!m) return { ok: false, reason: "replay" };
      playedUci = `${m.from}${m.to}${m.promotion ?? ""}`;
    }
  } catch {
    return { ok: false, reason: "replay" };
  }
  const fenBefore = board.fen();
  if (payload.fen !== fenBefore) return { ok: false, reason: "fen" };

  // The review's own lines, where real (a depth-0 sentinel or an empty
  // score is no line): its best move here, and its numbers.
  const realLine = (i: number) => {
    const l = game.gameEval?.positions?.[i]?.lines?.[0];
    return l &&
      l.depth !== 0 &&
      (typeof l.cp === "number" || typeof l.mate === "number")
      ? l
      : undefined;
  };
  const scoreOf = (l: ReviewLine) =>
    typeof l.mate === "number" ? { mate: l.mate } : { cp: l.cp as number };
  const reviewBefore = realLine(payload.index);
  const reviewAfter = realLine(payload.index + 1);
  const reviewBestUci = reviewBefore?.pv?.[0];

  const verified: VerifiedWhatIfMove[] = [];
  const seen = new Set<string>();
  for (const m of payload.moves) {
    const g = new Chess(fenBefore);
    const first = playUci(g, m.uci);
    // chess.js plays "b5c7q" as Nc7+: a suffix the move does not have is
    // another spelling, and the same move twice would get two numbers.
    if (!first || first.uci !== m.uci)
      return { ok: false, reason: "illegal_move" };
    if (seen.has(first.uci)) return { ok: false, reason: "roles" };
    seen.add(first.uci);
    if (m.pv[0] !== m.uci) return { ok: false, reason: "line_mismatch" };
    if (m.role === "played" && first.uci !== playedUci)
      return { ok: false, reason: "played_mismatch" };
    // A best the review cannot confirm (no real line here) is not told as
    // the engine's best: it is left out, and the rest stands.
    if (m.role === "best" && !reviewBestUci) continue;
    if (m.role === "best" && first.uci !== reviewBestUci)
      return { ok: false, reason: "best_mismatch" };
    const lineSan = [first.san];
    // The side that made the line's last move.
    let lastMover = board.turn();
    for (const uci of m.pv.slice(1)) {
      const mover = g.turn();
      const next = playUci(g, uci);
      if (!next || next.uci !== uci)
        return { ok: false, reason: "illegal_line" };
      lineSan.push(next.san);
      lastMover = mover;
    }
    // A line that ends in mate is a mate for the side that gives it, in
    // White's terms: a cp score or the other sign is a wrong number. And a
    // mate score says when the mate comes (mate N: the side giving it moves
    // N times from here): a line long enough to reach it ends in it there.
    const endsInMate = lineSan[lineSan.length - 1].endsWith("#");
    if (endsInMate) {
      const sign = lastMover === "w" ? 1 : -1;
      if (m.mate === undefined || Math.sign(m.mate) !== sign)
        return { ok: false, reason: "mate_mismatch" };
    }
    if (m.mate !== undefined) {
      const n = Math.abs(m.mate);
      const plies =
        (m.mate > 0 ? "w" : "b") === board.turn() ? 2 * n - 1 : 2 * n;
      const reaches = lineSan.length >= plies;
      if (endsInMate ? lineSan.length !== plies : reaches)
        return { ok: false, reason: "mate_mismatch" };
    }
    const review =
      m.role === "played" && reviewAfter
        ? scoreOf(reviewAfter)
        : first.uci === reviewBestUci && reviewBefore
          ? scoreOf(reviewBefore)
          : undefined;
    verified.push({
      role: m.role,
      uci: first.uci,
      san: first.san,
      ...(m.mate !== undefined ? { mate: m.mate } : { cp: m.cp }),
      depth: m.depth,
      lineSan,
      ...(review ? { review } : {}),
    });
  }
  const order = { asked: 0, compared: 1, played: 2, best: 3 } as const;
  verified.sort((a, b) => order[a.role] - order[b.role]);

  return {
    ok: true,
    value: {
      index: payload.index,
      fenBefore,
      moveNumber: board.moveNumber(),
      color: board.turn(),
      depth: payload.depth,
      moves: verified,
    },
  };
}
