import { Chess, Square } from "chess.js";

/**
 * Position Annotator — Structured middle layer between Stockfish and LLM.
 * Takes raw engine output + FEN and produces categorized annotations
 * that the LLM can use to generate grounded explanations.
 */

export interface PositionAnnotation {
  gamePhase: "opening" | "middlegame" | "endgame";
  threats: ThreatInfo[];
  tacticalMotifs: TacticalMotif[];
  strategicThemes: StrategicTheme[];
  pawnStructure: PawnStructureAssessment;
  kingSafety: { white: number; black: number }; // 0-100, higher = safer
  pieceActivity: PieceActivityScore[];
  hangingPieces: HangingPiece[];
  summary: string; // One-line position summary for the LLM
}

export interface ThreatInfo {
  side: "white" | "black";
  type: "check" | "capture" | "mate_threat" | "fork_threat" | "pin" | "skewer" | "hanging";
  description: string;
  squares: string[];
}

export interface TacticalMotif {
  name: string;
  description: string;
  involvedSquares: string[];
  severity: "critical" | "significant" | "minor";
}

export interface StrategicTheme {
  name: string;
  description: string;
  relevance: "high" | "medium" | "low";
}

export interface PawnStructureAssessment {
  doubledPawns: { white: number; black: number };
  isolatedPawns: { white: number; black: number };
  passedPawns: { white: string[]; black: string[] };
  pawnIslands: { white: number; black: number };
  openFiles: string[];
  semiOpenFiles: { white: string[]; black: string[] };
}

export interface PieceActivityScore {
  piece: string;
  square: string;
  color: "white" | "black";
  activity: "active" | "passive" | "trapped" | "undeveloped";
  reason: string;
}

export interface HangingPiece {
  piece: string;
  square: string;
  color: "white" | "black";
  value: number;
  attackers: string[];
  defenders: number;
}

const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const PIECE_FULL_NAMES: Record<string, string> = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };

/**
 * Annotate a position with structured categories for the LLM.
 */
export function annotatePosition(fen: string): PositionAnnotation {
  const game = new Chess(fen);
  const board = game.board();

  const gamePhase = detectGamePhase(board);
  const threats = detectThreats(game);
  const tacticalMotifs = detectTacticalMotifs(game);
  const strategicThemes = detectStrategicThemes(game, board, gamePhase);
  const pawnStructure = assessPawnStructure(board, game);
  const kingSafety = assessKingSafety(game, board);
  const pieceActivity = assessPieceActivity(game, board, gamePhase);
  const hangingPieces = detectHangingPieces(game);

  const summary = buildPositionSummary(game, gamePhase, threats, hangingPieces, pawnStructure);

  return {
    gamePhase,
    threats,
    tacticalMotifs,
    strategicThemes,
    pawnStructure,
    kingSafety,
    pieceActivity,
    hangingPieces,
    summary,
  };
}

/**
 * Convert a PositionAnnotation to a structured string for the LLM prompt.
 */
export function annotationToPromptContext(annotation: PositionAnnotation): string {
  const sections: string[] = [];

  sections.push(`## POSITION ANNOTATION`);
  sections.push(`Game Phase: ${annotation.gamePhase.toUpperCase()}`);
  sections.push(`Summary: ${annotation.summary}`);

  // Threats
  if (annotation.threats.length > 0) {
    sections.push(`\n### THREATS`);
    annotation.threats.forEach(t => {
      sections.push(`- [${t.side}] ${t.type}: ${t.description}`);
    });
  }

  // Hanging pieces
  if (annotation.hangingPieces.length > 0) {
    sections.push(`\n### HANGING PIECES`);
    annotation.hangingPieces.forEach(h => {
      sections.push(`- ${h.color} ${h.piece} on ${h.square} (value: ${h.value}) — ${h.defenders} defender(s), attacked by: ${h.attackers.join(", ")}`);
    });
  }

  // Tactical motifs
  if (annotation.tacticalMotifs.length > 0) {
    sections.push(`\n### TACTICAL MOTIFS`);
    annotation.tacticalMotifs.forEach(m => {
      sections.push(`- [${m.severity}] ${m.name}: ${m.description}`);
    });
  }

  // Strategic themes
  if (annotation.strategicThemes.length > 0) {
    sections.push(`\n### STRATEGIC THEMES`);
    annotation.strategicThemes.forEach(s => {
      sections.push(`- [${s.relevance}] ${s.name}: ${s.description}`);
    });
  }

  // Pawn structure
  sections.push(`\n### PAWN STRUCTURE`);
  const ps = annotation.pawnStructure;
  if (ps.doubledPawns.white > 0 || ps.doubledPawns.black > 0) {
    sections.push(`- Doubled pawns: White ${ps.doubledPawns.white}, Black ${ps.doubledPawns.black}`);
  }
  if (ps.isolatedPawns.white > 0 || ps.isolatedPawns.black > 0) {
    sections.push(`- Isolated pawns: White ${ps.isolatedPawns.white}, Black ${ps.isolatedPawns.black}`);
  }
  if (ps.passedPawns.white.length > 0 || ps.passedPawns.black.length > 0) {
    if (ps.passedPawns.white.length > 0) sections.push(`- White passed pawns: ${ps.passedPawns.white.join(", ")}`);
    if (ps.passedPawns.black.length > 0) sections.push(`- Black passed pawns: ${ps.passedPawns.black.join(", ")}`);
  }
  if (ps.openFiles.length > 0) {
    sections.push(`- Open files: ${ps.openFiles.join(", ")}`);
  }

  // King safety
  sections.push(`\n### KING SAFETY`);
  sections.push(`- White king safety: ${annotation.kingSafety.white}/100`);
  sections.push(`- Black king safety: ${annotation.kingSafety.black}/100`);

  // Piece activity (only notable ones)
  const notablePieces = annotation.pieceActivity.filter(p => p.activity !== "active" || p.piece === "queen" || p.piece === "rook");
  if (notablePieces.length > 0) {
    sections.push(`\n### PIECE ACTIVITY`);
    notablePieces.forEach(p => {
      sections.push(`- ${p.color} ${p.piece} on ${p.square}: ${p.activity} — ${p.reason}`);
    });
  }

  return sections.join("\n");
}

// --- Detection Functions ---

function detectGamePhase(board: ReturnType<Chess["board"]>): "opening" | "middlegame" | "endgame" {
  let totalPieces = 0;
  let queens = 0;
  for (const row of board) {
    for (const sq of row) {
      if (sq && sq.type !== "k") {
        totalPieces++;
        if (sq.type === "q") queens++;
      }
    }
  }
  // Endgame: few pieces or no queens with limited material
  if (totalPieces <= 8 || (queens === 0 && totalPieces <= 12)) return "endgame";
  // Opening: many pieces still on starting squares
  if (totalPieces >= 26) return "opening";
  return "middlegame";
}

function detectThreats(game: Chess): ThreatInfo[] {
  const threats: ThreatInfo[] = [];
  const turn = game.turn();
  const opponent = turn === "w" ? "black" : "white";
  const sideToMove = turn === "w" ? "white" : "black";

  // Check if side to move is in check
  if (game.isCheck()) {
    threats.push({
      side: opponent,
      type: "check",
      description: `${sideToMove === "white" ? "White" : "Black"} king is in check`,
      squares: [],
    });
  }

  // Detect available captures for the side to move
  const moves = game.moves({ verbose: true });
  const captures = moves.filter(m => m.captured);
  const capturingHighValue = captures.filter(m => PIECE_VALUES[m.captured!] >= 3);

  if (capturingHighValue.length > 0) {
    const bestCapture = capturingHighValue.sort((a, b) =>
      PIECE_VALUES[b.captured!] - PIECE_VALUES[a.captured!]
    )[0];
    threats.push({
      side: sideToMove,
      type: "capture",
      description: `${sideToMove === "white" ? "White" : "Black"} can capture ${PIECE_FULL_NAMES[bestCapture.captured!]} on ${bestCapture.to}`,
      squares: [bestCapture.from, bestCapture.to],
    });
  }

  return threats;
}

function detectTacticalMotifs(game: Chess): TacticalMotif[] {
  const motifs: TacticalMotif[] = [];
  const moves = game.moves({ verbose: true });
  const turn = game.turn();

  // Detect potential forks: a piece move that attacks 2+ valuable pieces
  for (const move of moves) {
    try {
      const testGame = new Chess(game.fen());
      testGame.move(move.san);
      const opponentMoves = testGame.moves({ verbose: true });

      // After our move, see what our moved piece attacks
      // Check if the piece on the destination attacks multiple valuable opponent pieces
      const attackedByMovedPiece = opponentMoves.filter(om => {
        // Pieces the opponent needs to defend or that are attacked
        return false; // Simplified — full fork detection would need square attack maps
      });
    } catch {
      continue;
    }
  }

  // Detect pins: a piece that can't move because it would expose a more valuable piece
  const board = game.board();
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (!piece || piece.color !== turn) continue;
      if (piece.type === "k") continue;

      const square = (String.fromCharCode(97 + file) + (8 - rank)) as Square;
      const pieceMoves = game.moves({ square, verbose: true });

      // If a piece has very few legal moves compared to expected, it might be pinned
      if (piece.type === "n" && pieceMoves.length === 0) {
        motifs.push({
          name: "Possible Pin",
          description: `${piece.color === "w" ? "White" : "Black"} knight on ${square} has no legal moves — may be pinned`,
          involvedSquares: [square],
          severity: "significant",
        });
      }
      if ((piece.type === "b" || piece.type === "r") && pieceMoves.length === 0) {
        motifs.push({
          name: "Possible Pin/Trapped Piece",
          description: `${piece.color === "w" ? "White" : "Black"} ${PIECE_FULL_NAMES[piece.type]} on ${square} has no legal moves`,
          involvedSquares: [square],
          severity: "significant",
        });
      }
    }
  }

  return motifs;
}

function detectStrategicThemes(
  game: Chess,
  board: ReturnType<Chess["board"]>,
  phase: string
): StrategicTheme[] {
  const themes: StrategicTheme[] = [];

  // Center control
  const centerSquares: Square[] = ["d4", "d5", "e4", "e5"];
  let whiteCenterControl = 0;
  let blackCenterControl = 0;
  for (const sq of centerSquares) {
    const piece = game.get(sq);
    if (piece) {
      if (piece.color === "w") whiteCenterControl++;
      else blackCenterControl++;
    }
  }
  if (whiteCenterControl > blackCenterControl + 1) {
    themes.push({ name: "White center dominance", description: "White controls more central squares", relevance: "high" });
  } else if (blackCenterControl > whiteCenterControl + 1) {
    themes.push({ name: "Black center dominance", description: "Black controls more central squares", relevance: "high" });
  }

  // Bishop pair
  const whiteBishops = countPieces(board, "w", "b");
  const blackBishops = countPieces(board, "b", "b");
  if (whiteBishops === 2 && blackBishops < 2) {
    themes.push({ name: "White has bishop pair", description: "White's two bishops can be powerful in open positions", relevance: "medium" });
  } else if (blackBishops === 2 && whiteBishops < 2) {
    themes.push({ name: "Black has bishop pair", description: "Black's two bishops can be powerful in open positions", relevance: "medium" });
  }

  // Open position detection (few pawns = bishops strong)
  const totalPawns = countPieces(board, "w", "p") + countPieces(board, "b", "p");
  if (totalPawns <= 8) {
    themes.push({ name: "Open position", description: "Few pawns remaining — bishops and rooks are strong", relevance: "medium" });
  } else if (totalPawns >= 14) {
    themes.push({ name: "Closed position", description: "Many pawns — knights may be stronger than bishops", relevance: "medium" });
  }

  // Endgame themes
  if (phase === "endgame") {
    themes.push({ name: "King activation", description: "In the endgame, the king should be centralized and active", relevance: "high" });
  }

  return themes;
}

function assessPawnStructure(board: ReturnType<Chess["board"]>, game: Chess): PawnStructureAssessment {
  const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const whitePawnFiles: Record<string, number[]> = {};
  const blackPawnFiles: Record<string, number[]> = {};

  // Map pawns to files
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (!piece || piece.type !== "p") continue;
      const fileName = files[file];
      const actualRank = 8 - rank;
      if (piece.color === "w") {
        if (!whitePawnFiles[fileName]) whitePawnFiles[fileName] = [];
        whitePawnFiles[fileName].push(actualRank);
      } else {
        if (!blackPawnFiles[fileName]) blackPawnFiles[fileName] = [];
        blackPawnFiles[fileName].push(actualRank);
      }
    }
  }

  // Doubled pawns
  const doubledWhite = Object.values(whitePawnFiles).filter(ranks => ranks.length > 1).length;
  const doubledBlack = Object.values(blackPawnFiles).filter(ranks => ranks.length > 1).length;

  // Isolated pawns
  let isolatedWhite = 0;
  let isolatedBlack = 0;
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const left = i > 0 ? files[i - 1] : null;
    const right = i < 7 ? files[i + 1] : null;
    if (whitePawnFiles[f] && (!left || !whitePawnFiles[left]) && (!right || !whitePawnFiles[right])) {
      isolatedWhite++;
    }
    if (blackPawnFiles[f] && (!left || !blackPawnFiles[left]) && (!right || !blackPawnFiles[right])) {
      isolatedBlack++;
    }
  }

  // Passed pawns
  const whitePassedPawns: string[] = [];
  const blackPassedPawns: string[] = [];
  for (const [f, ranks] of Object.entries(whitePawnFiles)) {
    const fileIdx = files.indexOf(f);
    const maxRank = Math.max(...ranks);
    let isPassed = true;
    for (let fi = Math.max(0, fileIdx - 1); fi <= Math.min(7, fileIdx + 1); fi++) {
      const enemyPawns = blackPawnFiles[files[fi]];
      if (enemyPawns && enemyPawns.some(r => r >= maxRank)) {
        isPassed = false;
        break;
      }
    }
    if (isPassed) whitePassedPawns.push(`${f}${maxRank}`);
  }
  for (const [f, ranks] of Object.entries(blackPawnFiles)) {
    const fileIdx = files.indexOf(f);
    const minRank = Math.min(...ranks);
    let isPassed = true;
    for (let fi = Math.max(0, fileIdx - 1); fi <= Math.min(7, fileIdx + 1); fi++) {
      const enemyPawns = whitePawnFiles[files[fi]];
      if (enemyPawns && enemyPawns.some(r => r <= minRank)) {
        isPassed = false;
        break;
      }
    }
    if (isPassed) blackPassedPawns.push(`${f}${minRank}`);
  }

  // Open and semi-open files
  const openFiles: string[] = [];
  const whiteSemiOpen: string[] = [];
  const blackSemiOpen: string[] = [];
  for (const f of files) {
    const hasWhite = !!whitePawnFiles[f];
    const hasBlack = !!blackPawnFiles[f];
    if (!hasWhite && !hasBlack) openFiles.push(f);
    else if (!hasWhite && hasBlack) whiteSemiOpen.push(f);
    else if (hasWhite && !hasBlack) blackSemiOpen.push(f);
  }

  // Pawn islands
  let whiteIslands = 0;
  let inIsland = false;
  for (const f of files) {
    if (whitePawnFiles[f]) {
      if (!inIsland) { whiteIslands++; inIsland = true; }
    } else {
      inIsland = false;
    }
  }
  let blackIslands = 0;
  inIsland = false;
  for (const f of files) {
    if (blackPawnFiles[f]) {
      if (!inIsland) { blackIslands++; inIsland = true; }
    } else {
      inIsland = false;
    }
  }

  return {
    doubledPawns: { white: doubledWhite, black: doubledBlack },
    isolatedPawns: { white: isolatedWhite, black: isolatedBlack },
    passedPawns: { white: whitePassedPawns, black: blackPassedPawns },
    pawnIslands: { white: whiteIslands, black: blackIslands },
    openFiles,
    semiOpenFiles: { white: whiteSemiOpen, black: blackSemiOpen },
  };
}

function assessKingSafety(game: Chess, board: ReturnType<Chess["board"]>): { white: number; black: number } {
  let whiteSafety = 70; // Start at decent safety
  let blackSafety = 70;

  // Check castling status — has the king castled?
  const fen = game.fen();
  const castling = fen.split(" ")[2];

  // If castling rights remain, king hasn't castled yet (less safe in middlegame)
  if (castling.includes("K") || castling.includes("Q")) whiteSafety -= 10;
  if (castling.includes("k") || castling.includes("q")) blackSafety -= 10;

  // Check pawn shield around each king
  const whiteKingPos = findKing(board, "w");
  const blackKingPos = findKing(board, "b");

  if (whiteKingPos) {
    whiteSafety += countPawnShield(board, whiteKingPos, "w") * 10;
  }
  if (blackKingPos) {
    blackSafety += countPawnShield(board, blackKingPos, "b") * 10;
  }

  // Check if in check
  if (game.isCheck()) {
    const turn = game.turn();
    if (turn === "w") whiteSafety -= 20;
    else blackSafety -= 20;
  }

  return {
    white: Math.max(0, Math.min(100, whiteSafety)),
    black: Math.max(0, Math.min(100, blackSafety)),
  };
}

function assessPieceActivity(
  game: Chess,
  board: ReturnType<Chess["board"]>,
  phase: string
): PieceActivityScore[] {
  const scores: PieceActivityScore[] = [];

  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (!piece || piece.type === "p" || piece.type === "k") continue;

      const square = (String.fromCharCode(97 + file) + (8 - rank)) as Square;
      const color = piece.color === "w" ? "white" : "black";
      const pieceName = PIECE_FULL_NAMES[piece.type];
      const moves = game.moves({ square, verbose: true });

      let activity: PieceActivityScore["activity"] = "active";
      let reason = `${moves.length} legal moves available`;

      // Check if piece is on its starting square (undeveloped)
      const startingSquares: Record<string, string[]> = {
        wn: ["b1", "g1"], bn: ["b8", "g8"],
        wb: ["c1", "f1"], bb: ["c8", "f8"],
        wr: ["a1", "h1"], br: ["a8", "h8"],
        wq: ["d1"], bq: ["d8"],
      };
      const key = piece.color + piece.type;
      if (startingSquares[key]?.includes(square) && phase !== "endgame") {
        activity = "undeveloped";
        reason = "Still on starting square";
      } else if (moves.length === 0) {
        activity = "trapped";
        reason = "No legal moves available — piece is trapped or pinned";
      } else if (moves.length <= 2) {
        activity = "passive";
        reason = `Only ${moves.length} legal move(s) — restricted mobility`;
      }

      scores.push({ piece: pieceName, square, color, activity, reason });
    }
  }

  return scores;
}

function detectHangingPieces(game: Chess): HangingPiece[] {
  const hanging: HangingPiece[] = [];
  const board = game.board();

  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (!piece || piece.type === "k") continue;

      const square = (String.fromCharCode(97 + file) + (8 - rank)) as Square;
      const color = piece.color === "w" ? "white" : "black";

      // Check if this piece is attacked by checking opponent's moves
      const opponentColor = piece.color === "w" ? "b" : "w";
      const isAttacked = game.isAttacked(square, opponentColor);

      if (isAttacked) {
        // Count defenders: side to move's pieces that can recapture
        const defenderMoves = game.moves({ verbose: true }).filter(
          m => m.to === square && m.captured
        );

        // If the piece is attacked and has 0 defenders, or attacked by lower-value piece
        if (defenderMoves.length === 0 && piece.color !== game.turn()) {
          // Find attackers
          const attackerSquares: string[] = [];
          const allOpponentMoves = getAllMovesForColor(game, opponentColor);
          for (const m of allOpponentMoves) {
            if (m.to === square) attackerSquares.push(`${PIECE_FULL_NAMES[m.piece]} on ${m.from}`);
          }

          if (attackerSquares.length > 0) {
            hanging.push({
              piece: PIECE_FULL_NAMES[piece.type],
              square,
              color,
              value: PIECE_VALUES[piece.type],
              attackers: attackerSquares,
              defenders: 0,
            });
          }
        }
      }
    }
  }

  return hanging;
}

function buildPositionSummary(
  game: Chess,
  phase: string,
  threats: ThreatInfo[],
  hangingPieces: HangingPiece[],
  pawnStructure: PawnStructureAssessment
): string {
  const parts: string[] = [];
  const turn = game.turn() === "w" ? "White" : "Black";
  parts.push(`${turn} to move.`);
  parts.push(`Game phase: ${phase}.`);

  if (game.isCheck()) parts.push("King is in check!");
  if (game.isCheckmate()) parts.push("CHECKMATE.");
  if (hangingPieces.length > 0) {
    parts.push(`${hangingPieces.length} hanging piece(s) detected.`);
  }
  if (threats.filter(t => t.type === "capture").length > 0) {
    parts.push("Captures available.");
  }
  if (pawnStructure.passedPawns.white.length > 0 || pawnStructure.passedPawns.black.length > 0) {
    parts.push("Passed pawns on the board.");
  }
  return parts.join(" ");
}

// --- Helper Functions ---

function countPieces(board: ReturnType<Chess["board"]>, color: "w" | "b", type: string): number {
  let count = 0;
  for (const row of board) {
    for (const sq of row) {
      if (sq && sq.color === color && sq.type === type) count++;
    }
  }
  return count;
}

function findKing(board: ReturnType<Chess["board"]>, color: "w" | "b"): [number, number] | null {
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (piece && piece.type === "k" && piece.color === color) {
        return [rank, file];
      }
    }
  }
  return null;
}

function countPawnShield(board: ReturnType<Chess["board"]>, kingPos: [number, number], color: "w" | "b"): number {
  const [kingRank, kingFile] = kingPos;
  const pawnRankOffset = color === "w" ? -1 : 1; // Pawns should be in front of king
  let shieldCount = 0;

  for (let df = -1; df <= 1; df++) {
    const f = kingFile + df;
    const r = kingRank + pawnRankOffset;
    if (f >= 0 && f < 8 && r >= 0 && r < 8) {
      const piece = board[r][f];
      if (piece && piece.type === "p" && piece.color === color) {
        shieldCount++;
      }
    }
  }

  return shieldCount;
}

function getAllMovesForColor(game: Chess, color: "w" | "b") {
  // We need to temporarily set the turn to the specified color to get their moves
  const fen = game.fen();
  const parts = fen.split(" ");
  parts[1] = color;
  // Reset en passant and adjust if needed
  try {
    const tempGame = new Chess(parts.join(" "));
    return tempGame.moves({ verbose: true });
  } catch {
    return [];
  }
}
