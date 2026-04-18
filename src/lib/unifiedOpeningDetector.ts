import { Chess } from "chess.js";
import openingsData from "@/data/openings.json";

export interface OpeningInfo {
  name: string;
  eco?: string;
  moves: number;
  isEarlyOpening: boolean;
}

// ── Trie for efficient longest-prefix opening detection ──────────────────────

interface TrieNode {
  children: Map<string, TrieNode>;
  opening?: { name: string; eco: string | null; moveCount: number };
}

let trieRoot: TrieNode | null = null;
let trieBuilt = false;

/**
 * Parse a PGN string into an array of SAN moves.
 * "1. e4 e5 2. Nf3 Nc6" → ["e4", "e5", "Nf3", "Nc6"]
 */
function parsePgnMoves(pgn: string): string[] {
  return pgn
    .replace(/\d+\.\s*/g, "")  // Remove move numbers
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((m) => m.length > 0);
}

/**
 * Build a trie from all openings that have PGN sequences.
 * Called once on first use; cached in module scope.
 */
function buildTrie(): TrieNode {
  if (trieRoot && trieBuilt) return trieRoot;

  trieRoot = { children: new Map() };

  for (const entry of openingsData) {
    if (!entry.pgn) continue;

    const moves = parsePgnMoves(entry.pgn);
    if (moves.length === 0) continue;

    let node = trieRoot;
    for (const move of moves) {
      const normalized = move.replace(/[+#]/g, "");
      if (!node.children.has(normalized)) {
        node.children.set(normalized, { children: new Map() });
      }
      node = node.children.get(normalized)!;
    }

    // At the leaf, store the opening info.
    // If multiple openings end at the same move sequence, keep the one with the
    // most specific name (longer name usually = more specific variation).
    if (!node.opening || entry.name.length > node.opening.name.length) {
      node.opening = {
        name: entry.name,
        eco: entry.eco,
        moveCount: moves.length,
      };
    }
  }

  trieBuilt = true;
  return trieRoot;
}

/**
 * Detect the opening from a chess.js Game instance.
 *
 * Uses longest-match-wins: if a game starts with 1. e4 c5 2. Nf3 d6 3. d4 cxd4
 * 4. Nxd4 Nf6 5. Nc3 a6, returns "Sicilian Defense: Najdorf Variation" (B90)
 * rather than "Sicilian Defense" (B20) that matches at move 2.
 *
 * Preserves the same API as the original openingDetector.ts.
 */
export function detectOpening(game: Chess): OpeningInfo | null {
  const history = game.history();
  if (history.length === 0) return null;

  const trie = buildTrie();
  let node = trie;
  let bestMatch: { name: string; eco: string | null; moveCount: number } | null = null;

  for (const move of history) {
    const normalized = move.replace(/[+#]/g, "");
    const child = node.children.get(normalized);
    if (!child) break;

    node = child;
    if (node.opening) {
      bestMatch = node.opening;
    }
  }

  if (bestMatch) {
    return {
      name: bestMatch.name,
      eco: bestMatch.eco || undefined,
      moves: bestMatch.moveCount,
      isEarlyOpening: history.length <= 10,
    };
  }

  // No specific opening found — return generic info for early moves
  if (history.length <= 10) {
    return {
      name: "Opening",
      moves: history.length,
      isEarlyOpening: true,
    };
  }

  return null;
}

/**
 * Check if a move is in the opening phase.
 */
export function isOpeningMove(moveNumber: number): boolean {
  return moveNumber <= 10;
}

/**
 * Get opening phase information.
 */
export function getOpeningPhase(moveNumber: number): {
  phase: "opening" | "early-middlegame" | "middlegame" | "endgame";
  shouldSkipCritique: boolean;
} {
  if (moveNumber <= 10) {
    return { phase: "opening", shouldSkipCritique: true };
  } else if (moveNumber <= 20) {
    return { phase: "early-middlegame", shouldSkipCritique: false };
  } else if (moveNumber <= 40) {
    return { phase: "middlegame", shouldSkipCritique: false };
  } else {
    return { phase: "endgame", shouldSkipCritique: false };
  }
}

/**
 * Look up an opening by name from the unified dataset.
 * Returns the full opening data (name, FEN, ECO, PGN) or null.
 */
export function lookupOpening(name: string): {
  name: string;
  fen: string | null;
  eco: string | null;
  pgn: string | null;
} | null {
  const normalized = name.toLowerCase().trim();
  const found = openingsData.find(
    (o) => o.name.toLowerCase().trim() === normalized
  );
  return found || null;
}

/**
 * Get the number of openings in the unified dataset.
 */
export function getOpeningCount(): {
  total: number;
  withEco: number;
  withPgn: number;
} {
  return {
    total: openingsData.length,
    withEco: openingsData.filter((o) => o.eco).length,
    withPgn: openingsData.filter((o) => o.pgn).length,
  };
}
