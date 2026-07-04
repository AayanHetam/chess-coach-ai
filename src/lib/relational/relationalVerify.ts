/**
 * Deterministic relational-claim verifier (Lever 2 core, production copy).
 *
 * Given a STRUCTURED claim about a position and the position's FEN, decide
 * whether the claim holds on the actual board — using chess.js 1.4.0 only,
 * no LLM. This is the load-bearing oracle for the hallucination validator:
 * the canonical failure it must catch is "the queen can capture the bishop"
 * when the queen does not in fact attack that square.
 *
 * Conservative in BOTH directions:
 *  - never mark a TRUE relationship false (would gut good coaching), and
 *  - never mark a FALSE relationship true (would let hallucinations through).
 * When a claim cannot be verified mechanically, returns "unverifiable"
 * (the validator counts those as pass-through, not board-contradictions).
 *
 * This is the canonical source for production use. The identical copy in
 * scripts/synthetic-tester/relationalVerify.ts serves the eval harness
 * (which runs outside the src/ compilation boundary).
 */
import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";

export type RelationKind =
  | "attack"   // piece of color C attacks targetSquare
  | "capture"  // piece of color C can capture the (enemy) piece on targetSquare
  | "defense"  // a friendly piece defends the (own) piece on targetSquare
  | "presence" // a specific piece sits on a specific square
  | "line"     // a sequence of SAN moves is legal from the position
  | "pin";     // piece X (pinner) pins the piece on targetSquare to pinnedToSquare

export interface RelationalClaim {
  kind: RelationKind;
  fromSquare?: Square;
  pieceType?: PieceSymbol;
  pieceColor?: Color;
  targetSquare?: Square;
  expectedPiece?: { type: PieceSymbol; color: Color };
  line?: string[];
  precedingLine?: string[];
  /**
   * ply (1-indexed) this claim is anchored to. Used by the eval harness for
   * per-ply FEN mapping. The production validator ignores this field (task 10
   * will add fenMap support to the pipeline).
   */
  moveRefPly?: number;
  pinnedToSquare?: Square;
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

function resolvePosition(fen: string, precedingLine?: string[]): { c: Chess } | { error: string } {
  const c = safeChess(fen);
  if (!c) return { error: `invalid FEN: ${fen}` };
  if (precedingLine) {
    for (let i = 0; i < precedingLine.length; i++) {
      try {
        c.move(precedingLine[i]);
      } catch {
        return { error: `preceding move ${i + 1} "${precedingLine[i]}" is illegal` };
      }
    }
  }
  return { c };
}

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

function squareCoords(sq: Square): [number, number] {
  return [sq.charCodeAt(0) - 97, parseInt(sq[1]) - 1];
}

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

const SLIDING_PIECES = new Set<PieceSymbol>(["q", "r", "b"]);

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
    if (sq === fromSquare) continue;
    const blocker = c.get(sq);
    if (!blocker || !SLIDING_PIECES.has(blocker.type)) continue;
    if (isOnLineBetween(fromSquare, sq, targetSquare)) return sq;
  }
  return null;
}

export function verifyRelationalClaim(claim: RelationalClaim, fen: string): ClaimResult {
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
        const occupant = c.get(claim.targetSquare);
        if (!occupant) {
          return { verdict: "contradicted", reason: `${claim.targetSquare} is empty — nothing to capture` };
        }
        if (occupant.color === claim.pieceColor) {
          return {
            verdict: "contradicted",
            reason: `${claim.targetSquare} holds a friendly piece — cannot capture own piece`,
          };
        }
      }
      if (attackers.length === 0) {
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
              reason: `${claim.fromSquare} does not directly attack ${claim.targetSquare} but a battery partner on ${blocker} does`,
            };
          }
        }
        const who = claim.fromSquare
          ? `the piece on ${claim.fromSquare}`
          : claim.pieceType
            ? `any ${claim.pieceColor}${claim.pieceType}`
            : `any ${claim.pieceColor} piece`;
        return { verdict: "contradicted", reason: `${who} does not attack ${claim.targetSquare}` };
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
          reason: `${claim.targetSquare} holds an enemy piece — cannot defend it as ${claim.pieceColor}`,
        };
      }
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
      if (!claim.targetSquare || !claim.pieceColor) {
        return { verdict: "unverifiable", reason: "pin claim missing pinned square or pinner color" };
      }
      const pinned = c.get(claim.targetSquare);
      if (!pinned) {
        return { verdict: "contradicted", reason: `${claim.targetSquare} is empty — no piece to pin` };
      }
      if (pinned.color === claim.pieceColor) {
        return {
          verdict: "contradicted",
          reason: `${claim.targetSquare} holds same color as claimed pinner — cannot pin own piece`,
        };
      }
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
        return { verdict: "contradicted", reason: `${who} does not attack ${claim.targetSquare} — not a valid pin` };
      }
      if (!claim.pinnedToSquare) {
        return {
          verdict: "unverifiable",
          reason: `${claim.targetSquare} is attacked by ${claim.pieceColor} (partial pin check — pinnedToSquare not supplied)`,
        };
      }
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
          reason: `removing piece on ${claim.targetSquare} does not expose ${claim.pinnedToSquare} to ${claim.pieceColor} — not a real pin`,
        };
      }
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
      return { verdict: "unverifiable", reason: "unknown claim kind" };
  }
}

/**
 * Human-readable piece inventory for a FEN, for grounding the LLM claim extractor.
 * Example: "White to move. White: Ke1, Qd1. Black: Ke8, Bh7."
 */
export function describePosition(fen: string): string {
  const c = safeChess(fen);
  if (!c) return "(invalid position)";
  const names: Record<PieceSymbol, string> = { p: "P", n: "N", b: "B", r: "R", q: "Q", k: "K" };
  const white: string[] = [];
  const black: string[] = [];
  for (const row of c.board()) {
    for (const sq of row) {
      if (!sq) continue;
      const label = `${names[sq.type]}${sq.square}`;
      (sq.color === "w" ? white : black).push(label);
    }
  }
  const toMove = c.turn() === "w" ? "White" : "Black";
  return `${toMove} to move. White: ${white.join(", ")}. Black: ${black.join(", ")}.`;
}
