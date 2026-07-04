/**
 * Deterministic relational-claim verifier (Phase 0, Lever-2 core).
 *
 * Given a STRUCTURED claim about a position and the position's FEN, decide
 * whether the claim holds on the actual board — using chess.js 1.4.0 only,
 * no LLM. This is the load-bearing oracle for the hallucination scorer:
 * the canonical failure it must catch is "the queen can capture the bishop"
 * when the queen does not in fact attack that square.
 *
 * It must be conservative in BOTH directions:
 *  - never mark a TRUE relationship false (would gut good coaching), and
 *  - never mark a FALSE relationship true (would let hallucinations through).
 * When a claim cannot be verified mechanically, return verdict "unverifiable"
 * (the scorer counts those separately — they are NOT board-contradictions).
 *
 * Position anchoring: a claim may carry `precedingLine` — SAN moves from the
 * root FEN that establish the position the claim is actually about (e.g. a
 * variation "after Bxh7+ Kxh7 ..."). The verifier replays that line first and
 * checks the relation against the resulting board. An illegal precedingLine is
 * itself a contradiction (the coach described a line that cannot be played).
 */
import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";

export type RelationKind =
  | "attack" // piece of color C attacks targetSquare (threatens it next move, turn-independent)
  | "capture" // piece of color C can capture the (enemy) piece on targetSquare
  | "defense" // a friendly piece defends the (own) piece on targetSquare
  | "presence" // a specific piece sits on a specific square
  | "line" // a sequence of SAN moves is legal from the position
  | "pin"; // piece X (pinner, pieceColor) pins the piece on targetSquare, so that the piece on pinnedToSquare would be exposed if it moved

export interface RelationalClaim {
  kind: RelationKind;
  /** square of the acting piece, if the coach named it (e.g. "the queen on d1") */
  fromSquare?: Square;
  /** type of the acting piece, if named without a square (e.g. "the queen") */
  pieceType?: PieceSymbol;
  /** color of the acting piece — usually inferable from whose coach turn it is */
  pieceColor?: Color;
  /** the square the relationship targets (e.g. "h7"), or the occupied square for presence.
   *  For kind:"pin" this is the PINNED piece's square. */
  targetSquare?: Square;
  /** for kind:"presence" — the piece expected on targetSquare */
  expectedPiece?: { type: PieceSymbol; color: Color };
  /** for kind:"line" — SAN moves to replay from the position */
  line?: string[];
  /** SAN moves from the root FEN that establish the position this claim is about */
  precedingLine?: string[];
  /**
   * ply (1-indexed) this claim is anchored to.
   * When the scorer has a per-ply FEN map, it uses fenMap[moveRefPly] as the
   * root FEN instead of the final position. Absent = use the final FEN.
   * Allows past-position claims in a game review to be checked against the
   * right board rather than always the last position.
   */
  moveRefPly?: number;
  /**
   * for kind:"pin" — the square of the piece that would be exposed if the
   * pinned piece (on targetSquare) were to move. Typically a king or queen.
   * When absent the pin can only be partially verified (unverifiable unless
   * the target is deducible from context).
   */
  pinnedToSquare?: Square;
  /** the exact coach text this claim was extracted from (for reporting) */
  rawText: string;
}

export type Verdict = "holds" | "contradicted" | "unverifiable";

export interface ClaimResult {
  verdict: Verdict;
  reason: string;
}

function safeChess(fen: string): Chess | null {
  try {
    return new Chess(fen);
  } catch {
    return null;
  }
}

/** Replay SAN moves from the root FEN; return the working position or an error. */
function resolvePosition(fen: string, precedingLine?: string[]): { c: Chess } | { error: string } {
  const c = safeChess(fen);
  if (!c) return { error: `invalid FEN: ${fen}` };
  if (precedingLine) {
    for (let i = 0; i < precedingLine.length; i++) {
      try {
        c.move(precedingLine[i]);
      } catch {
        return { error: `preceding move ${i + 1} "${precedingLine[i]}" is illegal — the described line cannot be played` };
      }
    }
  }
  return { c };
}

/** Squares of `color` pieces that attack `square`, intersected with type/from filters. */
function attackingPieceSquares(
  c: Chess,
  square: Square,
  color: Color,
  pieceType?: PieceSymbol,
  fromSquare?: Square,
): Square[] {
  let atk: Square[];
  try {
    atk = c.attackers(square, color);
  } catch {
    return [];
  }
  if (fromSquare) atk = atk.filter((s) => s === fromSquare);
  if (pieceType) atk = atk.filter((s) => c.get(s)?.type === pieceType);
  return atk;
}

/** Square (file, rank) as 0-based integers. */
function squareCoords(sq: Square): [number, number] {
  return [sq.charCodeAt(0) - 97, parseInt(sq[1]) - 1];
}

/**
 * Returns true when `between` lies strictly between `from` and `to` on the same
 * rank, file, or diagonal — the chess-line sense of "between".
 */
function isOnLineBetween(from: Square, between: Square, to: Square): boolean {
  const [fc, fr] = squareCoords(from);
  const [bc, br] = squareCoords(between);
  const [tc, tr] = squareCoords(to);
  const dab = [bc - fc, br - fr]; // vector from → between
  const dac = [tc - fc, tr - fr]; // vector from → to
  // Collinear (cross product == 0)?
  if (dab[0] * dac[1] !== dab[1] * dac[0]) return false;
  // between is strictly between from and to: dot > 0 and |from→between|² < |from→to|²
  const dot = dab[0] * dac[0] + dab[1] * dac[1];
  if (dot <= 0) return false;
  return dab[0] * dab[0] + dab[1] * dab[1] < dac[0] * dac[0] + dac[1] * dac[1];
}

const SLIDING_PIECES = new Set<PieceSymbol>(["q", "r", "b"]);

/**
 * Battery detection: returns the square of a same-color friendly piece that
 * (a) lies on the line between `fromSquare` and `targetSquare` and
 * (b) itself attacks `targetSquare`.
 *
 * This covers the Evans-Gambit pattern: "Qb3 hits f7" when the queen is blocked
 * by its own Bc4 that DOES attack f7. The queen reinforces the battery —
 * calling this a board-contradiction would produce a false-positive. We return
 * "unverifiable" instead.
 *
 * Only applied when the claimed piece is a sliding piece (Q/R/B) and
 * `fromSquare` is known (without it we can't determine the line).
 */
function findBatteryBlocker(
  c: Chess,
  fromSquare: Square,
  targetSquare: Square,
  pieceColor: Color,
  pieceType: PieceSymbol | undefined,
): Square | null {
  if (!pieceType || !SLIDING_PIECES.has(pieceType)) return null;
  let friendlyAttackers: Square[];
  try {
    friendlyAttackers = c.attackers(targetSquare, pieceColor);
  } catch {
    return null;
  }
  for (const sq of friendlyAttackers) {
    if (sq === fromSquare) continue; // the claimed piece itself (shouldn't happen since attackers==0, but guard anyway)
    // The blocker must also be a sliding piece — a pawn or knight cannot form a battery.
    const blocker = c.get(sq);
    if (!blocker || !SLIDING_PIECES.has(blocker.type)) continue;
    if (isOnLineBetween(fromSquare, sq, targetSquare)) return sq;
  }
  return null;
}

export function verifyRelationalClaim(claim: RelationalClaim, fen: string): ClaimResult {
  // kind:"line" is special — the claim IS the legality of claim.line from the (resolved) root.
  if (claim.kind === "line") {
    if (!claim.line || claim.line.length === 0) {
      return { verdict: "unverifiable", reason: "line claim has no moves" };
    }
    const resolved = resolvePosition(fen, claim.precedingLine);
    if ("error" in resolved) return { verdict: "contradicted", reason: resolved.error };
    for (let i = 0; i < claim.line.length; i++) {
      try {
        resolved.c.move(claim.line[i]);
      } catch {
        return {
          verdict: "contradicted",
          reason: `move ${i + 1} "${claim.line[i]}" is illegal in the resulting position`,
        };
      }
    }
    return { verdict: "holds", reason: `all ${claim.line.length} moves are legal` };
  }

  const resolved = resolvePosition(fen, claim.precedingLine);
  if ("error" in resolved) return { verdict: "contradicted", reason: resolved.error };
  const c = resolved.c;

  switch (claim.kind) {
    case "presence": {
      if (!claim.targetSquare || !claim.expectedPiece) {
        return { verdict: "unverifiable", reason: "presence claim missing square or piece" };
      }
      const got = c.get(claim.targetSquare);
      if (!got) {
        return { verdict: "contradicted", reason: `${claim.targetSquare} is empty` };
      }
      if (got.type !== claim.expectedPiece.type || got.color !== claim.expectedPiece.color) {
        return {
          verdict: "contradicted",
          reason: `${claim.targetSquare} holds ${got.color}${got.type}, not ${claim.expectedPiece.color}${claim.expectedPiece.type}`,
        };
      }
      return { verdict: "holds", reason: `${claim.targetSquare} holds the claimed piece` };
    }

    case "attack":
    case "capture": {
      if (!claim.targetSquare || !claim.pieceColor) {
        return { verdict: "unverifiable", reason: "attack/capture claim missing target or color" };
      }
      const attackers = attackingPieceSquares(
        c,
        claim.targetSquare,
        claim.pieceColor,
        claim.pieceType,
        claim.fromSquare,
      );
      if (claim.kind === "capture") {
        // To capture, the target must hold an ENEMY piece.
        const occupant = c.get(claim.targetSquare);
        if (!occupant) {
          return { verdict: "contradicted", reason: `${claim.targetSquare} is empty — nothing to capture` };
        }
        if (occupant.color === claim.pieceColor) {
          return {
            verdict: "contradicted",
            reason: `${claim.targetSquare} holds a friendly ${occupant.color}${occupant.type} — cannot be captured by ${claim.pieceColor}`,
          };
        }
      }
      if (attackers.length === 0) {
        // Battery check: if a same-color friendly sliding-piece blocker sits on
        // the line between fromSquare and targetSquare AND attacks targetSquare,
        // the coach may be describing combined battery pressure — not a flat-out
        // board contradiction (e.g. "Qb3 hits f7" when Bc4 blocks but attacks f7).
        if (claim.fromSquare) {
          const blocker = findBatteryBlocker(
            c,
            claim.fromSquare,
            claim.targetSquare,
            claim.pieceColor,
            claim.pieceType,
          );
          if (blocker) {
            return {
              verdict: "unverifiable",
              reason: `${claim.fromSquare} does not directly attack ${claim.targetSquare} but a battery partner on ${blocker} does — treating as unverifiable (coach may mean battery pressure)`,
            };
          }
        }
        const who = claim.fromSquare
          ? `the piece on ${claim.fromSquare}`
          : claim.pieceType
            ? `any ${claim.pieceColor}${claim.pieceType}`
            : `any ${claim.pieceColor} piece`;
        return {
          verdict: "contradicted",
          reason: `${who} does not attack ${claim.targetSquare}`,
        };
      }
      return {
        verdict: "holds",
        reason: `${claim.pieceColor} attacks ${claim.targetSquare} from ${attackers.join(",")}`,
      };
    }

    case "defense": {
      if (!claim.targetSquare || !claim.pieceColor) {
        return { verdict: "unverifiable", reason: "defense claim missing target or color" };
      }
      const occupant = c.get(claim.targetSquare);
      if (!occupant) {
        return { verdict: "contradicted", reason: `${claim.targetSquare} is empty — nothing to defend` };
      }
      if (occupant.color !== claim.pieceColor) {
        return {
          verdict: "contradicted",
          reason: `${claim.targetSquare} holds ${occupant.color}${occupant.type}, not a ${claim.pieceColor} piece to defend`,
        };
      }
      // A defended square = a friendly piece (other than the occupant) attacks it.
      const defenders = attackingPieceSquares(
        c,
        claim.targetSquare,
        claim.pieceColor,
        claim.pieceType,
        claim.fromSquare,
      ).filter((s) => s !== claim.targetSquare);
      if (defenders.length === 0) {
        return { verdict: "contradicted", reason: `${claim.targetSquare} is undefended by ${claim.pieceColor}` };
      }
      return { verdict: "holds", reason: `${claim.targetSquare} is defended from ${defenders.join(",")}` };
    }

    case "pin": {
      // Required minimum: targetSquare (the pinned piece's square) + pieceColor (the pinner's color).
      if (!claim.targetSquare || !claim.pieceColor) {
        return { verdict: "unverifiable", reason: "pin claim missing pinned square or pinner color" };
      }
      // 1. The pinned piece must exist on targetSquare.
      const pinned = c.get(claim.targetSquare);
      if (!pinned) {
        return { verdict: "contradicted", reason: `${claim.targetSquare} is empty — no piece to pin` };
      }
      // 2. The pinned piece must be the OPPOSITE color to the pinner.
      if (pinned.color === claim.pieceColor) {
        return {
          verdict: "contradicted",
          reason: `${claim.targetSquare} holds a ${pinned.color} piece — same color as claimed pinner; cannot pin own piece`,
        };
      }
      // 3. The pinner must currently attack the pinned square.
      const pinnerAttackers = attackingPieceSquares(
        c,
        claim.targetSquare,
        claim.pieceColor,
        claim.pieceType,
        claim.fromSquare,
      );
      if (pinnerAttackers.length === 0) {
        const who = claim.fromSquare
          ? `the piece on ${claim.fromSquare}`
          : claim.pieceType
            ? `any ${claim.pieceColor}${claim.pieceType}`
            : `any ${claim.pieceColor} piece`;
        return {
          verdict: "contradicted",
          reason: `${who} does not attack ${claim.targetSquare} — not a valid pin`,
        };
      }
      // 4. If pinnedToSquare is given, verify the x-ray: after removing the pinned piece,
      //    the pinner must attack pinnedToSquare (confirming the pinned piece shields it).
      if (!claim.pinnedToSquare) {
        // Without knowing what's behind the pin, we can confirm the pinner attacks the pinned
        // square (step 3 passed), but cannot confirm the full pin structure.
        return {
          verdict: "unverifiable",
          reason: `${claim.targetSquare} is attacked by ${claim.pieceColor} (partial pin check — pinnedToSquare not supplied)`,
        };
      }
      // Temporarily remove the pinned piece and check x-ray attack on pinnedToSquare.
      const fenCopy = c.fen();
      const c2 = new Chess(fenCopy);
      c2.remove(claim.targetSquare);
      const xrayAttackers = attackingPieceSquares(
        c2,
        claim.pinnedToSquare,
        claim.pieceColor,
        claim.pieceType,
        claim.fromSquare,
      );
      if (xrayAttackers.length === 0) {
        return {
          verdict: "contradicted",
          reason: `removing the piece on ${claim.targetSquare} does not expose ${claim.pinnedToSquare} to ${claim.pieceColor} — not a real pin`,
        };
      }
      // Verify the behind piece exists (otherwise the coach hallucinated it).
      const behind = c.get(claim.pinnedToSquare);
      if (!behind) {
        return {
          verdict: "contradicted",
          reason: `${claim.pinnedToSquare} is empty — no piece behind the pin to be exposed`,
        };
      }
      return {
        verdict: "holds",
        reason: `${claim.pieceColor} pins ${claim.targetSquare} to ${claim.pinnedToSquare} via x-ray (${xrayAttackers.join(",")})`,
      };
    }

    default:
      return { verdict: "unverifiable", reason: `unknown claim kind` };
  }
}

/**
 * Human-readable piece inventory for a FEN, used to ground the LLM claim
 * extractor (so it maps "the queen" to the right square instead of guessing).
 * Example: "White to move. White: Ke1, Qd1. Black: Ke8, Bh7."
 */
export function describePosition(fen: string): string {
  const c = safeChess(fen);
  if (!c) return "(invalid position)";
  const names: Record<PieceSymbol, string> = { p: "P", n: "N", b: "B", r: "R", q: "Q", k: "K" };
  const white: string[] = [];
  const black: string[] = [];
  const board = c.board();
  for (const row of board) {
    for (const sq of row) {
      if (!sq) continue;
      const label = `${names[sq.type]}${sq.square}`;
      (sq.color === "w" ? white : black).push(label);
    }
  }
  const toMove = c.turn() === "w" ? "White" : "Black";
  return `${toMove} to move. White: ${white.join(", ")}. Black: ${black.join(", ")}.`;
}
