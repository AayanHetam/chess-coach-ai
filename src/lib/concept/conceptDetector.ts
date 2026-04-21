/**
 * Deterministic concept detector. Runs geometric/material checks over a
 * puzzle's solution line and emits (conceptId, confidence, evidence) tuples.
 *
 * Design: each detector is a pure function that returns 0+ hits. Hits with
 * confidence ≥ 0.8 are treated as authoritative by the reconciliation layer
 * in conceptClassifier.ts — the LLM tagger only fills gaps.
 *
 * This is an extension of the Chess Intelligence Layer motif logic in
 * src/app/api/enhanced-analysis/route.ts (tactical motif extraction), now
 * generalized to produce concept-taxonomy IDs rather than ad-hoc labels.
 */

import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";
import type { ConceptId } from "./conceptTaxonomy";

export interface DetectorHit {
  conceptId: ConceptId;
  confidence: number;
  evidence: string;
}

export interface DetectorInput {
  /** FEN of the critical position — i.e. side-to-move is the solver. */
  fen: string;
  /**
   * UCI solution starting with the solver's first move at index 0.
   * The continuation (index 1+) is used for the quiet-move heuristic.
   *
   * NOTE: For Lichess puzzle inputs, the stored `moves` string starts with
   * the opponent's setup move. Callers must advance the FEN by that setup
   * move and pass only the solver-onward moves here. The batch classifier
   * (scripts/concept-pipeline/01-classify.ts) handles that split.
   */
  solutionUci: string[];
}

const PIECE_VALUE: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 1000,
};

/** Run all deterministic detectors, return deduped hits (keeps max confidence per concept). */
export function detectConcepts(input: DetectorInput): DetectorHit[] {
  if (!input.solutionUci?.length) return [];

  const solverUci = input.solutionUci[0];
  if (!solverUci) return [];

  // Play the solver's move to get the post-move position
  const chessPost = new Chess(input.fen);
  const solverMove = chessPost.move(toMoveObject(solverUci));
  if (!solverMove) return [];

  const pre = new Chess(input.fen);
  const post = chessPost;

  const hits: DetectorHit[] = [];

  // Mate-family detectors (run first — if the solver move mates, classification
  // is dominated by the mate pattern)
  if (post.isCheckmate()) {
    hits.push(...detectMatePatterns(pre, post, solverMove));
  }

  // Check-family
  if (post.inCheck()) {
    hits.push(...detectCheckFamily(pre, post, solverMove));
  }

  // Captures-and-material-family
  hits.push(...detectForks(pre, post, solverMove));
  hits.push(...detectPinsAndSkewers(pre, post, solverMove));
  hits.push(...detectDiscovered(pre, post, solverMove));

  // Promotion tactics
  if (solverMove.promotion && solverMove.promotion !== "q") {
    hits.push({
      conceptId: "underpromotion-tactic",
      confidence: 0.95,
      evidence: `Solution promotes to ${solverMove.promotion.toUpperCase()} instead of queen`,
    });
  }

  // Quiet-move heuristic: solver move is not a capture, not a check, not a
  // promotion, yet it's the puzzle's answer → likely a threatening quiet move.
  // Low confidence; LLM should confirm.
  const isQuiet =
    !solverMove.captured &&
    !post.inCheck() &&
    !solverMove.promotion &&
    input.solutionUci.length >= 2;
  if (isQuiet) {
    hits.push({
      conceptId: "quiet-move",
      confidence: 0.55,
      evidence: `Solver plays ${solverMove.san} — no capture, no check, no promotion`,
    });
  }

  return mergeHits(hits);
}

// ── Detectors ─────────────────────────────────────────────────────────────

function detectMatePatterns(
  _pre: Chess,
  post: Chess,
  solverMove: any
): DetectorHit[] {
  const hits: DetectorHit[] = [];

  const mated: Color = post.turn(); // side to move is the one mated
  const kingSq = findKing(post, mated);
  if (!kingSq) return hits;

  const attackers = post.attackers(kingSq, opposite(mated));
  const checkingPieceSq = attackers[0];
  const checker = checkingPieceSq ? post.get(checkingPieceSq) : null;

  // Back-rank mate: king on home rank, checker is R or Q on same rank,
  // escape squares along neighboring rank all blocked by own pawns
  const kingRank = kingSq[1];
  const homeRank = mated === "w" ? "1" : "8";
  const secondRank = mated === "w" ? "2" : "7";
  if (kingRank === homeRank && checker && (checker.type === "r" || checker.type === "q")) {
    const checkerRank = checkingPieceSq![1];
    if (checkerRank === homeRank) {
      const escapes = neighborSquares(kingSq, secondRank);
      const allBlockedByOwnPawns = escapes.length > 0 && escapes.every((sq) => {
        const p = post.get(sq);
        return p && p.color === mated && p.type === "p";
      });
      if (allBlockedByOwnPawns) {
        hits.push({
          conceptId: "back-rank-mate",
          confidence: 0.95,
          evidence: `King on ${kingSq} mated by ${checker.type.toUpperCase()} on ${checkingPieceSq}; own pawns block 2nd-rank escape`,
        });
      }
    }
  }

  // Smothered mate: knight check, mated king's every neighbor is occupied by
  // own piece (no enemy attackers on empty adjacent squares — there are none)
  if (checker && checker.type === "n") {
    const adj = allNeighbors(kingSq);
    const allOwnBlocked = adj.every((sq) => {
      const p = post.get(sq);
      return p && p.color === mated;
    });
    if (allOwnBlocked) {
      hits.push({
        conceptId: "smothered-mate",
        confidence: 0.95,
        evidence: `Knight mate on ${checkingPieceSq}, king on ${kingSq} surrounded by own pieces`,
      });
    }
  }

  // Arabian mate: rook + knight mate, king in corner, rook on adjacent edge square
  if (checker && (checker.type === "r" || checker.type === "n")) {
    const isCorner = ["a1", "a8", "h1", "h8"].includes(kingSq);
    if (isCorner) {
      // Check that both R and N of checker side are present near the king
      const rookSq = findPiece(post, opposite(mated), "r");
      const knightSq = findPiece(post, opposite(mated), "n");
      if (rookSq && knightSq) {
        const rookAdjacent = isAdjacent(rookSq, kingSq) || sharesFileOrRank(rookSq, kingSq);
        if (rookAdjacent) {
          hits.push({
            conceptId: "arabian-mate",
            confidence: 0.75,
            evidence: `King cornered on ${kingSq}, R+N coordination delivers mate`,
          });
        }
      }
    }
  }

  // Fall-through: generic kingside attack mate if mate occurred with king on
  // its original side and multiple attackers in that area
  if (hits.length === 0) {
    const attackerCount = countAttackersNearKing(post, kingSq, opposite(mated));
    if (attackerCount >= 2) {
      hits.push({
        conceptId: "kingside-attack-mate",
        confidence: 0.65,
        evidence: `Mate with ${attackerCount} pieces coordinating near king ${kingSq}`,
      });
    }
  }

  return hits;
}

function detectCheckFamily(
  pre: Chess,
  post: Chess,
  solverMove: any
): DetectorHit[] {
  const hits: DetectorHit[] = [];
  const mated: Color = post.turn();
  const kingSq = findKing(post, mated);
  if (!kingSq) return hits;

  const attackers = post.attackers(kingSq, opposite(mated));

  // Double check: two distinct attackers of the king
  if (attackers.length >= 2) {
    hits.push({
      conceptId: "double-check",
      confidence: 0.98,
      evidence: `King ${kingSq} attacked by ${attackers.join(", ")}`,
    });
    // Double check is always a discovered check
    hits.push({
      conceptId: "discovered-check",
      confidence: 0.9,
      evidence: `Double check includes a discovered check component`,
    });
    return hits;
  }

  // Single-attacker check — test if it is discovered
  if (attackers.length === 1) {
    const attackerSq = attackers[0];
    // Discovered if the piece delivering check is NOT the piece that moved
    if (attackerSq !== solverMove.to) {
      hits.push({
        conceptId: "discovered-check",
        confidence: 0.9,
        evidence: `Piece on ${attackerSq} gives check after ${solverMove.san} moved`,
      });
    }
  }

  return hits;
}

function detectForks(
  _pre: Chess,
  post: Chess,
  solverMove: any
): DetectorHit[] {
  const hits: DetectorHit[] = [];
  const moverColor: Color = opposite(post.turn());
  const moverPiece = post.get(solverMove.to);
  if (!moverPiece) return hits;

  // Enumerate squares the moved piece now attacks that contain enemy pieces
  const attackedEnemies: Array<{ sq: Square; type: PieceSymbol }> = [];
  for (const sq of ALL_SQUARES) {
    const target = post.get(sq);
    if (!target || target.color === moverColor) continue;
    const attackers = post.attackers(sq, moverColor);
    if (attackers.includes(solverMove.to)) {
      attackedEnemies.push({ sq, type: target.type });
    }
  }

  // Filter to "valuable" targets: the moved piece's value should be < target's,
  // or target is king, else it's just a capture threat not a fork-for-material
  const moverValue = PIECE_VALUE[moverPiece.type];
  const valuable = attackedEnemies.filter(
    (x) => x.type === "k" || PIECE_VALUE[x.type] >= moverValue
  );

  if (valuable.length >= 2) {
    const hasKing = valuable.some((x) => x.type === "k");
    const hasQueen = valuable.some((x) => x.type === "q");
    const evidence = `${moverPiece.type.toUpperCase()} on ${solverMove.to} attacks ${valuable.map((x) => x.type.toUpperCase() + "@" + x.sq).join(", ")}`;

    if (hasKing && hasQueen) {
      hits.push({ conceptId: "royal-fork", confidence: 0.95, evidence });
    }

    if (moverPiece.type === "n") {
      hits.push({ conceptId: "knight-fork", confidence: 0.92, evidence });
    } else if (moverPiece.type === "p") {
      hits.push({ conceptId: "pawn-fork", confidence: 0.92, evidence });
    } else if (moverPiece.type === "q") {
      hits.push({ conceptId: "queen-fork", confidence: 0.85, evidence });
    }

    hits.push({ conceptId: "double-attack", confidence: 0.8, evidence });
  }

  return hits;
}

function detectPinsAndSkewers(
  _pre: Chess,
  post: Chess,
  solverMove: any
): DetectorHit[] {
  const hits: DetectorHit[] = [];
  const moverColor: Color = opposite(post.turn());
  const moverPiece = post.get(solverMove.to);
  if (!moverPiece || !["b", "r", "q"].includes(moverPiece.type)) return hits;

  const directions = rayDirections(moverPiece.type);
  for (const dir of directions) {
    const line = raySquares(solverMove.to as Square, dir);
    // Walk the ray; collect first two enemy pieces on the line
    const enemies: Array<{ sq: Square; type: PieceSymbol }> = [];
    for (const sq of line) {
      const p = post.get(sq);
      if (!p) continue;
      if (p.color === moverColor) break; // own piece blocks further pin
      enemies.push({ sq, type: p.type });
      if (enemies.length === 2) break;
    }
    if (enemies.length !== 2) continue;

    const [front, back] = enemies;
    const frontVal = PIECE_VALUE[front.type];
    const backVal = PIECE_VALUE[back.type];
    const frontIsKing = front.type === "k";
    const backIsKing = back.type === "k";

    if (backIsKing) {
      hits.push({
        conceptId: "absolute-pin",
        confidence: 0.9,
        evidence: `${moverPiece.type.toUpperCase()} on ${solverMove.to} pins ${front.type.toUpperCase()}@${front.sq} to king@${back.sq}`,
      });
    } else if (!frontIsKing && backVal > frontVal) {
      hits.push({
        conceptId: "relative-pin",
        confidence: 0.8,
        evidence: `${front.type.toUpperCase()}@${front.sq} pinned to ${back.type.toUpperCase()}@${back.sq}`,
      });
    } else if (frontIsKing || frontVal > backVal) {
      hits.push({
        conceptId: "skewer",
        confidence: 0.8,
        evidence: `Attack on ${front.type.toUpperCase()}@${front.sq} skewers ${back.type.toUpperCase()}@${back.sq}`,
      });
    }
  }
  return hits;
}

function detectDiscovered(
  pre: Chess,
  post: Chess,
  solverMove: any
): DetectorHit[] {
  // A discovered attack exists if a friendly slider behind the solver's from-square
  // now attacks an enemy piece that it did not attack before.
  const hits: DetectorHit[] = [];
  const moverColor: Color = opposite(post.turn());

  const preAttacksByMover = enemySquaresAttackedByColor(pre, moverColor);
  const postAttacksByMover = enemySquaresAttackedByColor(post, moverColor);

  // New attacks not coming from the solver's destination square
  const newAttacks = Array.from(postAttacksByMover).filter(
    (sq) => !preAttacksByMover.has(sq)
  );
  const newAttacksNotFromMover = newAttacks.filter((sq) => {
    const attackers = post.attackers(sq, moverColor);
    return !attackers.includes(solverMove.to) && attackers.length > 0;
  });

  if (newAttacksNotFromMover.length > 0) {
    // Exclude the check-family (already tagged by detectCheckFamily)
    const kingSq = findKing(post, post.turn());
    const nonCheckTargets = newAttacksNotFromMover.filter((sq) => sq !== kingSq);
    if (nonCheckTargets.length > 0) {
      hits.push({
        conceptId: "discovered-attack",
        confidence: 0.8,
        evidence: `Move ${solverMove.san} discovers attack on ${nonCheckTargets.join(", ")}`,
      });
    }
  }

  return hits;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const ALL_SQUARES: Square[] = (() => {
  const files = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
  const out: Square[] = [];
  for (const f of files) for (let r = 1; r <= 8; r++) out.push((f + r) as Square);
  return out;
})();

function opposite(c: Color): Color {
  return c === "w" ? "b" : "w";
}

function findKing(chess: Chess, color: Color): Square | null {
  for (const sq of ALL_SQUARES) {
    const p = chess.get(sq);
    if (p && p.type === "k" && p.color === color) return sq;
  }
  return null;
}

function findPiece(chess: Chess, color: Color, type: PieceSymbol): Square | null {
  for (const sq of ALL_SQUARES) {
    const p = chess.get(sq);
    if (p && p.type === type && p.color === color) return sq;
  }
  return null;
}

function neighborSquares(sq: Square, rankChar: string): Square[] {
  const file = sq[0];
  const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const fi = files.indexOf(file);
  const out: Square[] = [];
  for (const df of [-1, 0, 1]) {
    const nf = files[fi + df];
    if (!nf) continue;
    out.push((nf + rankChar) as Square);
  }
  return out;
}

function allNeighbors(sq: Square): Square[] {
  const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const file = sq[0];
  const rank = parseInt(sq[1], 10);
  const fi = files.indexOf(file);
  const out: Square[] = [];
  for (const df of [-1, 0, 1]) {
    for (const dr of [-1, 0, 1]) {
      if (df === 0 && dr === 0) continue;
      const nf = files[fi + df];
      const nr = rank + dr;
      if (!nf || nr < 1 || nr > 8) continue;
      out.push((nf + nr) as Square);
    }
  }
  return out;
}

function isAdjacent(a: Square, b: Square): boolean {
  const files = "abcdefgh";
  const dx = Math.abs(files.indexOf(a[0]) - files.indexOf(b[0]));
  const dy = Math.abs(parseInt(a[1], 10) - parseInt(b[1], 10));
  return Math.max(dx, dy) === 1;
}

function sharesFileOrRank(a: Square, b: Square): boolean {
  return a[0] === b[0] || a[1] === b[1];
}

function countAttackersNearKing(chess: Chess, kingSq: Square, color: Color): number {
  const neighborhood = allNeighbors(kingSq);
  const seen = new Set<string>();
  for (const sq of neighborhood) {
    for (const atk of chess.attackers(sq, color)) seen.add(atk);
  }
  for (const atk of chess.attackers(kingSq, color)) seen.add(atk);
  return seen.size;
}

type Dir = [number, number];
function rayDirections(piece: PieceSymbol): Dir[] {
  if (piece === "r") return [[1, 0], [-1, 0], [0, 1], [0, -1]];
  if (piece === "b") return [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  if (piece === "q")
    return [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [1, -1], [-1, 1], [-1, -1],
    ];
  return [];
}

function raySquares(from: Square, [df, dr]: Dir): Square[] {
  const files = "abcdefgh";
  const fi = files.indexOf(from[0]);
  const ri = parseInt(from[1], 10);
  const out: Square[] = [];
  let nf = fi + df;
  let nr = ri + dr;
  while (nf >= 0 && nf < 8 && nr >= 1 && nr <= 8) {
    out.push((files[nf] + nr) as Square);
    nf += df;
    nr += dr;
  }
  return out;
}

function enemySquaresAttackedByColor(chess: Chess, color: Color): Set<Square> {
  const out = new Set<Square>();
  for (const sq of ALL_SQUARES) {
    const p = chess.get(sq);
    if (!p || p.color === color) continue;
    if (chess.attackers(sq, color).length > 0) out.add(sq);
  }
  return out;
}

function toMoveObject(uci: string) {
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.length > 4 ? uci[4] : undefined,
  };
}

function mergeHits(hits: DetectorHit[]): DetectorHit[] {
  const byConcept = new Map<ConceptId, DetectorHit>();
  for (const h of hits) {
    const existing = byConcept.get(h.conceptId);
    if (!existing || h.confidence > existing.confidence) {
      byConcept.set(h.conceptId, h);
    }
  }
  return Array.from(byConcept.values()).sort((a, b) => b.confidence - a.confidence);
}
