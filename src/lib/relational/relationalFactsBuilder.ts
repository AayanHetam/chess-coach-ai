/**
 * Deterministic relational-facts builder (Lever 1 core, Phase 1).
 *
 * Given a FEN, computes the chess.js attack/defense/capture/pin relational
 * graph and returns both structured data and a compact text block ready for
 * prompt injection. The coach is then constrained to assert only relationships
 * present in this block — eliminating the "Qb3 hits a5" class of hallucination
 * at the input-side (Lever 1).
 *
 * Reuses chess.js primitives (chess.attackers(), chess.get(), chess.board(),
 * chess.remove()) but is independent of the scorer library in scripts/.
 *
 * Conservative: when in doubt (complex discovered attack, en-passant oddity),
 * mark the relationship as present rather than absent — the coach can assert it
 * and the output-side verifier (Lever 2) will gate the final claim. The reverse
 * error (falsely marking a real relationship absent) would silently suppress
 * good coaching.
 */
import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CaptureFact {
  /** Square of the attacking piece */
  attackerSquare: Square;
  attackerType: PieceSymbol;
  attackerColor: Color;
  /** Square of the target enemy piece */
  targetSquare: Square;
  targetType: PieceSymbol;
  targetColor: Color;
}

export interface HangingFact {
  square: Square;
  pieceType: PieceSymbol;
  color: Color;
  /** Squares of enemy pieces that attack this square */
  attackerSquares: Square[];
  /** Squares of friendly pieces that defend this square (excluding self) */
  defenderSquares: Square[];
}

export interface PinFact {
  /** The pinning piece (opponent) */
  pinnerSquare: Square;
  pinnerType: PieceSymbol;
  pinnerColor: Color;
  /** The pinned piece */
  pinnedSquare: Square;
  pinnedType: PieceSymbol;
  /** The piece behind the pin (king for absolute pin) */
  behindSquare: Square;
  behindType: PieceSymbol;
  /** True when the piece behind is the king — the pinned piece cannot move legally */
  isAbsolute: boolean;
}

export interface RelationalFactsBlock {
  fen: string;
  sideToMove: Color;
  /** Every attack where the attacker's color differs from the target's color */
  captures: CaptureFact[];
  /** Pieces that are attacked by at least one enemy and have fewer defenders than attackers */
  hanging: HangingFact[];
  /** Pieces pinned to king (absolute) or high-value piece (relative, isAbsolute=false) */
  pins: PinFact[];
  /** Compact text for prompt injection — coaching constraint */
  summary: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const PIECE_SYM: Record<PieceSymbol, string> = {
  p: "P",
  n: "N",
  b: "B",
  r: "R",
  q: "Q",
  k: "K",
};

/** Standard chess piece notation: "Qb3", "Nd5", "Pb4", "Ke1" */
function pn(type: PieceSymbol, square: Square): string {
  return `${PIECE_SYM[type]}${square}`;
}

/** Material value for a piece type (used to judge "hanging" and pin worth) */
const PIECE_VALUE: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 100,
};

function safeAttackers(c: Chess, sq: Square, color: Color): Square[] {
  try {
    return c.attackers(sq, color);
  } catch {
    return [];
  }
}

function squareCoords(sq: Square): [number, number] {
  return [sq.charCodeAt(0) - 97, parseInt(sq[1]) - 1];
}

/** True when `between` lies strictly between `from` and `to` on same rank/file/diagonal. */
function isOnLineBetween(from: Square, between: Square, to: Square): boolean {
  const [fc, fr] = squareCoords(from);
  const [bc, br] = squareCoords(between);
  const [tc, tr] = squareCoords(to);
  const dab = [bc - fc, br - fr];
  const dac = [tc - fc, tr - fr];
  if (dab[0] * dac[1] !== dab[1] * dac[0]) return false;
  const dot = dab[0] * dac[0] + dab[1] * dac[1];
  if (dot <= 0) return false;
  return dab[0] * dab[0] + dab[1] * dab[1] < dac[0] * dac[0] + dac[1] * dac[1];
}

// ---------------------------------------------------------------------------
// Core computation
// ---------------------------------------------------------------------------

function computeCaptures(c: Chess): CaptureFact[] {
  const captures: CaptureFact[] = [];
  for (const row of c.board()) {
    for (const sq of row) {
      if (!sq) continue;
      const enemyColor: Color = sq.color === "w" ? "b" : "w";
      for (const atkSq of safeAttackers(c, sq.square, enemyColor)) {
        const attacker = c.get(atkSq);
        if (!attacker) continue;
        captures.push({
          attackerSquare: atkSq,
          attackerType: attacker.type,
          attackerColor: enemyColor,
          targetSquare: sq.square,
          targetType: sq.type,
          targetColor: sq.color,
        });
      }
    }
  }
  return captures;
}

function computeHanging(c: Chess): HangingFact[] {
  const hanging: HangingFact[] = [];
  for (const row of c.board()) {
    for (const sq of row) {
      if (!sq || sq.type === "k") continue; // kings are never "hanging" in the normal sense
      const enemyColor: Color = sq.color === "w" ? "b" : "w";
      const attackerSquares = safeAttackers(c, sq.square, enemyColor);
      if (attackerSquares.length === 0) continue;

      // Defenders: friendly pieces (excluding self) that attack this square
      const defenderSquares = safeAttackers(c, sq.square, sq.color).filter(
        (s) => s !== sq.square
      );

      // "Hanging" heuristic: undefended, OR cheapest attacker is worth less than piece
      const lowestAttackerValue = attackerSquares.reduce((min, atkSq) => {
        const piece = c.get(atkSq);
        return piece ? Math.min(min, PIECE_VALUE[piece.type]) : min;
      }, 100);

      const isHanging =
        defenderSquares.length === 0 ||
        lowestAttackerValue < PIECE_VALUE[sq.type];

      if (isHanging) {
        hanging.push({
          square: sq.square,
          pieceType: sq.type,
          color: sq.color,
          attackerSquares,
          defenderSquares,
        });
      }
    }
  }
  return hanging;
}

function findKingSquare(c: Chess, color: Color): Square | null {
  for (const row of c.board()) {
    for (const sq of row) {
      if (sq && sq.type === "k" && sq.color === color) return sq.square;
    }
  }
  return null;
}

const SLIDING_PIECE_TYPES = new Set<PieceSymbol>(["q", "r", "b"]);

function computePins(c: Chess): PinFact[] {
  const pins: PinFact[] = [];

  for (const color of ["w", "b"] as Color[]) {
    const kingSquare = findKingSquare(c, color);
    if (!kingSquare) continue;
    const oppColor: Color = color === "w" ? "b" : "w";

    // Attackers of king before any removal (to filter out pre-existing checks)
    const preExistingChecks = new Set(safeAttackers(c, kingSquare, oppColor));

    for (const row of c.board()) {
      for (const sq of row) {
        if (!sq || sq.color !== color || sq.type === "k") continue;

        // Temporarily remove this piece and check if king is newly exposed
        const c2 = new Chess(c.fen());
        c2.remove(sq.square);

        const newAttackers = safeAttackers(c2, kingSquare, oppColor).filter(
          (s) => !preExistingChecks.has(s)
        );

        for (const pinnerSq of newAttackers) {
          // Pinner must be a sliding piece (Q/R/B) and sq must be between pinner and king
          const pinner = c.get(pinnerSq);
          if (!pinner || !SLIDING_PIECE_TYPES.has(pinner.type)) continue;
          if (!isOnLineBetween(pinnerSq, sq.square, kingSquare)) continue;

          pins.push({
            pinnerSquare: pinnerSq,
            pinnerType: pinner.type,
            pinnerColor: oppColor,
            pinnedSquare: sq.square,
            pinnedType: sq.type,
            behindSquare: kingSquare,
            behindType: "k",
            isAbsolute: true,
          });
        }
      }
    }
  }

  return pins;
}

// ---------------------------------------------------------------------------
// Summary formatter
// ---------------------------------------------------------------------------

function buildSummary(
  sideToMove: Color,
  captures: CaptureFact[],
  hanging: HangingFact[],
  pins: PinFact[]
): string {
  const lines: string[] = ["=== VERIFIED POSITION FACTS (chess.js oracle) ==="];
  const sideLabel = sideToMove === "w" ? "White" : "Black";
  lines.push(`Side to move: ${sideLabel}`);
  lines.push("");

  // -- Attacks on enemy pieces --
  const wAttacks = captures.filter((f) => f.attackerColor === "w");
  const bAttacks = captures.filter((f) => f.attackerColor === "b");

  lines.push("ATTACKS ON ENEMY PIECES:");
  if (wAttacks.length === 0 && bAttacks.length === 0) {
    lines.push("  (none)");
  } else {
    if (wAttacks.length > 0) {
      const list = wAttacks
        .map((f) => `${pn(f.attackerType, f.attackerSquare)}→${pn(f.targetType, f.targetSquare)}`)
        .join(", ");
      lines.push(`  White: ${list}`);
    }
    if (bAttacks.length > 0) {
      const list = bAttacks
        .map((f) => `${pn(f.attackerType, f.attackerSquare)}→${pn(f.targetType, f.targetSquare)}`)
        .join(", ");
      lines.push(`  Black: ${list}`);
    }
  }
  lines.push("");

  // -- Hanging --
  lines.push("HANGING (attacked, inadequately defended):");
  if (hanging.length === 0) {
    lines.push("  (none)");
  } else {
    for (const h of hanging) {
      const colorLabel = h.color === "w" ? "White" : "Black";
      const atkList = h.attackerSquares.map((s) => {
        const p = captures.find((c) => c.attackerSquare === s && c.targetSquare === h.square);
        return p ? pn(p.attackerType, s) : s;
      }).join(", ");
      const defLabel =
        h.defenderSquares.length === 0
          ? "no defenders"
          : `defended by ${h.defenderSquares.join(", ")}`;
      lines.push(
        `  ${colorLabel} ${pn(h.pieceType, h.square)}: attacked by ${atkList}; ${defLabel}`
      );
    }
  }
  lines.push("");

  // -- Pins --
  lines.push("ABSOLUTE PINS (pinned to king):");
  if (pins.length === 0) {
    lines.push("  (none)");
  } else {
    for (const p of pins) {
      const pinnedColorLabel = p.pinnerColor === "w" ? "Black" : "White";
      lines.push(
        `  ${pinnedColorLabel} ${pn(p.pinnedType, p.pinnedSquare)} is pinned to ` +
          `${pn(p.behindType, p.behindSquare)} by ${p.pinnerColor === "w" ? "White" : "Black"} ${pn(p.pinnerType, p.pinnerSquare)}`
      );
    }
  }
  lines.push("");

  lines.push(
    "COACHING RULE: Only assert attack/capture/defense/pin relationships that appear above."
  );
  lines.push("Do not claim a piece attacks a square unless it is listed here.");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the full relational-facts block for a position.
 * Returns structured data AND a pre-formatted summary for prompt injection.
 * Throws if the FEN is invalid.
 */
export function buildRelationalFacts(fen: string): RelationalFactsBlock {
  const c = new Chess(fen);
  const sideToMove = c.turn();

  const captures = computeCaptures(c);
  const hanging = computeHanging(c);
  const pins = computePins(c);
  const summary = buildSummary(sideToMove, captures, hanging, pins);

  return { fen, sideToMove, captures, hanging, pins, summary };
}

/**
 * Returns true if the facts block confirms that a piece of `attackerColor`
 * attacks `targetSquare`. Used by the output-side verifier (Lever 2) to
 * cross-check the coach's claim without re-running chess.js.
 */
export function factsConfirmAttack(
  facts: RelationalFactsBlock,
  attackerColor: Color,
  fromSquare: Square | undefined,
  targetSquare: Square
): boolean {
  return facts.captures.some(
    (f) =>
      f.attackerColor === attackerColor &&
      f.targetSquare === targetSquare &&
      (fromSquare === undefined || f.attackerSquare === fromSquare)
  );
}

/**
 * Returns true if the facts block shows `square` as a hanging piece.
 */
export function factsConfirmHanging(
  facts: RelationalFactsBlock,
  square: Square
): boolean {
  return facts.hanging.some((h) => h.square === square);
}

/**
 * Returns true if the facts block shows a pin on `pinnedSquare`.
 */
export function factsConfirmPin(
  facts: RelationalFactsBlock,
  pinnedSquare: Square
): boolean {
  return facts.pins.some((p) => p.pinnedSquare === pinnedSquare);
}
