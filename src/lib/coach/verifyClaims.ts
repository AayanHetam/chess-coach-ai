/**
 * Replay verifier — board facts are decided by playing the claimed line on a
 * real board (chess.js), never by reading prose or trusting a model.
 *
 * WHY: every false sentence in the coach-accuracy QA was board arithmetic:
 * a material CHANGE printed as where material ENDS ("you come out 1 up" with
 * White a point down), a capture credited to the wrong piece, a "hanging"
 * knight that nothing attacks (docs/coach-accuracy-notes.md). Code owns
 * those facts, and this module is where they are decided: pure,
 * deterministic, no network, no model.
 *
 * FAIL CLOSED. Three answers and only three:
 *   verified   — the board proves it;
 *   false      — the board contradicts it (a wrong piece, an empty square,
 *                a count that does not add up);
 *   unverified — the board cannot settle it: the line does not replay, the
 *                claim points past it, or the material is mid-exchange.
 * A caller treats anything but `verified` as unproven. The verifier never
 * throws: a claim it cannot evaluate is unverified.
 *
 * Material is counted P1 N3 B3 R5 Q9. A BALANCE is where material stands in
 * a position (White minus Black); a DELTA is how much a run of plies changed
 * it. They are different types so the compiler refuses to mix them.
 */
import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";
import { attackersOf, see } from "@/lib/tactics/utils";
import { EN_PRISE_MIN_CP, capturable } from "@/lib/tactics/capturable";

// ── Material: a balance is a state, a delta is a change ─────────────────────
/** White's material minus Black's in one position, in points. */
export type MaterialBalance = number & { readonly __material: "balance" };
/** The change in White-minus-Black over a run of plies, in points. Never a balance. */
export type MaterialDelta = number & { readonly __material: "delta" };

export const PIECE_POINTS: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

function balanceOf(game: Chess): MaterialBalance {
  let sum = 0;
  for (const row of game.board()) {
    for (const sq of row)
      if (sq) sum += (sq.color === "w" ? 1 : -1) * PIECE_POINTS[sq.type];
  }
  return sum as MaterialBalance;
}

/** The balance of a position, or null when chess.js rejects the FEN. */
export function materialBalance(fen: string): MaterialBalance | null {
  try {
    return balanceOf(new Chess(fen));
  } catch {
    return null;
  }
}

export function materialDelta(
  from: MaterialBalance,
  to: MaterialBalance
): MaterialDelta {
  return (to - from) as MaterialDelta;
}

export function applyDelta(
  start: MaterialBalance,
  delta: MaterialDelta
): MaterialBalance {
  return (start + delta) as MaterialBalance;
}

/** A balance or a delta as one side sees it: positive is good for `side`. */
export function sideValue(
  value: MaterialBalance | MaterialDelta,
  side: Color
): number {
  return (side === "w" ? value : -value) + 0; // + 0 turns -0 into 0
}

// ── Replay ──────────────────────────────────────────────────────────────────
export interface ReplayedPly {
  /** 0-based index of the move within the line. */
  index: number;
  san: string;
  uci: string;
  /** "19." / "19..." */
  label: string;
  mover: Color;
  piece: PieceSymbol;
  from: Square;
  to: Square;
  /** What was taken and where (en passant takes beside `to`). */
  captured: { piece: PieceSymbol; square: Square } | null;
  promotion: PieceSymbol | null;
  givesCheck: boolean;
  isMate: boolean;
  isStalemate: boolean;
  fenBefore: string;
  fenAfter: string;
  balanceAfter: MaterialBalance;
}

export interface LineReplay {
  /** Every move of the line replayed legally from a legal start position. */
  ok: boolean;
  startFen: string;
  /** The plies that replayed, up to (not including) the first illegal one. */
  plies: ReplayedPly[];
  illegal: { index: number; move: string } | null;
  /** Null when the start position is not a legal position. */
  startBalance: MaterialBalance | null;
  /** After the last replayed ply. */
  endBalance: MaterialBalance | null;
  delta: MaterialDelta | null;
  endsInMate: boolean;
  endsInStalemate: boolean;
  /**
   * The last ply captured and the side to move can take back on that square:
   * the balance is a snapshot in the middle of an exchange, not where
   * material settles.
   */
  midCaptureSequence: { square: Square; recapturer: Color } | null;
  sideToMoveAtEnd: Color | null;
}

const UCI_RE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

function playMove(game: Chess, move: string) {
  try {
    if (UCI_RE.test(move)) {
      return game.move({
        from: move.slice(0, 2),
        to: move.slice(2, 4),
        promotion: move[4],
      });
    }
    return game.move(move);
  } catch {
    return null;
  }
}

/** The capture the side to move can make on `square` right now, if any. */
function recaptureOn(game: Chess, square: Square): boolean {
  if (game.isGameOver()) return false;
  return game
    .moves({ verbose: true })
    .some((m) => m.to === square && !!m.captured);
}

export function replayLine(
  startFen: string,
  moves: readonly string[]
): LineReplay {
  const failed: LineReplay = {
    ok: false,
    startFen,
    plies: [],
    illegal: null,
    startBalance: null,
    endBalance: null,
    delta: null,
    endsInMate: false,
    endsInStalemate: false,
    midCaptureSequence: null,
    sideToMoveAtEnd: null,
  };
  let game: Chess;
  try {
    game = new Chess(startFen);
  } catch {
    return failed;
  }
  const startBalance = balanceOf(game);
  const plies: ReplayedPly[] = [];
  let illegal: LineReplay["illegal"] = null;
  for (let i = 0; i < moves.length; i++) {
    const fenBefore = game.fen();
    const moveNumber = Number(fenBefore.split(" ")[5]) || 1;
    const mv = playMove(game, moves[i]);
    if (!mv) {
      illegal = { index: i, move: moves[i] };
      break;
    }
    const capturedSquare = mv.flags.includes("e")
      ? (`${mv.to[0]}${mv.from[1]}` as Square)
      : (mv.to as Square);
    plies.push({
      index: i,
      san: mv.san,
      uci: `${mv.from}${mv.to}${mv.promotion ?? ""}`,
      label: `${moveNumber}${mv.color === "w" ? "." : "..."}`,
      mover: mv.color,
      piece: mv.piece,
      from: mv.from as Square,
      to: mv.to as Square,
      captured: mv.captured
        ? { piece: mv.captured, square: capturedSquare }
        : null,
      promotion: mv.promotion ?? null,
      givesCheck: game.inCheck(),
      isMate: game.isCheckmate(),
      isStalemate: game.isStalemate(),
      fenBefore,
      fenAfter: game.fen(),
      balanceAfter: balanceOf(game),
    });
  }
  const last = plies.at(-1);
  const endBalance = last ? last.balanceAfter : startBalance;
  return {
    ok: illegal === null,
    startFen,
    plies,
    illegal,
    startBalance,
    endBalance,
    delta: materialDelta(startBalance, endBalance),
    endsInMate: !!last?.isMate,
    endsInStalemate: !!last?.isStalemate,
    midCaptureSequence:
      last?.captured && recaptureOn(game, last.to)
        ? { square: last.to, recapturer: game.turn() }
        : null,
    sideToMoveAtEnd: game.turn(),
  };
}

// ── Claims ──────────────────────────────────────────────────────────────────
/**
 * Plies are counted from the line's start: `atPly: 0` is the start position,
 * `atPly: n` the position after n moves (default: the end of the line).
 * `moveIndex` is a 0-based index into the line's moves.
 */
export type Claim =
  /** "the knight on g5" */
  | {
      kind: "piece_on";
      square: Square;
      piece: PieceSymbol;
      color?: Color;
      atPly?: number;
    }
  /** "10...cxb5 takes the knight (on b5)" */
  | { kind: "captures"; moveIndex: number; piece: PieceSymbol; square?: Square }
  /** "White wins a piece" (points 3, at_least) / "loses 2" (points -2, exactly), from `fromPly` to `toPly`. */
  | {
      kind: "material_change";
      side: Color;
      points: number;
      mode: "exactly" | "at_least";
      fromPly?: number;
      toPly?: number;
    }
  /** "White is a point up at the end" (margin 1); "level" for equal material. */
  | { kind: "ahead"; leader: Color | "level"; margin?: number; atPly?: number }
  | { kind: "is_mate"; moveIndex: number }
  | { kind: "gives_check"; moveIndex: number }
  /** "the knight on b5 hangs": the opponent can win it by static exchange (a full pawn of profit). */
  | { kind: "hangs"; square: Square; piece?: PieceSymbol; atPly?: number }
  /** "move N leaves the knight hanging": it hangs after that move and did not before. */
  | {
      kind: "newly_hangs";
      square: Square;
      piece?: PieceSymbol;
      moveIndex: number;
    }
  /**
   * "…and the reply takes it": the refutation line (played from the end of
   * the claimed line) captures the piece now on `square` within the
   * refuting side's first `within` moves (default 2).
   */
  | {
      kind: "refutation_takes";
      square: Square;
      piece?: PieceSymbol;
      within?: number;
    };

export type ClaimStatus = "verified" | "false" | "unverified";

export interface ClaimVerdict {
  claim: Claim;
  status: ClaimStatus;
  reason: string;
  /** What the board actually says, when there is something to say. */
  actual?: unknown;
}

export interface VerifyInput {
  startFen: string;
  line: readonly string[];
  claims: readonly Claim[];
  /** The engine's reply line from the end of `line` (for refutation_takes). */
  refutation?: readonly string[];
}

export interface VerifyResult {
  replay: LineReplay;
  verdicts: ClaimVerdict[];
}

const PIECE_NAME: Record<PieceSymbol, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};
const SIDE_NAME: Record<Color, string> = { w: "White", b: "Black" };
const opp = (c: Color): Color => (c === "w" ? "b" : "w");

const verdict = (
  claim: Claim,
  status: ClaimStatus,
  reason: string,
  actual?: unknown
): ClaimVerdict =>
  actual === undefined
    ? { claim, status, reason }
    : { claim, status, reason, actual };

/** The position after `k` plies of the replay. */
function fenAt(replay: LineReplay, k: number): string {
  return k === 0 ? replay.startFen : replay.plies[k - 1].fenAfter;
}

function balanceAt(replay: LineReplay, k: number): MaterialBalance {
  return k === 0 ? replay.startBalance! : replay.plies[k - 1].balanceAfter;
}

/** Is the position after `k` plies in the middle of an exchange? */
function midExchangeAt(replay: LineReplay, k: number): Square | null {
  if (k === 0) return null;
  const ply = replay.plies[k - 1];
  if (!ply.captured) return null;
  return recaptureOn(new Chess(ply.fenAfter), ply.to) ? ply.to : null;
}

const inRange = (n: unknown, max: number): n is number =>
  Number.isInteger(n) && (n as number) >= 0 && (n as number) <= max;

function describeSide(side: Color, value: number): string {
  if (value === 0) return `${SIDE_NAME[side]} level`;
  return `${SIDE_NAME[side]} ${Math.abs(value)} ${value > 0 ? "up" : "down"}`;
}

/** Why `square` does or does not hang for its owner, at `fen`. */
function hangingRead(
  fen: string,
  square: Square,
  piece: PieceSymbol | undefined
): { hangs: true } | { hangs: false; reason: string; actual?: unknown } {
  const game = new Chess(fen);
  const there = game.get(square);
  if (!there)
    return {
      hangs: false,
      reason: `there is no piece on ${square}`,
      actual: null,
    };
  if (piece && there.type !== piece) {
    return {
      hangs: false,
      reason: `the piece on ${square} is a ${PIECE_NAME[there.type]}`,
      actual: { piece: there.type, color: there.color },
    };
  }
  if (there.type === "k") return { hangs: false, reason: "a king cannot hang" };
  const enemy = opp(there.color);
  if (
    attackersOf(game, square, enemy).length === 0 &&
    !capturable(game, square, enemy)
  ) {
    return {
      hangs: false,
      reason: `the ${PIECE_NAME[there.type]} on ${square} is not attacked`,
    };
  }
  if (!capturable(game, square, enemy)) {
    const gain = see(game, square, enemy);
    return {
      hangs: false,
      reason: `the ${PIECE_NAME[there.type]} on ${square} is defended: taking it gains ${gain}cp by static exchange (a hanging piece needs ${EN_PRISE_MIN_CP})`,
      actual: { seeCp: gain },
    };
  }
  return { hangs: true };
}

function evaluate(
  claim: Claim,
  replay: LineReplay,
  refutation: readonly string[] | undefined
): ClaimVerdict {
  const n = replay.plies.length;
  switch (claim.kind) {
    case "piece_on": {
      const k = claim.atPly ?? n;
      if (!inRange(k, n))
        return verdict(
          claim,
          "unverified",
          `ply ${k} is past the end of the line (${n} plies)`
        );
      const there = new Chess(fenAt(replay, k)).get(claim.square);
      if (!there)
        return verdict(claim, "false", `${claim.square} is empty`, null);
      const actual = { piece: there.type, color: there.color };
      if (there.type !== claim.piece)
        return verdict(
          claim,
          "false",
          `the piece on ${claim.square} is a ${PIECE_NAME[there.type]}`,
          actual
        );
      if (claim.color && there.color !== claim.color)
        return verdict(
          claim,
          "false",
          `the ${PIECE_NAME[there.type]} on ${claim.square} is ${SIDE_NAME[there.color]}'s`,
          actual
        );
      return verdict(
        claim,
        "verified",
        `a ${SIDE_NAME[there.color]} ${PIECE_NAME[there.type]} stands on ${claim.square}`,
        actual
      );
    }
    case "captures": {
      if (!inRange(claim.moveIndex, n - 1))
        return verdict(
          claim,
          "unverified",
          `move ${claim.moveIndex} is past the end of the line`
        );
      const ply = replay.plies[claim.moveIndex];
      if (!ply.captured)
        return verdict(
          claim,
          "false",
          `${ply.label}${ply.san} captures nothing`,
          null
        );
      const actual = { piece: ply.captured.piece, square: ply.captured.square };
      if (ply.captured.piece !== claim.piece)
        return verdict(
          claim,
          "false",
          `${ply.label}${ply.san} takes a ${PIECE_NAME[ply.captured.piece]}`,
          actual
        );
      if (claim.square && claim.square !== ply.captured.square)
        return verdict(
          claim,
          "false",
          `${ply.label}${ply.san} takes on ${ply.captured.square}`,
          actual
        );
      return verdict(
        claim,
        "verified",
        `${ply.label}${ply.san} takes the ${PIECE_NAME[ply.captured.piece]} on ${ply.captured.square}`,
        actual
      );
    }
    case "material_change": {
      const from = claim.fromPly ?? 0;
      const to = claim.toPly ?? n;
      if (!inRange(from, n) || !inRange(to, n) || from > to)
        return verdict(
          claim,
          "unverified",
          `plies ${from}–${to} are not inside the line (${n} plies)`
        );
      if (!Number.isFinite(claim.points))
        return verdict(
          claim,
          "unverified",
          "the claimed amount is not a number"
        );
      const start = balanceAt(replay, from);
      const end = balanceAt(replay, to);
      const change = sideValue(materialDelta(start, end), claim.side);
      const actual = {
        change,
        startBalance: sideValue(start, claim.side),
        endBalance: sideValue(end, claim.side),
      };
      const mid = midExchangeAt(replay, to);
      if (mid)
        return verdict(
          claim,
          "unverified",
          `the line stops in the middle of an exchange (a recapture on ${mid} is available)`,
          actual
        );
      const holds =
        claim.mode === "exactly"
          ? change === claim.points
          : claim.points >= 0
            ? change >= claim.points
            : change <= claim.points;
      const said = `${SIDE_NAME[claim.side]}'s material changes by ${change >= 0 ? "+" : ""}${change} (${describeSide(claim.side, actual.startBalance)} before, ${describeSide(claim.side, actual.endBalance)} after)`;
      return verdict(claim, holds ? "verified" : "false", said, actual);
    }
    case "ahead": {
      const k = claim.atPly ?? n;
      if (!inRange(k, n))
        return verdict(
          claim,
          "unverified",
          `ply ${k} is past the end of the line (${n} plies)`
        );
      const balance = balanceAt(replay, k);
      const leader: Color | "level" =
        balance > 0 ? "w" : balance < 0 ? "b" : "level";
      const actual = {
        balance: balance + 0,
        leader,
        margin: Math.abs(balance),
      };
      const mid = midExchangeAt(replay, k);
      if (mid)
        return verdict(
          claim,
          "unverified",
          `material is mid-exchange there (a recapture on ${mid} is available)`,
          actual
        );
      const said =
        leader === "level"
          ? "material is level"
          : `${SIDE_NAME[leader]} is ${Math.abs(balance)} up`;
      if (leader !== claim.leader) return verdict(claim, "false", said, actual);
      if (
        claim.margin !== undefined &&
        claim.leader !== "level" &&
        Math.abs(balance) !== claim.margin
      ) {
        return verdict(claim, "false", said, actual);
      }
      return verdict(claim, "verified", said, actual);
    }
    case "is_mate":
    case "gives_check": {
      if (!inRange(claim.moveIndex, n - 1))
        return verdict(
          claim,
          "unverified",
          `move ${claim.moveIndex} is past the end of the line`
        );
      const ply = replay.plies[claim.moveIndex];
      const yes = claim.kind === "is_mate" ? ply.isMate : ply.givesCheck;
      const what = claim.kind === "is_mate" ? "checkmate" : "check";
      return verdict(
        claim,
        yes ? "verified" : "false",
        `${ply.label}${ply.san} is ${yes ? "" : "not "}${what}`
      );
    }
    case "hangs": {
      const k = claim.atPly ?? n;
      if (!inRange(k, n))
        return verdict(
          claim,
          "unverified",
          `ply ${k} is past the end of the line (${n} plies)`
        );
      const read = hangingRead(fenAt(replay, k), claim.square, claim.piece);
      if (read.hangs)
        return verdict(
          claim,
          "verified",
          `the piece on ${claim.square} can be won by static exchange`
        );
      return verdict(claim, "false", read.reason, read.actual);
    }
    case "newly_hangs": {
      if (!inRange(claim.moveIndex, n - 1))
        return verdict(
          claim,
          "unverified",
          `move ${claim.moveIndex} is past the end of the line`
        );
      const ply = replay.plies[claim.moveIndex];
      const after = hangingRead(ply.fenAfter, claim.square, claim.piece);
      if (!after.hangs)
        return verdict(claim, "false", after.reason, after.actual);
      // The moved piece is judged on the square it came from.
      const beforeSquare = claim.square === ply.to ? ply.from : claim.square;
      const before = hangingRead(ply.fenBefore, beforeSquare, claim.piece);
      if (before.hangs)
        return verdict(
          claim,
          "false",
          `the piece on ${claim.square} was already hanging before ${ply.label}${ply.san}`
        );
      return verdict(
        claim,
        "verified",
        `${ply.label}${ply.san} leaves the piece on ${claim.square} to be won`
      );
    }
    case "refutation_takes": {
      if (!refutation || refutation.length === 0)
        return verdict(
          claim,
          "unverified",
          "no refutation line to check against"
        );
      const endFen = fenAt(replay, n);
      const target = new Chess(endFen).get(claim.square);
      if (!target)
        return verdict(
          claim,
          "false",
          `there is no piece on ${claim.square}`,
          null
        );
      if (claim.piece && target.type !== claim.piece) {
        return verdict(
          claim,
          "false",
          `the piece on ${claim.square} is a ${PIECE_NAME[target.type]}`,
          { piece: target.type, color: target.color }
        );
      }
      const reply = replayLine(endFen, refutation);
      if (!reply.ok)
        return verdict(
          claim,
          "unverified",
          `the refutation line does not replay (${reply.illegal?.move ?? "bad position"})`
        );
      const within = claim.within ?? 2;
      const refuter = opp(target.color);
      let refuterMoves = 0;
      for (const ply of reply.plies) {
        if (ply.mover !== refuter) continue;
        if (refuterMoves >= within) break;
        refuterMoves++;
        const stillThere = new Chess(ply.fenBefore).get(claim.square);
        const same =
          !!stillThere &&
          stillThere.type === target.type &&
          stillThere.color === target.color;
        if (same && ply.captured?.square === claim.square) {
          return verdict(
            claim,
            "verified",
            `the reply ${ply.label}${ply.san} takes the ${PIECE_NAME[target.type]} on ${claim.square}`
          );
        }
      }
      return verdict(
        claim,
        "false",
        `the engine's reply (${reply.plies
          .slice(0, 3)
          .map((p) => p.san)
          .join(
            " "
          )}) does not take the ${PIECE_NAME[target.type]} on ${claim.square}`
      );
    }
    default:
      return verdict(
        claim,
        "unverified",
        `unknown claim kind "${(claim as { kind?: unknown }).kind}"`
      );
  }
}

/**
 * Verify `claims` about `line` played from `startFen`. An illegal start or an
 * illegal move anywhere in the line leaves every claim unverified: a line
 * that does not exist proves nothing.
 */
export function verifyClaims(input: VerifyInput): VerifyResult {
  const replay = replayLine(input.startFen, input.line);
  if (replay.startBalance === null) {
    return {
      replay,
      verdicts: input.claims.map((c) =>
        verdict(
          c,
          "unverified",
          "the start position is not a legal chess position"
        )
      ),
    };
  }
  if (!replay.ok) {
    const at = replay.illegal!;
    return {
      replay,
      verdicts: input.claims.map((c) =>
        verdict(
          c,
          "unverified",
          `the line does not replay: ${at.move} is not legal at move ${at.index + 1} of the line`
        )
      ),
    };
  }
  return {
    replay,
    verdicts: input.claims.map((c) => {
      try {
        return evaluate(c, replay, input.refutation);
      } catch (err) {
        return verdict(
          c,
          "unverified",
          `could not evaluate (${err instanceof Error ? err.message : "error"})`
        );
      }
    }),
  };
}
