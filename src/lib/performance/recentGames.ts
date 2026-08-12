import type { ChessComGame } from "@/types/chessCom";
import type { LichessGame } from "@/types/lichess";

/**
 * One row in the recent-games list, normalised across platforms.
 *
 * Chess.com and Lichess return quite different shapes — epoch seconds vs
 * milliseconds, `time_class` vs `speed`, a guaranteed username vs an optional
 * nested `user` that is absent for anonymous and AI opponents. Normalising
 * once here keeps that entirely out of the component.
 */
export interface RecentGame {
  /** Stable per platform; used as the React key and for dedupe. */
  id: string;
  platform: "chesscom" | "lichess";
  /** Epoch MILLISECONDS. Chess.com reports seconds; converted on the way in. */
  playedAt: number;
  /** Full PGN — what "Analyze now" hands to /analysis. */
  pgn: string;
  opponent: string;
  opponentRating?: number;
  /** The signed-in player's colour in this game, when we can tell. */
  playerColor?: "white" | "black";
  playerRating?: number;
  /** "win" | "loss" | "draw" from the player's perspective, when derivable. */
  result?: "win" | "loss" | "draw";
  /** blitz / rapid / bullet / classical, as the platform labels it. */
  speed?: string;
}

const UNKNOWN_OPPONENT = "Unknown";

/** Case-insensitive: platforms are inconsistent about display casing. */
function sameUser(a: string | undefined, b: string): boolean {
  return !!a && a.toLowerCase() === b.toLowerCase();
}

/**
 * Read the game result from the PGN's Result header.
 *
 * Deliberately parsed from the PGN rather than trusting a platform field:
 * chess.com reports per-player result strings with a dozen variants
 * ("win", "checkmated", "timeout", "resigned", "agreed", …) and Lichess omits
 * a result entirely on the game object. The PGN tag is the one thing both
 * always carry and both spell the same way.
 */
export function resultFromPgn(
  pgn: string,
  playerColor: "white" | "black" | undefined
): RecentGame["result"] {
  if (!playerColor) return undefined;
  const m = pgn.match(/\[Result\s+"([^"]+)"\]/);
  const raw = m?.[1];
  if (raw === "1/2-1/2") return "draw";
  if (raw === "1-0") return playerColor === "white" ? "win" : "loss";
  if (raw === "0-1") return playerColor === "black" ? "win" : "loss";
  // "*" means unfinished/adjourned — not a draw, and saying so would be wrong.
  return undefined;
}

export function normalizeChessComGame(
  game: ChessComGame,
  username: string
): RecentGame {
  const isWhite = sameUser(game.white?.username, username);
  const isBlack = sameUser(game.black?.username, username);
  const playerColor = isWhite ? "white" : isBlack ? "black" : undefined;
  const me = isWhite ? game.white : isBlack ? game.black : undefined;
  const them = isWhite ? game.black : isBlack ? game.white : undefined;

  return {
    id: `chesscom:${game.uuid}`,
    platform: "chesscom",
    // Chess.com reports SECONDS. Missing this is a 1970-vs-now bug that looks
    // like the list is simply empty once sorted by date.
    playedAt: (game.end_time ?? 0) * 1000,
    pgn: game.pgn ?? "",
    opponent: them?.username ?? UNKNOWN_OPPONENT,
    opponentRating: them?.rating,
    playerColor,
    playerRating: me?.rating,
    result: resultFromPgn(game.pgn ?? "", playerColor),
    speed: game.time_class,
  };
}

export function normalizeLichessGame(
  game: LichessGame,
  username: string
): RecentGame {
  const white = game.players?.white;
  const black = game.players?.black;
  const isWhite = sameUser(white?.user?.name, username);
  const isBlack = sameUser(black?.user?.name, username);
  const playerColor = isWhite ? "white" : isBlack ? "black" : undefined;
  const me = isWhite ? white : isBlack ? black : undefined;
  const them = isWhite ? black : isBlack ? white : undefined;

  return {
    id: `lichess:${game.id}`,
    platform: "lichess",
    playedAt: game.lastMoveAt ?? 0,
    pgn: game.pgn ?? "",
    // Anonymous and AI opponents have no `user` at all.
    opponent: them?.user?.name ?? UNKNOWN_OPPONENT,
    opponentRating: them?.rating,
    playerColor,
    playerRating: me?.rating,
    result: resultFromPgn(game.pgn ?? "", playerColor),
    speed: game.speed,
  };
}

/**
 * Merge both platforms into one newest-first list.
 *
 * Drops games with no PGN: the only action offered on a row is "Analyze now",
 * and a row that cannot be analysed is worse than no row.
 */
export function mergeRecentGames(
  games: RecentGame[],
  limit = 10
): RecentGame[] {
  const seen = new Set<string>();
  return games
    .filter((g) => {
      if (!g.pgn.trim()) return false;
      if (seen.has(g.id)) return false;
      seen.add(g.id);
      return true;
    })
    .sort((a, b) => b.playedAt - a.playedAt)
    .slice(0, limit);
}
