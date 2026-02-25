import { Chess } from "chess.js";
import type { OpeningRepertoire, OpeningLine } from "@/types/openings";

/**
 * Parse a PGN string into an OpeningRepertoire for custom drilling.
 * Supports single-game PGNs and multi-variation PGNs.
 *
 * For simple PGNs (no variations), the main line becomes the only drill line.
 * The parser extracts SAN moves from the PGN text.
 */

/**
 * Extract SAN moves from a PGN movetext string.
 * Strips move numbers, comments, NAGs, and result markers.
 */
function extractMovesFromMovetext(movetext: string): string[] {
  // Remove comments {...}
  let cleaned = movetext.replace(/\{[^}]*\}/g, "");
  // Remove NAGs ($1, $2, etc.)
  cleaned = cleaned.replace(/\$\d+/g, "");
  // Remove result markers
  cleaned = cleaned.replace(/1-0|0-1|1\/2-1\/2|\*/g, "");
  // Remove move numbers (e.g., "1." or "1...")
  cleaned = cleaned.replace(/\d+\.{1,3}/g, "");
  // Split by whitespace and filter empty
  const tokens = cleaned.split(/\s+/).filter((t) => t.trim().length > 0);

  // Validate each token is a legal-looking SAN move
  const moves: string[] = [];
  for (const token of tokens) {
    // Basic SAN pattern: piece moves, pawn moves, castling
    if (/^[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](=[QRBN])?[+#]?$/.test(token) ||
        /^O-O(-O)?[+#]?$/.test(token)) {
      moves.push(token);
    }
  }

  return moves;
}

/**
 * Parse a single PGN game string into moves array.
 * Uses chess.js for validation.
 */
function parsePgnToMoves(pgn: string): string[] {
  const game = new Chess();
  try {
    game.loadPgn(pgn);
    return game.history();
  } catch {
    // Fallback: try to extract moves manually
    const parts = pgn.split(/\n\n/);
    const movetext = parts.length > 1 ? parts[parts.length - 1] : pgn;
    return extractMovesFromMovetext(movetext);
  }
}

/**
 * Extract PGN headers.
 */
function extractHeaders(pgn: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const headerRegex = /\[(\w+)\s+"([^"]*)"\]/g;
  let match;
  while ((match = headerRegex.exec(pgn)) !== null) {
    headers[match[1]] = match[2];
  }
  return headers;
}

/**
 * Determine which color the user is practicing based on the PGN.
 * Defaults to white if unclear.
 */
function detectColor(headers: Record<string, string>, moves: string[]): "white" | "black" {
  // If there's a "Color" header
  if (headers.Color) {
    return headers.Color.toLowerCase() === "black" ? "black" : "white";
  }
  return "white";
}

/**
 * Parse a PGN string into an OpeningRepertoire.
 * Supports multi-game PGNs (split by double newlines between games).
 */
export function parsePgnToRepertoire(
  pgn: string,
  name?: string,
  color?: "white" | "black"
): OpeningRepertoire | null {
  if (!pgn.trim()) return null;

  // Try to split into multiple games
  const games = pgn
    .split(/\n\n\[/)
    .map((g, i) => (i === 0 ? g : "[" + g))
    .filter((g) => g.trim().length > 0);

  const lines: OpeningLine[] = [];

  for (let i = 0; i < games.length; i++) {
    const gamePgn = games[i];
    const headers = extractHeaders(gamePgn);
    const moves = parsePgnToMoves(gamePgn);

    if (moves.length === 0) continue;

    // Limit to opening phase (first 30 moves max)
    const openingMoves = moves.slice(0, 30);

    const lineName = headers.Opening ||
      headers.ECO ||
      (games.length > 1 ? `Variation ${i + 1}` : "Main Line");

    lines.push({
      id: `custom-line-${i}-${Date.now()}`,
      name: lineName,
      moves: openingMoves,
      description: headers.Opening
        ? `${headers.Opening} (${openingMoves.length} moves)`
        : `${openingMoves.length} moves`,
    });
  }

  if (lines.length === 0) return null;

  const firstHeaders = extractHeaders(games[0]);
  const detectedColor = color || detectColor(firstHeaders, lines[0]?.moves || []);

  return {
    id: `custom-${Date.now()}`,
    name: name || firstHeaders.Opening || "Custom Repertoire",
    eco: firstHeaders.ECO || "?",
    color: detectedColor,
    difficulty: "intermediate",
    description: `Custom repertoire with ${lines.length} line(s). Imported from PGN.`,
    themes: ["custom"],
    lines,
  };
}

/**
 * Validate that a PGN string contains at least one parseable game.
 */
export function validatePgn(pgn: string): { valid: boolean; error?: string; moveCount?: number } {
  if (!pgn.trim()) {
    return { valid: false, error: "PGN is empty" };
  }

  try {
    const game = new Chess();
    game.loadPgn(pgn);
    const history = game.history();
    if (history.length === 0) {
      return { valid: false, error: "No moves found in PGN" };
    }
    return { valid: true, moveCount: history.length };
  } catch (err) {
    // Try manual extraction
    const moves = extractMovesFromMovetext(pgn);
    if (moves.length > 0) {
      return { valid: true, moveCount: moves.length };
    }
    return { valid: false, error: "Could not parse PGN. Check the format." };
  }
}
