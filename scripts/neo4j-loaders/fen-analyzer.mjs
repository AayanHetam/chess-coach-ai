#!/usr/bin/env node
/**
 * FEN Analysis Engine for Specific Theme Inference
 *
 * Analyzes puzzle FEN positions and solution moves to determine
 * specific tactical themes beyond generic Lichess labels.
 *
 * Example: Lichess says "fork" → we determine "king-rook-knight-fork on f7"
 *
 * Uses chess.js for position parsing and move validation.
 * Accuracy is everything.
 */

import { Chess } from "chess.js";

// ── Constants ────────────────────────────────────────────────────────────────

const FILES = "abcdefgh";
const RANKS = "12345678";
const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

// ── Non-tactical tags (contextual metadata, not theme hierarchy) ─────────────

const EVALUATION_TAGS = new Set(["advantage", "crushing", "equality"]);
const PHASE_TAGS = new Set(["opening", "middlegame", "endgame"]);
const LENGTH_TAGS = new Set(["oneMove", "short", "long", "veryLong"]);
const DIFFICULTY_TAGS = new Set(["master", "masterVsMaster", "superGM"]);
const META_TAGS = new Set(["playerGames", "mix"]);

export const NON_TACTICAL_TAGS = new Set([
  ...EVALUATION_TAGS, ...PHASE_TAGS, ...LENGTH_TAGS,
  ...DIFFICULTY_TAGS, ...META_TAGS,
]);

// ── Square Utilities ─────────────────────────────────────────────────────────

function sq2coord(square) {
  return { f: FILES.indexOf(square[0]), r: parseInt(square[1]) - 1 };
}

function coord2sq(f, r) {
  if (f < 0 || f > 7 || r < 0 || r > 7) return null;
  return FILES[f] + RANKS[r];
}

function uciToMove(uci) {
  return {
    from: uci.substring(0, 2),
    to: uci.substring(2, 4),
    promotion: uci.length > 4 ? uci[4] : undefined,
  };
}

// ── Attack Computation ───────────────────────────────────────────────────────

/**
 * Get all squares attacked by a specific piece on a specific square.
 * Considers blocking by other pieces for sliding pieces.
 */
function getAttackedSquares(chess, square) {
  const piece = chess.get(square);
  if (!piece) return [];

  const { f, r } = sq2coord(square);
  const attacked = [];

  const slideDir = (dirs) => {
    for (const [df, dr] of dirs) {
      for (let i = 1; i <= 7; i++) {
        const sq = coord2sq(f + df * i, r + dr * i);
        if (!sq) break;
        attacked.push(sq);
        if (chess.get(sq)) break; // blocked
      }
    }
  };

  switch (piece.type) {
    case "n": {
      for (const [df, dr] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
        const sq = coord2sq(f + df, r + dr);
        if (sq) attacked.push(sq);
      }
      break;
    }
    case "b": slideDir([[-1,-1],[-1,1],[1,-1],[1,1]]); break;
    case "r": slideDir([[-1,0],[1,0],[0,-1],[0,1]]); break;
    case "q": slideDir([[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]]); break;
    case "p": {
      const dir = piece.color === "w" ? 1 : -1;
      for (const df of [-1, 1]) {
        const sq = coord2sq(f + df, r + dir);
        if (sq) attacked.push(sq);
      }
      break;
    }
    case "k": {
      for (const [df, dr] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
        const sq = coord2sq(f + df, r + dr);
        if (sq) attacked.push(sq);
      }
      break;
    }
  }
  return attacked;
}

/**
 * Get all enemy pieces attacked by a piece on a given square.
 */
function getAttackedEnemyPieces(chess, square) {
  const piece = chess.get(square);
  if (!piece) return [];
  const enemy = piece.color === "w" ? "b" : "w";
  return getAttackedSquares(chess, square)
    .map((sq) => ({ square: sq, piece: chess.get(sq) }))
    .filter(({ piece: p }) => p && p.color === enemy);
}

function findKingSquare(chess, color) {
  const board = chess.board();
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const p = board[row][col];
      if (p && p.type === "k" && p.color === color) {
        return coord2sq(col, 7 - row);
      }
    }
  }
  return null;
}

// ── Theme Inference: Fork ────────────────────────────────────────────────────

function inferFork(chess, toSq) {
  const piece = chess.get(toSq);
  if (!piece) return ["fork"];

  const enemies = getAttackedEnemyPieces(chess, toSq);
  if (enemies.length < 2) return ["fork"];

  const themes = ["fork"];
  const targets = enemies.map((e) => e.piece.type).sort();

  switch (piece.type) {
    case "n":
      themes.push("knight-fork");
      if (targets.includes("k") && targets.includes("q"))
        themes.push("king-queen-knight-fork");
      else if (targets.includes("k") && targets.includes("r")) {
        themes.push("king-rook-knight-fork");
        if (["f7", "f2"].includes(toSq)) themes.push("f7-knight-fork");
        else if (["c7", "c2"].includes(toSq)) themes.push("c7-knight-fork");
      } else if (targets.includes("q") && targets.includes("r"))
        themes.push("queen-rook-knight-fork");
      break;
    case "b":
      themes.push("bishop-fork");
      if (targets.includes("r") && targets.includes("n"))
        themes.push("rook-knight-bishop-fork");
      break;
    case "q":
      themes.push("queen-fork");
      if (targets.includes("k") && targets.includes("r"))
        themes.push("king-rook-queen-fork");
      break;
    case "p":
      themes.push("pawn-fork");
      break;
  }
  return themes;
}

// ── Theme Inference: Pin ─────────────────────────────────────────────────────

function inferPin(chess, toSq) {
  const piece = chess.get(toSq);
  if (!piece || !["b", "r", "q"].includes(piece.type)) return ["pin"];

  const themes = ["pin"];
  const enemy = piece.color === "w" ? "b" : "w";
  const { f: pf, r: pr } = sq2coord(toSq);

  const attackedSqs = getAttackedSquares(chess, toSq);
  for (const sq of attackedSqs) {
    const target = chess.get(sq);
    if (!target || target.color !== enemy || target.type === "k") continue;

    const { f: tf, r: tr } = sq2coord(sq);
    const df = Math.sign(tf - pf);
    const dr = Math.sign(tr - pr);

    // Trace behind the target
    let cf = tf + df, cr = tr + dr;
    while (cf >= 0 && cf <= 7 && cr >= 0 && cr <= 7) {
      const behind = chess.get(coord2sq(cf, cr));
      if (behind) {
        if (behind.color === enemy) {
          if (behind.type === "k") {
            themes.push("absolute-pin");
            if (piece.type === "b") themes.push("bishop-absolute-pin");
            else if (piece.type === "r") themes.push("rook-absolute-pin");
            else themes.push("queen-absolute-pin");
          } else if (PIECE_VALUES[behind.type] > PIECE_VALUES[target.type]) {
            themes.push("relative-pin");
            if (piece.type === "b") themes.push("bishop-relative-pin");
            else if (piece.type === "r") themes.push("rook-relative-pin");
          }
        }
        break;
      }
      cf += df;
      cr += dr;
    }
  }
  return themes;
}

// ── Theme Inference: Skewer ──────────────────────────────────────────────────

function inferSkewer(chess, toSq) {
  const piece = chess.get(toSq);
  if (!piece || !["b", "r", "q"].includes(piece.type)) return ["skewer"];

  const themes = ["skewer"];
  const enemy = piece.color === "w" ? "b" : "w";
  const { f: pf, r: pr } = sq2coord(toSq);

  const attackedSqs = getAttackedSquares(chess, toSq);
  for (const sq of attackedSqs) {
    const target = chess.get(sq);
    if (!target || target.color !== enemy) continue;

    const { f: tf, r: tr } = sq2coord(sq);
    const df = Math.sign(tf - pf);
    const dr = Math.sign(tr - pr);

    let cf = tf + df, cr = tr + dr;
    while (cf >= 0 && cf <= 7 && cr >= 0 && cr <= 7) {
      const behind = chess.get(coord2sq(cf, cr));
      if (behind) {
        if (behind.color === enemy &&
            PIECE_VALUES[target.type] > PIECE_VALUES[behind.type]) {
          if (target.type === "k" && behind.type === "r") themes.push("king-rook-skewer");
          else if (target.type === "q" && behind.type === "r") themes.push("queen-rook-skewer");
        }
        break;
      }
      cf += df;
      cr += dr;
    }
  }
  return themes;
}

// ── Theme Inference: Discovered Attack ───────────────────────────────────────

function inferDiscoveredAttack(before, after, fromSq, toSq) {
  const themes = ["discovered-attack"];
  const movedPiece = before.get(fromSq);
  if (!movedPiece) return themes;

  const friendly = movedPiece.color;
  const enemy = friendly === "w" ? "b" : "w";
  const { f: ff, r: fr } = sq2coord(fromSq);

  // Check 8 directions from the vacated square
  for (const [df, dr] of [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]]) {
    // Look backwards for a friendly sliding piece
    let cf = ff - df, cr = fr - dr;
    let revealed = null;

    while (cf >= 0 && cf <= 7 && cr >= 0 && cr <= 7) {
      const p = after.get(coord2sq(cf, cr));
      if (p) {
        if (p.color === friendly) {
          const isDiag = df !== 0 && dr !== 0;
          const isStraight = df === 0 || dr === 0;
          if ((isDiag && (p.type === "b" || p.type === "q")) ||
              (isStraight && (p.type === "r" || p.type === "q"))) {
            revealed = p;
          }
        }
        break;
      }
      cf -= df;
      cr -= dr;
    }
    if (!revealed) continue;

    // Look forward for an enemy target
    cf = ff + df;
    cr = fr + dr;
    while (cf >= 0 && cf <= 7 && cr >= 0 && cr <= 7) {
      const sq = coord2sq(cf, cr);
      if (sq === toSq) break; // Moved piece blocks this line
      const p = after.get(sq);
      if (p) {
        if (p.color === enemy) {
          if (p.type === "k") themes.push("discovered-check");
          else if (p.type === "q") themes.push("discovered-attack-on-queen");
        }
        break;
      }
      cf += df;
      cr += dr;
    }
  }
  return themes;
}

// ── Theme Inference: Sacrifice ───────────────────────────────────────────────

function inferSacrifice(before, after, fromSq, toSq) {
  const themes = ["sacrifice"];
  const movedPiece = before.get(fromSq);
  if (!movedPiece) return themes;

  const captured = before.get(toSq);
  const capturedVal = captured ? PIECE_VALUES[captured.type] : 0;

  switch (movedPiece.type) {
    case "q":
      themes.push("queen-sacrifice");
      if (after.isCheckmate()) themes.push("queen-sacrifice-for-mate");
      else themes.push("queen-sacrifice-for-attack");
      break;
    case "r":
      themes.push("rook-sacrifice");
      if (captured && (captured.type === "b" || captured.type === "n"))
        themes.push("exchange-sacrifice");
      break;
    case "b":
    case "n":
      themes.push("minor-piece-sacrifice");
      break;
  }
  return themes;
}

// ── Theme Inference: Mating Patterns ─────────────────────────────────────────

function inferMatePattern(chess, toSq) {
  if (!chess.isCheckmate()) return [];

  const themes = [];
  const piece = chess.get(toSq);
  if (!piece) return themes;

  const mated = piece.color === "w" ? "b" : "w";
  const kingSq = findKingSquare(chess, mated);
  if (!kingSq) return themes;

  const { f: kf, r: kr } = sq2coord(kingSq);

  // Back rank mate
  if (kr === 0 || kr === 7) {
    const dir = mated === "w" ? 1 : -1;
    let pawns = 0;
    for (const df of [-1, 0, 1]) {
      const sq = coord2sq(kf + df, kr + dir);
      if (sq) {
        const p = chess.get(sq);
        if (p && p.color === mated && p.type === "p") pawns++;
      }
    }
    if (pawns >= 2) themes.push("back-rank", "back-rank-mate");
  }

  // Smothered mate
  if (piece.type === "n") {
    let ownPieces = 0;
    for (const [df, dr] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
      const sq = coord2sq(kf + df, kr + dr);
      if (sq) {
        const p = chess.get(sq);
        if (p && p.color === mated) ownPieces++;
      }
    }
    if (ownPieces >= 3) themes.push("smothered-mate");
  }

  // Arabian mate (knight + rook, king in corner)
  if (piece.type === "r" && (kf === 0 || kf === 7) && (kr === 0 || kr === 7)) {
    const board = chess.board();
    for (let row = 0; row < 8; row++)
      for (let col = 0; col < 8; col++) {
        const p = board[row][col];
        if (p && p.type === "n" && p.color === piece.color) themes.push("arabian-mate");
      }
  }

  // Opera mate (rook + bishop)
  if (piece.type === "r") {
    const board = chess.board();
    for (let row = 0; row < 8; row++)
      for (let col = 0; col < 8; col++) {
        const p = board[row][col];
        if (p && p.type === "b" && p.color === piece.color) {
          themes.push("opera-mate");
          break;
        }
      }
  }

  // Dovetail mate (queen mates, exactly 2 escape squares blocked by own pieces)
  if (piece.type === "q") {
    let blockedByOwn = 0;
    for (const [df, dr] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
      const sq = coord2sq(kf + df, kr + dr);
      if (sq) {
        const p = chess.get(sq);
        if (p && p.color === mated) blockedByOwn++;
      }
    }
    if (blockedByOwn === 2) themes.push("dovetail-mate");
  }

  return themes;
}

// ── Theme Inference: Trapped Piece ───────────────────────────────────────────

function inferTrappedPiece(chess, toSq) {
  const themes = ["trapped-piece"];
  const enemies = getAttackedEnemyPieces(chess, toSq);
  for (const { piece: p } of enemies) {
    switch (p.type) {
      case "q": themes.push("trapped-queen"); break;
      case "r": themes.push("trapped-rook"); break;
      case "b": themes.push("trapped-bishop"); break;
      case "n": themes.push("trapped-knight"); break;
    }
  }
  return themes;
}

// ── Fallback Generic Mapping ─────────────────────────────────────────────────

const GENERIC_MAP = {
  fork: ["fork"], pin: ["pin"], skewer: ["skewer"],
  discoveredAttack: ["discovered-attack"],
  discoveredCheck: ["discovered-attack", "discovered-check"],
  doubleCheck: ["double-attack", "double-check"],
  sacrifice: ["sacrifice"],
  hangingPiece: ["hanging-piece"],
  trappedPiece: ["trapped-piece"],
  capturingDefender: ["removal-of-defender", "capture-defender"],
  deflection: ["deflection"],
  attraction: ["attraction"],
  clearance: ["clearance"],
  interference: ["interference"],
  intermezzo: ["intermediate-move"],
  quietMove: ["quiet-move"],
  xRayAttack: ["x-ray"],
  zugzwang: ["zugzwang"],
  exposedKing: ["exposed-king"],
  defensiveMove: ["defensive-move"],
  advancedPawn: ["advanced-pawn"],
  promotion: ["promotion"],
  underPromotion: ["promotion", "underpromotion"],
  enPassant: ["en-passant"],
  attackingF2F7: ["attacking-f2-f7", "exposed-king"],
  kingsideAttack: ["kingside-attack"],
  queensideAttack: ["queenside-attack"],
  castling: ["castling"],
  mate: ["mating-attack"],
  mateIn1: ["mating-attack", "mate-in-1"],
  mateIn2: ["mating-attack", "mate-in-2"],
  mateIn3: ["mating-attack", "mate-in-3"],
  mateIn4: ["mating-attack", "mate-in-4"],
  mateIn5: ["mating-attack", "mate-in-5"],
  backRankMate: ["back-rank", "back-rank-mate", "mating-attack"],
  smotheredMate: ["smothered-mate", "mating-attack"],
  anastasiaMate: ["anastasias-mate", "mating-attack"],
  arabianMate: ["arabian-mate", "mating-attack"],
  dovetailMate: ["dovetail-mate", "mating-attack"],
  bodenMate: ["boden-mate", "mating-attack"],
  cornerMate: ["corner-mate", "mating-attack"],
  doubleBishopMate: ["double-bishop-mate", "mating-attack"],
  epauletteMate: ["epaulette-mate", "mating-attack"],
  hookMate: ["hook-mate", "mating-attack"],
  killBoxMate: ["kill-box-mate", "mating-attack"],
  morphysMate: ["morphys-mate", "mating-attack"],
  operaMate: ["opera-mate", "mating-attack"],
  pillsburysMate: ["pillsburys-mate", "mating-attack"],
  swallowstailMate: ["swallowstail-mate", "mating-attack"],
  triangleMate: ["triangle-mate", "mating-attack"],
  vukovicMate: ["vukovic-mate", "mating-attack"],
  balestraMate: ["balestra-mate", "mating-attack"],
  blindSwineMate: ["blind-swine-mate", "mating-attack"],
  collinearMove: ["collinear-move"],
  pawnEndgame: ["endgame", "pawn-endgame"],
  rookEndgame: ["endgame", "rook-endgame"],
  bishopEndgame: ["endgame", "bishop-endgame"],
  knightEndgame: ["endgame", "knight-endgame"],
  queenEndgame: ["endgame", "queen-endgame"],
  queenRookEndgame: ["endgame", "queen-rook-endgame"],
};

function mapGenericThemes(tags) {
  const themes = new Set();
  for (const tag of tags) {
    const mapped = GENERIC_MAP[tag];
    if (mapped) mapped.forEach((t) => themes.add(t));
  }
  return Array.from(themes);
}

// ── Main Analysis Function ───────────────────────────────────────────────────

/**
 * Analyze a puzzle and return specific theme IDs + contextual metadata.
 *
 * @param {object} puzzle - {puzzleId, fen, moves: "e7e6 h6h7...", themes: string[]}
 * @returns {{tacticalThemes: string[], metadata: object}}
 */
export function analyzePuzzle(puzzle) {
  const result = {
    tacticalThemes: [],
    metadata: {
      evaluation: null,    // advantage | crushing | equality
      gamePhase: null,     // opening | middlegame | endgame
      puzzleLength: null,  // oneMove | short | long | veryLong
      difficulty: null,    // master | masterVsMaster | superGM
      isMate: false,
      mateInMoves: null,
      moveCount: 0,
    },
  };

  // ── Step 1: Extract contextual metadata ──────────────────────────────────
  for (const tag of puzzle.themes) {
    if (EVALUATION_TAGS.has(tag)) result.metadata.evaluation = tag;
    else if (PHASE_TAGS.has(tag)) result.metadata.gamePhase = tag;
    else if (LENGTH_TAGS.has(tag)) result.metadata.puzzleLength = tag;
    else if (DIFFICULTY_TAGS.has(tag)) result.metadata.difficulty = tag;
  }

  const lengthMap = { oneMove: 1, short: 2, long: 3, veryLong: 4 };
  result.metadata.moveCount = lengthMap[result.metadata.puzzleLength] || 0;

  const mateMatch = puzzle.themes.find((t) => /^mateIn(\d)$/.test(t));
  if (mateMatch) {
    result.metadata.isMate = true;
    result.metadata.mateInMoves = parseInt(mateMatch.match(/\d/)[0]);
  }
  if (puzzle.themes.includes("mate")) result.metadata.isMate = true;

  // ── Step 2: Get tactical tags ────────────────────────────────────────────
  const tacticalTags = puzzle.themes.filter((t) => !NON_TACTICAL_TAGS.has(t));
  if (tacticalTags.length === 0) {
    return result;
  }

  // ── Step 3: Set up chess position ────────────────────────────────────────
  let before, after;
  let fromSq, toSq;

  try {
    const moves = puzzle.moves.split(" ");
    if (moves.length < 2) {
      result.tacticalThemes = mapGenericThemes(tacticalTags);
      return result;
    }

    // Apply opponent's move (sets up the puzzle)
    const chess = new Chess(puzzle.fen);
    const opp = uciToMove(moves[0]);
    chess.move({ from: opp.from, to: opp.to, promotion: opp.promotion });

    const fenBefore = chess.fen();
    before = new Chess(fenBefore);

    // Apply solver's first move
    const solver = uciToMove(moves[1]);
    fromSq = solver.from;
    toSq = solver.to;

    after = new Chess(fenBefore);
    after.move({ from: fromSq, to: toSq, promotion: solver.promotion });
  } catch {
    result.tacticalThemes = mapGenericThemes(tacticalTags);
    return result;
  }

  // ── Step 4: Infer specific themes via FEN analysis ───────────────────────
  const specific = new Set();

  for (const tag of tacticalTags) {
    try {
      switch (tag) {
        case "fork":
          inferFork(after, toSq).forEach((t) => specific.add(t));
          break;
        case "pin":
          inferPin(after, toSq).forEach((t) => specific.add(t));
          break;
        case "skewer":
          inferSkewer(after, toSq).forEach((t) => specific.add(t));
          break;
        case "discoveredAttack":
          inferDiscoveredAttack(before, after, fromSq, toSq).forEach((t) => specific.add(t));
          break;
        case "discoveredCheck":
          specific.add("discovered-attack");
          specific.add("discovered-check");
          if (before.get(toSq)) specific.add("discovered-check-with-capture");
          break;
        case "doubleCheck":
          specific.add("double-attack");
          specific.add("double-check");
          break;
        case "sacrifice":
          inferSacrifice(before, after, fromSq, toSq).forEach((t) => specific.add(t));
          break;
        case "mate": {
          specific.add("mating-attack");
          // Apply all moves to reach the final checkmate position for pattern analysis
          try {
            const allMoves = puzzle.moves.split(" ");
            const finalChess = new Chess(puzzle.fen);
            for (const m of allMoves) {
              const mv = uciToMove(m);
              finalChess.move({ from: mv.from, to: mv.to, promotion: mv.promotion });
            }
            if (finalChess.isCheckmate()) {
              const lastMove = uciToMove(allMoves[allMoves.length - 1]);
              inferMatePattern(finalChess, lastMove.to).forEach((t) => specific.add(t));
            }
          } catch { /* ignore */ }
          break;
        }
        case "mateIn1": specific.add("mating-attack"); specific.add("mate-in-1"); break;
        case "mateIn2": specific.add("mating-attack"); specific.add("mate-in-2"); break;
        case "mateIn3": specific.add("mating-attack"); specific.add("mate-in-3"); break;
        case "mateIn4": specific.add("mating-attack"); specific.add("mate-in-4"); break;
        case "mateIn5": specific.add("mating-attack"); specific.add("mate-in-5"); break;
        case "backRankMate":
          specific.add("back-rank"); specific.add("back-rank-mate"); specific.add("mating-attack");
          break;
        case "smotheredMate":
          specific.add("smothered-mate"); specific.add("mating-attack"); break;
        case "anastasiaMate":
          specific.add("anastasias-mate"); specific.add("mating-attack"); break;
        case "arabianMate":
          specific.add("arabian-mate"); specific.add("mating-attack"); break;
        case "dovetailMate":
          specific.add("dovetail-mate"); specific.add("mating-attack"); break;
        case "bodenMate":
          specific.add("boden-mate"); specific.add("mating-attack"); break;
        case "cornerMate":
          specific.add("corner-mate"); specific.add("mating-attack"); break;
        case "doubleBishopMate":
          specific.add("double-bishop-mate"); specific.add("mating-attack"); break;
        case "epauletteMate":
          specific.add("epaulette-mate"); specific.add("mating-attack"); break;
        case "hookMate":
          specific.add("hook-mate"); specific.add("mating-attack"); break;
        case "killBoxMate":
          specific.add("kill-box-mate"); specific.add("mating-attack"); break;
        case "morphysMate":
          specific.add("morphys-mate"); specific.add("mating-attack"); break;
        case "operaMate":
          specific.add("opera-mate"); specific.add("mating-attack"); break;
        case "pillsburysMate":
          specific.add("pillsburys-mate"); specific.add("mating-attack"); break;
        case "swallowstailMate":
          specific.add("swallowstail-mate"); specific.add("mating-attack"); break;
        case "triangleMate":
          specific.add("triangle-mate"); specific.add("mating-attack"); break;
        case "vukovicMate":
          specific.add("vukovic-mate"); specific.add("mating-attack"); break;
        case "balestraMate":
          specific.add("balestra-mate"); specific.add("mating-attack"); break;
        case "blindSwineMate":
          specific.add("blind-swine-mate"); specific.add("mating-attack"); break;
        case "hangingPiece":
          specific.add("hanging-piece"); break;
        case "trappedPiece":
          inferTrappedPiece(after, toSq).forEach((t) => specific.add(t));
          break;
        case "exposedKing":
          specific.add("exposed-king"); break;
        case "capturingDefender":
          specific.add("removal-of-defender"); specific.add("capture-defender"); break;
        case "deflection":
          specific.add("deflection"); break;
        case "attraction":
          specific.add("attraction"); break;
        case "clearance":
          specific.add("clearance"); break;
        case "interference":
          specific.add("interference"); break;
        case "intermezzo":
          specific.add("intermediate-move"); break;
        case "quietMove":
          specific.add("quiet-move"); break;
        case "xRayAttack":
          specific.add("x-ray"); break;
        case "zugzwang":
          specific.add("zugzwang"); break;
        case "defensiveMove":
          specific.add("defensive-move"); break;
        case "advancedPawn":
          specific.add("advanced-pawn"); break;
        case "promotion":
          specific.add("promotion"); break;
        case "underPromotion":
          specific.add("promotion"); specific.add("underpromotion"); break;
        case "enPassant":
          specific.add("en-passant"); break;
        case "attackingF2F7":
          specific.add("attacking-f2-f7"); specific.add("exposed-king"); break;
        case "kingsideAttack":
          specific.add("kingside-attack"); break;
        case "queensideAttack":
          specific.add("queenside-attack"); break;
        case "castling":
          specific.add("castling"); break;
        case "collinearMove":
          specific.add("collinear-move"); break;
        case "pawnEndgame":
          specific.add("endgame"); specific.add("pawn-endgame"); break;
        case "rookEndgame":
          specific.add("endgame"); specific.add("rook-endgame"); break;
        case "bishopEndgame":
          specific.add("endgame"); specific.add("bishop-endgame"); break;
        case "knightEndgame":
          specific.add("endgame"); specific.add("knight-endgame"); break;
        case "queenEndgame":
          specific.add("endgame"); specific.add("queen-endgame"); break;
        case "queenRookEndgame":
          specific.add("endgame"); specific.add("queen-rook-endgame"); break;
        default:
          // Unknown tag — use generic mapping if available
          const fallback = GENERIC_MAP[tag];
          if (fallback) fallback.forEach((t) => specific.add(t));
          break;
      }
    } catch {
      // FEN analysis failed for this theme — use generic fallback
      const fb = GENERIC_MAP[tag];
      if (fb) fb.forEach((t) => specific.add(t));
    }
  }

  result.tacticalThemes = Array.from(specific);
  return result;
}
