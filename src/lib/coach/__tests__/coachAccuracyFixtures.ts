/**
 * The coach-accuracy regression games (docs/coach-accuracy-notes.md), read
 * once: each PGN replayed on chess.js, and the stored engine truth
 * (fixtures/coach-accuracy/engine-truth.json) shaped the way the browser
 * hands evaluations to the app — `PositionEval`, White's point of view,
 * best line first for the side to move.
 *
 * The truth is a native Stockfish run, not the browser's Stockfish 17 Lite:
 * depth 16 stands in for the browser's pass 1, depth 20 for the re-check.
 * Regenerate it with engineTruth.regen.test.ts.
 */
import fs from "node:fs";
import path from "node:path";
import { Chess } from "chess.js";
import type { PositionEval } from "@/types/eval";

export const FIXTURE_DIR = path.join(__dirname, "fixtures", "coach-accuracy");
export const ENGINE_TRUTH_FILE = path.join(FIXTURE_DIR, "engine-truth.json");

export type GameId = "operaGame" | "gameB";

export const GAME_FILES: Record<GameId, string> = {
  operaGame: "opera-game.pgn",
  gameB: "game-b.pgn",
};

export interface ReplayedGame {
  id: GameId;
  pgn: string;
  sans: string[];
  uci: string[];
  /** fens[k] is the position after k plies; fens[0] is the start. */
  fens: string[];
}

export function loadGame(id: GameId): ReplayedGame {
  const pgn = fs.readFileSync(path.join(FIXTURE_DIR, GAME_FILES[id]), "utf8");
  const parsed = new Chess();
  parsed.loadPgn(pgn);
  const history = parsed.history({ verbose: true });
  const replay = new Chess();
  const fens = [replay.fen()];
  for (const m of history) {
    replay.move(m.san);
    fens.push(replay.fen());
  }
  return {
    id,
    pgn,
    sans: history.map((m) => m.san),
    uci: history.map((m) => `${m.from}${m.to}${m.promotion ?? ""}`),
    fens,
  };
}

export interface TruthLine {
  multiPv: number;
  /** White's point of view; null when the line is a mate. */
  evalCp: number | null;
  /** Signed, White's point of view (+3 = White mates in 3); null when not a mate. */
  mateIn: number | null;
  pv: string[];
}

export interface TruthPosition {
  ply: number;
  fen: string;
  engineName: string;
  version: string;
  depth: number;
  bestMove: string | null;
  evalCp: number | null;
  mateIn: number | null;
  pv: string[];
  lines: TruthLine[];
  /** Set on a finished game's last position; no search is run there. */
  terminal?: "checkmate" | "stalemate";
}

export interface EngineTruth {
  about: string;
  engineName: string;
  version: string;
  threads: number;
  hashMb: number;
  multiPv: number;
  pov: "white";
  games: Record<
    GameId,
    { pgnFile: string; depths: Record<string, TruthPosition[]> }
  >;
}

let cached: EngineTruth | null = null;

export function loadEngineTruth(): EngineTruth {
  if (!cached)
    cached = JSON.parse(
      fs.readFileSync(ENGINE_TRUTH_FILE, "utf8")
    ) as EngineTruth;
  return cached;
}

export function truthAt(
  game: GameId,
  depth: 16 | 20,
  ply: number
): TruthPosition {
  const positions = loadEngineTruth().games[game].depths[String(depth)];
  const found = positions?.find((p) => p.ply === ply);
  if (!found)
    throw new Error(`no engine truth for ${game} ply ${ply} at depth ${depth}`);
  return found;
}

/**
 * The stored truth as the browser's `PositionEval[]`, one per position of
 * the game. A finished game's last position gets the same depth-0 stub the
 * browser's engine stores for a terminal position.
 */
export function positionEvals(game: GameId, depth: 16 | 20): PositionEval[] {
  return loadEngineTruth().games[game].depths[String(depth)].map((p) => {
    if (p.terminal) return { lines: [{ pv: [], depth: 0, multiPv: 1, cp: 0 }] };
    return {
      bestMove: p.bestMove ?? undefined,
      lines: p.lines.map((l) => ({
        pv: l.pv,
        ...(l.mateIn !== null ? { mate: l.mateIn } : { cp: l.evalCp ?? 0 }),
        depth: p.depth,
        multiPv: l.multiPv,
      })),
    };
  });
}
