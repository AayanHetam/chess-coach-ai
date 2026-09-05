/**
 * Line story — what each move in an engine line DOES, as verifiable facts.
 *
 * WHY: the contract hands the verbalizer engine lines as bare SAN plus an
 * eval. Reading shipped reviews, that is exactly where the coaching goes
 * hollow: the model has a line and a number, so it explains the number
 * ("this keeps the pressure", "eyes the queenside") instead of the chess. A
 * human coach explains a line as a chain of purposes — check, forced reply,
 * fork, wins the rook. Those purposes are computable. This module computes
 * them with chess.js and the tactics detectors, ply by ply, so the model can
 * cite [F:M1.pv0.s2] for "Nc7+ forks the king and the rook" instead of
 * inventing a purpose the board does not support.
 *
 * Every fact is board arithmetic: checks (double checks named as such),
 * captures, the motifs a move creates, pieces it newly attacks or defends, a
 * mate it threatens or allows next move, whether it was the only legal move,
 * and — the half coaches always mention and engines never do — what the move
 * COSTS: pieces it leaves en prise or trapped. A running material ledger from
 * the line owner's side makes "wins a pawn" and "gives up the exchange"
 * citable, and an "offer" note marks a first move that gives material away
 * which the shown moves never win back, so the model says "a sacrifice whose
 * payoff lies beyond these moves" instead of rationalising a broken line.
 *
 * PRECISION OVER RECALL. A false fact here becomes a confident false sentence
 * to a learner. So exchange reads use legal moves, a "hanging" verdict needs a
 * full pawn of profit, a relatively pinned capturer does not count, an attack
 * is credited to the moved piece only if that piece can legally take, and the
 * reads that are distorted while the opponent stands in check are deferred to
 * the mover's next ply (2026-09-05 adversarial review, 119 positions).
 *
 * Heuristic confidence throughout (SEE, 1-ply detectors): the charter tells
 * the model to narrate these as the detector's reading, never as proof.
 */
import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";
import { detectMotifs, type AnyMotif } from "@/lib/tactics";
import { detectTrappedPieces } from "@/lib/tactics/motifs/trapped_piece";
import { attackersOf, cheapestCapture, rawAttacks, see, squareToCoord, coordToSquare } from "@/lib/tactics/utils";
import { PIECE_UNITS } from "@/lib/tactics/netMaterial";

export type StoryFact =
  | { kind: "checkmate" }
  | { kind: "stalemate" }
  | { kind: "double_check" }
  | { kind: "discovered_check" }
  | { kind: "check" }
  | { kind: "capture"; piece: PieceSymbol; square: Square; units: number }
  | { kind: "promotion"; to: PieceSymbol }
  | { kind: "castles"; side: "kingside" | "queenside" }
  | { kind: "only_move" }
  | { kind: "captures_checker" }
  | { kind: "escapes_check" }
  | { kind: "blocks_check" }
  | { kind: "motif"; motif: AnyMotif }
  | { kind: "attacks"; piece: PieceSymbol; square: Square; defended: boolean; attacker: PieceSymbol }
  | { kind: "threatens_mate"; mateSan: string }
  | { kind: "allows_mate"; mateSan: string }
  | { kind: "parries_mate" }
  | { kind: "escapes_attack"; piece: PieceSymbol; from: Square; to: Square }
  | { kind: "defends"; piece: PieceSymbol; square: Square }
  | { kind: "en_prise"; piece: PieceSymbol; square: Square; movedPiece: boolean; afterCapture: boolean }
  | { kind: "still_en_prise"; piece: PieceSymbol; square: Square }
  | { kind: "leaves_trapped"; piece: PieceSymbol; square: Square };

export interface PlyStory {
  /** 0-based index within the line — the `s<j>` of the citation id. */
  i: number;
  san: string;
  /** "18." / "18..." prefix for prose. */
  label: string;
  mover: Color;
  facts: StoryFact[];
  /** Line owner's net material after this ply, in centipawns. */
  netCp: number;
  /** One coach-readable line, e.g. "18...Qd7 — attacks the undefended bishop on b7". */
  sayable: string;
}

export interface LineStory {
  plies: PlyStory[];
  /** Owner of the line = the side that plays its first move. */
  owner: Color;
  /** Net material for the owner at the end of the shown plies (centipawns). */
  netMaterialCp: number;
  endsInMate: boolean;
  endsInStalemate: boolean;
  /** The line had more plies than were narrated or a ply failed to replay. */
  truncated: boolean;
  /**
   * The first move offers a piece (moved or not) that the shown moves never
   * win back — "not_recovered" when it was taken and nothing shown pays for
   * it, "declined_in_line" when the reply leaves it standing and capturable.
   * Real sacrifices look like this when the PV is short; broken engine lines
   * look like this always. Either way the honest sentence is the same: the
   * payoff, if any, lies beyond the shown moves.
   */
  unresolvedSacrifice: {
    piece: PieceSymbol;
    square: Square;
    units: number;
    outcome: "not_recovered" | "declined_in_line";
  } | null;
}

const PIECE_NAME: Record<PieceSymbol, string> = {
  p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king",
};
const name = (p: PieceSymbol) => PIECE_NAME[p];
const opp = (c: Color): Color => (c === "w" ? "b" : "w");
const cp = (p: PieceSymbol) => (PIECE_UNITS[p] ?? 0) * 100;
/** A piece is "en prise" only when taking it clears a full pawn — a +10cp knight-for-bishop read is a trade, not a hanging piece. */
const EN_PRISE_MIN_CP = 100;
/** Narration never runs past this many plies, however forcing the line stays. */
const HARD_CAP = 12;

export interface LineStoryOptions {
  /** Plies narrated (default 6). The story runs on past this while the line
   * stays forcing (checks and captures), up to 12, so it never stops in the
   * middle of an exchange or one ply short of a mate. */
  maxPlies?: number;
}

/** A position with `color` to move, or null when chess.js rejects the flip. */
function withTurn(fen: string, color: Color): Chess | null {
  const parts = fen.split(" ");
  if (parts[1] !== color) {
    parts[1] = color;
    parts[3] = "-";
  }
  try {
    return new Chess(parts.join(" "));
  } catch {
    return null;
  }
}

/**
 * Would moving the piece on `from` uncover a dearer friendly piece to an
 * enemy slider? Legal-move SEE respects absolute pins but is blind to
 * relative ones: a knight pinned to its queen "can" recapture, so the square
 * it guards reads as safe and the pawn it attacks reads as hanging.
 */
function exposesDearerPiece(game: Chess, from: Square, capturedValueCp: number): boolean {
  const mover = game.get(from);
  if (!mover) return false;
  const enemy = opp(mover.color);
  const [fx, fy] = squareToCoord(from);
  for (const s of attackersOf(game, from, enemy)) {
    if (!["b", "r", "q"].includes(s.piece)) continue;
    const [sx, sy] = squareToCoord(s.square);
    const dx = Math.sign(fx - sx), dy = Math.sign(fy - sy);
    // Walk on past `from` along the same ray to the first piece behind it.
    let x = fx + dx, y = fy + dy;
    while (x >= 0 && x <= 7 && y >= 0 && y <= 7) {
      const sq = coordToSquare(x, y)!;
      const p = game.get(sq);
      if (p) {
        if (p.color === mover.color && (p.type === "k" || cp(p.type) > capturedValueCp)) return true;
        break;
      }
      x += dx; y += dy;
    }
  }
  return false;
}

/** Can `by` win the piece on `sq` outright — a full pawn of profit, by a capturer that is not relatively pinned? */
function capturable(game: Chess, sq: Square, by: Color): boolean {
  const target = game.get(sq);
  if (!target || target.color === by || target.type === "k") return false;
  if (attackersOf(game, sq, by).length === 0) return false;
  if (see(game, sq, by) < EN_PRISE_MIN_CP) return false;
  const positioned = withTurn(game.fen(), by);
  if (!positioned) return false;
  const cap = cheapestCapture(positioned, sq);
  if (!cap) return false;
  return !exposesDearerPiece(positioned, cap.from, cp(target.type));
}

/** Squares of `color` pieces the enemy can win outright, by square. */
function enPriseSquares(game: Chess, color: Color): Map<Square, PieceSymbol> {
  const out = new Map<Square, PieceSymbol>();
  for (const row of game.board()) {
    for (const sq of row) {
      if (!sq || sq.color !== color || sq.type === "k") continue;
      const square = sq.square as Square;
      if (capturable(game, square, opp(color))) out.set(square, sq.type);
    }
  }
  return out;
}

/** Can the piece on `from` LEGALLY capture on `target` (pins and checks respected)? */
function canLegallyCapture(fen: string, from: Square, target: Square): boolean {
  const piece = new Chess(fen).get(from);
  if (!piece) return false;
  const g = withTurn(fen, piece.color);
  if (!g) return false;
  try {
    const lastRank = piece.color === "w" ? "8" : "1";
    const mv = g.move({ from, to: target, promotion: piece.type === "p" && target[1] === lastRank ? ("q" as never) : undefined });
    return !!mv;
  } catch {
    return false;
  }
}

/** Does `color`, to move in `fen`, have a checkmate in one? Returns its SAN. */
function mateInOne(fen: string, color: Color): string | null {
  const g = withTurn(fen, color);
  if (!g) return null;
  return g.moves().find((san) => san.endsWith("#")) ?? null;
}

/** The trapped-piece detector reads the victim side's legal moves, so the victim must be on move. */
function trappedPiecesOf(fen: string, victim: Color): Array<{ square: Square; piece: PieceSymbol }> {
  const g = withTurn(fen, victim);
  if (!g) return [];
  try {
    return detectTrappedPieces(g, opp(victim)).map((t) => ({ square: t.square, piece: t.piece }));
  } catch {
    return [];
  }
}

function kingSquare(game: Chess, color: Color): Square | null {
  for (const row of game.board()) for (const sq of row) if (sq && sq.type === "k" && sq.color === color) return sq.square as Square;
  return null;
}

function motifSayable(m: AnyMotif): string | null {
  switch (m.motif) {
    case "fork": {
      const targets = m.targets.map((t) => `the ${name(t.piece)} on ${t.square}`).join(" and ");
      return m.confirmed ? `forks ${targets}` : `forks ${targets}, though the forking piece can be taken`;
    }
    case "pin":
      return `pins the ${name(m.pinned.piece)} on ${m.pinned.square} to the ${name(m.behind.piece)} on ${m.behind.square}`;
    case "skewer":
      return `skewers the ${name(m.front.piece)} on ${m.front.square}, with the ${name(m.back.piece)} on ${m.back.square} behind it`;
    case "discovered_attack":
      return `uncovers the ${name(m.revealer.piece)} on ${m.revealer.square} against the ${name(m.victim.piece)} on ${m.victim.square}`;
    case "removed_defender":
      return `removes the ${name(m.removed.piece)} on ${m.removed.square}, which was defending the ${name(m.was_defending.piece)} on ${m.was_defending.square}`;
    case "trapped_piece":
      return `traps the ${name(m.piece)} on ${m.square}`;
    case "back_rank_threat":
      return "threatens a back-rank mate";
    case "back_rank_mate":
    case "hanging_piece":
      return null;
  }
}

function factSayable(f: StoryFact): string | null {
  switch (f.kind) {
    case "checkmate": return "checkmate";
    case "stalemate": return "stalemate — the game is drawn";
    case "double_check": return "double check";
    case "discovered_check": return "discovered check";
    case "check": return "gives check";
    case "capture": return `takes the ${name(f.piece)} on ${f.square}`;
    case "promotion": return `promotes to a ${name(f.to)}`;
    case "castles": return `castles ${f.side}`;
    case "only_move": return "the only legal move";
    case "captures_checker": return "captures the checking piece";
    case "escapes_check": return "the king steps out of check";
    case "blocks_check": return "blocks the check";
    case "motif": return motifSayable(f.motif);
    case "attacks":
      if (cp(f.piece) > cp(f.attacker)) return `attacks the ${name(f.piece)} on ${f.square}`;
      return f.defended
        ? `attacks the ${name(f.piece)} on ${f.square}, which is not adequately defended`
        : `attacks the undefended ${name(f.piece)} on ${f.square}`;
    case "threatens_mate": return `threatens mate next move (${f.mateSan})`;
    case "allows_mate": return `allows mate next move (${f.mateSan})`;
    case "parries_mate": return "parries the mate threat";
    case "escapes_attack": return `moves the ${name(f.piece)} to safety`;
    case "defends": return `defends the ${name(f.piece)} on ${f.square}`;
    case "en_prise":
      if (f.movedPiece) return f.afterCapture ? `the ${name(f.piece)} on ${f.square} can be recaptured` : `the ${name(f.piece)} on ${f.square} can now be taken`;
      return `leaves the ${name(f.piece)} on ${f.square} en prise`;
    case "still_en_prise": return `leaves the ${name(f.piece)} on ${f.square} hanging`;
    case "leaves_trapped": return `the ${name(f.piece)} on ${f.square} is now trapped`;
  }
}

function formatNet(netCp: number, owner: Color): string {
  const side = owner === "w" ? "White" : "Black";
  if (netCp === 0) return `material level for ${side}`;
  const units = Math.abs(netCp) / 100;
  return `${side} ${netCp > 0 ? "up" : "down"} ${units % 1 === 0 ? units : units.toFixed(1)}`;
}

/** How far to narrate: maxPlies, then on while the line stays forcing (checks/captures), up to HARD_CAP. */
function narrationLimit(san: readonly string[], maxPlies: number): number {
  const cap = Math.min(san.length, HARD_CAP);
  let limit = Math.min(cap, maxPlies);
  while (limit < cap && (/[+x#]/.test(san[limit - 1] ?? "") || /[+#]/.test(san[limit] ?? ""))) limit++;
  return limit;
}

/**
 * Build the story of `san` played from `fenStart`. Never throws: an
 * unreplayable ply ends the story (truncated: true).
 */
export function buildLineStory(fenStart: string, san: readonly string[], opts: LineStoryOptions = {}): LineStory {
  const maxPlies = opts.maxPlies ?? 6;
  const empty = (truncated: boolean): LineStory => ({
    plies: [], owner: "w", netMaterialCp: 0, endsInMate: false, endsInStalemate: false, truncated, unresolvedSacrifice: null,
  });
  let game: Chess;
  try {
    game = new Chess(fenStart);
  } catch {
    return empty(san.length > 0);
  }
  const owner: Color = game.turn();
  const limit = narrationLimit(san, maxPlies);
  const plies: PlyStory[] = [];
  let netCp = 0;
  let endsInMate = false;
  let endsInStalemate = false;
  let truncated = san.length > limit;

  // The offer the FIRST move makes (moved piece or a piece it abandons).
  let offer: { piece: PieceSymbol; square: Square; units: number } | null = null;
  let offerCapturedAt = -1;
  let offerStillEnPriseAfterReply = false;
  // Exchange reads taken while the opponent is in check are distorted, so a
  // checking move's cost is compared against the position BEFORE the check
  // at that side's next ply.
  const deferredBaseline: Partial<Record<Color, Map<Square, PieceSymbol>>> = {};
  let movesAtStart: string[] = game.moves();
  let prevPlyThreatensMate = false;

  for (let i = 0; i < limit; i++) {
    const fenBefore = game.fen();
    const mover: Color = game.turn();
    const enemy = opp(mover);
    const wasInCheck = game.inCheck();
    const onlyMove = movesAtStart.length === 1;
    const moveNumber = Number(fenBefore.split(" ")[5]) || 1;
    const label = `${moveNumber}${mover === "w" ? "." : "..."}`;

    const before = new Chess(fenBefore);
    const ownEnPriseBefore = deferredBaseline[mover] ?? enPriseSquares(before, mover);
    deferredBaseline[mover] = undefined;
    const enemyEnPriseBefore = enPriseSquares(before, enemy);
    const checkers = wasInCheck ? attackersOf(before, kingSquare(before, mover)!, enemy).map((a) => a.square) : [];

    let mv: ReturnType<Chess["move"]>;
    try {
      mv = game.move(san[i]);
    } catch {
      truncated = true;
      break;
    }
    if (!mv) {
      truncated = true;
      break;
    }
    const fenAfter = game.fen();
    const facts: StoryFact[] = [];
    const isMate = game.isCheckmate();
    const isStalemate = game.isStalemate();
    const givesCheck = game.inCheck();
    const movedSquares: Square[] = [mv.to as Square];
    if (mv.flags.includes("k")) movedSquares.push((mover === "w" ? "f1" : "f8") as Square);
    if (mv.flags.includes("q")) movedSquares.push((mover === "w" ? "d1" : "d8") as Square);
    const movesAfter: string[] = isMate || isStalemate ? [] : game.moves();
    const allowsMate = movesAfter.find((s) => s.endsWith("#")) ?? null;

    // 1. Terminal / forcing
    if (isMate) {
      facts.push({ kind: "checkmate" });
      endsInMate = true;
    } else if (isStalemate) {
      facts.push({ kind: "stalemate" });
      endsInStalemate = true;
    } else if (givesCheck) {
      const enemyKing = kingSquare(game, enemy)!;
      const checkers = attackersOf(game, enemyKing, mover);
      const movedChecks = checkers.some((c) => movedSquares.includes(c.square));
      facts.push(checkers.length >= 2 ? { kind: "double_check" } : movedChecks ? { kind: "check" } : { kind: "discovered_check" });
    }
    if (mv.captured) {
      const units = PIECE_UNITS[mv.captured as PieceSymbol] ?? 0;
      // En passant takes the pawn beside the destination, not on it.
      const capturedSquare = mv.flags.includes("e") ? (`${mv.to[0]}${mv.from[1]}` as Square) : (mv.to as Square);
      facts.push({ kind: "capture", piece: mv.captured as PieceSymbol, square: capturedSquare, units });
      netCp += mover === owner ? units * 100 : -units * 100;
    }
    if (mv.promotion) {
      facts.push({ kind: "promotion", to: mv.promotion as PieceSymbol });
      // A new queen is material too: the ledger credits what the pawn became beyond the pawn it was.
      const gained = (PIECE_UNITS[mv.promotion as PieceSymbol] ?? 0) - PIECE_UNITS.p;
      netCp += mover === owner ? gained * 100 : -gained * 100;
    }
    if (mv.flags.includes("k")) facts.push({ kind: "castles", side: "kingside" });
    if (mv.flags.includes("q")) facts.push({ kind: "castles", side: "queenside" });
    if (wasInCheck) {
      if (mv.captured && checkers.includes(mv.to as Square)) facts.push({ kind: "captures_checker" });
      else if (mv.piece === "k") facts.push({ kind: "escapes_check" });
      else facts.push({ kind: "blocks_check" });
    }
    if (onlyMove) facts.push({ kind: "only_move" });

    const terminal = isMate || isStalemate;
    // The moved piece hanging for free means its "threats" never happen.
    const movedHangsForFree =
      !terminal && !givesCheck && capturable(game, mv.to as Square, enemy) && see(game, mv.to as Square, enemy) >= cp(mv.piece as PieceSymbol) - 50;

    // 2. What the move does TO the opponent
    if (!terminal) {
      let motifs: AnyMotif[] = [];
      try {
        motifs = detectMotifs(fenBefore, san[i]);
      } catch {
        motifs = [];
      }
      const explainedSquares = new Set<string>();
      for (const m of motifs) {
        if (m.motif === "hanging_piece" || m.motif === "back_rank_mate") continue;
        if (m.motif === "fork") {
          // An unconfirmed fork whose only flaw is that the forker can be taken is still the point of the move.
          if (!m.confirmed && m.refutation?.refuted_by !== "recapture") continue;
        } else if (!m.confirmed) continue;
        if (m.motif === "pin" && m.createdByMove === false) continue;
        if (m.motif === "discovered_attack") {
          // A revealed attack whose victim simply takes the revealer first is the victim's tactic, not ours.
          if (capturable(game, m.revealer.square, enemy)) continue;
          // A revealed attack on the king is narrated as "discovered check" / "double check" above.
          if (m.victim.piece === "k") continue;
        }
        if (m.motif === "skewer") {
          // No skewer unless the back piece can actually be won once the front piece moves.
          const backDefended = attackersOf(game, m.back.square, enemy).length > 0;
          if (backDefended && cp(m.back.piece) <= cp(m.skewerer.piece)) continue;
        }
        if (m.motif === "removed_defender" && m.material_or_mate_gain !== "mate" && cp(m.was_defending.piece) < 300) continue;
        if (m.motif === "back_rank_threat" && (givesCheck || allowsMate)) continue;
        if (movedHangsForFree && (m.motif === "fork" || m.motif === "skewer") && m.confirmed) continue;
        facts.push({ kind: "motif", motif: m });
        if (m.motif === "fork") m.targets.forEach((t) => explainedSquares.add(t.square));
        if (m.motif === "trapped_piece") explainedSquares.add(m.square);
        if (m.motif === "skewer") explainedSquares.add(m.front.square);
        if (m.motif === "discovered_attack") explainedSquares.add(m.victim.square);
        if (m.motif === "removed_defender") explainedSquares.add(m.was_defending.square);
      }
      // Newly winnable enemy pieces the moved piece itself can legally take.
      if (!givesCheck && !movedHangsForFree) {
        for (const [sq, piece] of Array.from(enPriseSquares(game, enemy))) {
          if (enemyEnPriseBefore.has(sq) || explainedSquares.has(sq)) continue;
          const attacker = movedSquares.find((ms) => rawAttacks(game, ms).includes(sq) && canLegallyCapture(fenAfter, ms, sq));
          if (!attacker) continue;
          facts.push({ kind: "attacks", piece, square: sq, defended: attackersOf(game, sq, enemy).length > 0, attacker: game.get(attacker)!.type });
        }
      }
      if (allowsMate) {
        facts.push({ kind: "allows_mate", mateSan: allowsMate });
      } else if (!givesCheck) {
        const mateSan = mateInOne(fenAfter, mover);
        if (mateSan) facts.push({ kind: "threatens_mate", mateSan });
      }
      if (prevPlyThreatensMate && !allowsMate) facts.push({ kind: "parries_mate" });
    }
    const threatensMateNow = facts.some((f) => f.kind === "threatens_mate");

    // 3. What the move fixes for the mover, and 4. what it costs
    if (!terminal) {
      const ownEnPriseAfter = enPriseSquares(game, mover);
      if (!givesCheck && !wasInCheck && ownEnPriseBefore.has(mv.from as Square) && !ownEnPriseAfter.has(mv.to as Square)) {
        // Taking the attacker is a capture, not an escape.
        const capturedAnAttacker = !!mv.captured && attackersOf(before, mv.from as Square, enemy).some((a) => a.square === (mv.to as Square));
        if (!capturedAnAttacker) facts.push({ kind: "escapes_attack", piece: mv.piece as PieceSymbol, from: mv.from as Square, to: mv.to as Square });
      }
      if (!givesCheck) {
        ownEnPriseBefore.forEach((piece, square) => {
          if (square === (mv.from as Square) || ownEnPriseAfter.has(square)) return;
          // "Defends" means the piece is still attacked and now held — not that its attacker was captured.
          if (attackersOf(game, square, enemy).length === 0) return;
          const defender = movedSquares.find((ms) => rawAttacks(game, ms).includes(square));
          if (!defender) return;
          // A relatively pinned defender (recapturing would uncover a dearer piece) holds nothing.
          if (exposesDearerPiece(game, defender, cp(piece))) return;
          facts.push({ kind: "defends", piece, square });
        });
      }
      const costsApply = !onlyMove;
      const newlyEnPrise: Array<{ piece: PieceSymbol; square: Square; movedPiece: boolean }> = [];
      ownEnPriseAfter.forEach((piece, square) => {
        const movedPiece = movedSquares.includes(square);
        if (!movedPiece && (givesCheck || threatensMateNow)) return; // the opponent has no time; re-read next ply
        if (!movedPiece && ownEnPriseBefore.has(square)) {
          if (costsApply && !wasInCheck && cp(piece) >= 300 && !allowsMate) facts.push({ kind: "still_en_prise", piece, square });
          return;
        }
        if (movedPiece && mv.captured && (PIECE_UNITS[mv.captured as PieceSymbol] ?? 0) * 100 >= cp(piece)) return; // a trade, not a hanging piece
        if (costsApply) facts.push({ kind: "en_prise", piece, square, movedPiece, afterCapture: !!mv.captured });
        newlyEnPrise.push({ piece, square, movedPiece });
      });
      if (givesCheck) deferredBaseline[mover] = ownEnPriseBefore;
      if (i === 0) {
        // The offer: the dearest piece (>= a minor) the first move newly leaves capturable,
        // excluding a piece that was already lost before the move (a desperado is not a sacrifice).
        const candidates = newlyEnPrise
          .filter((c) => cp(c.piece) >= 300 && !(c.movedPiece && ownEnPriseBefore.has(mv.from as Square)))
          .sort((a, b) => cp(b.piece) - cp(a.piece));
        if (candidates[0]) offer = { piece: candidates[0].piece, square: candidates[0].square, units: PIECE_UNITS[candidates[0].piece] ?? 0 };
      }
      if (!givesCheck && !wasInCheck && costsApply) {
        const trappedBefore = new Set(trappedPiecesOf(fenBefore, mover).map((t) => t.square));
        for (const t of trappedPiecesOf(fenAfter, mover)) {
          if (trappedBefore.has(t.square) && !movedSquares.includes(t.square)) continue;
          facts.push({ kind: "leaves_trapped", piece: t.piece, square: t.square });
        }
      }
    }

    if (offer && mover !== owner && mv.captured && (mv.to as Square) === offer.square && offerCapturedAt === -1) offerCapturedAt = i;
    if (offer && i === 1) {
      const still = game.get(offer.square);
      offerStillEnPriseAfterReply = !!still && still.color === owner && enPriseSquares(game, owner).has(offer.square);
    }

    const parts = facts.map(factSayable).filter((s): s is string => s !== null);
    const sayable = `${label}${mv.san}${parts.length ? ` — ${parts.join("; ")}` : ""}`;
    plies.push({ i, san: mv.san, label, mover, facts, netCp, sayable });
    movesAtStart = movesAfter;
    prevPlyThreatensMate = threatensMateNow;
    if (isMate || isStalemate) {
      truncated = san.length > i + 1 ? false : truncated;
      break;
    }
  }

  let unresolvedSacrifice: LineStory["unresolvedSacrifice"] = null;
  if (offer && !endsInMate && !endsInStalemate) {
    const paidFor = (fromPly: number) =>
      plies.some(
        (p) =>
          p.i > fromPly &&
          p.mover === owner &&
          p.facts.some(
            (f) =>
              f.kind === "threatens_mate" ||
              (f.kind === "motif" && (f.motif.motif === "fork" || f.motif.motif === "skewer" || f.motif.motif === "discovered_attack")),
          ),
      );
    if (offerCapturedAt !== -1) {
      if (netCp <= -200 && !paidFor(offerCapturedAt)) unresolvedSacrifice = { ...offer, outcome: "not_recovered" };
    } else if (plies.length >= 2 && offerStillEnPriseAfterReply && !plies[1].facts.some((f) => f.kind === "capture")) {
      // A reply that took something else did not decline the offer; the
      // ledger and the "still hanging" facts already tell that story.
      unresolvedSacrifice = { ...offer, outcome: "declined_in_line" };
    }
  }

  return { plies, owner, netMaterialCp: netCp, endsInMate, endsInStalemate, truncated, unresolvedSacrifice };
}

/**
 * Compact projection for the verbalizer prompt: one string per ply, then the
 * material ledger, then (when it applies) the offer note — all inside the
 * existing `story` key, so the wire format grows no new field names.
 */
export function projectLineStory(story: LineStory): string[] {
  const out = story.plies.map((p) => `s${p.i} ${p.sayable}`);
  const n = story.plies.length;
  const ending = story.endsInMate ? ", ending in mate" : story.endsInStalemate ? ", ending in stalemate (a draw)" : story.truncated ? " — the line continues beyond these" : "";
  out.push(`material: ${formatNet(story.netMaterialCp, story.owner)} after ${n} shown ${n === 1 ? "ply" : "plies"}${ending}`);
  if (story.unresolvedSacrifice) {
    const u = story.unresolvedSacrifice;
    out.push(
      u.outcome === "not_recovered"
        ? `offer: the first move gives up the ${name(u.piece)} on ${u.square} and the shown moves do not win it back — in an engine line call it a sacrifice whose payoff lies beyond these moves and never invent the payoff; in the game itself the material was simply lost`
        : `offer: the first move leaves the ${name(u.piece)} on ${u.square} where it can be taken, and the shown reply does not take it — do not call the ${name(u.piece)} safe or the line clean; say the engine's line assumes the capture is declined`,
    );
  }
  return out;
}
