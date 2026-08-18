import { describe, expect, it } from "vitest";
import {
  mergeRecentGames,
  normalizeChessComGame,
  normalizeLichessGame,
  resultFromPgn,
  type RecentGame,
} from "@/lib/performance/recentGames";
import type { ChessComGame } from "@/types/chessCom";
import type { LichessGame } from "@/types/lichess";

const PGN_WHITE_WIN =
  '[Result "1-0"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0';
const PGN_BLACK_WIN = '[Result "0-1"]\n\n1. f4 e5 2. g4 Qh4# 0-1';
const PGN_DRAW = '[Result "1/2-1/2"]\n\n1. e4 e5 1/2-1/2';
const PGN_UNFINISHED = '[Result "*"]\n\n1. e4 e5 *';

function ccGame(over: Partial<ChessComGame> = {}): ChessComGame {
  return {
    uuid: "abc",
    white: { username: "Aayan", rating: 1400, "@id": "w" },
    black: { username: "Rival", rating: 1450, "@id": "b" },
    end_time: 1_760_000_000,
    pgn: PGN_WHITE_WIN,
    time_class: "rapid",
    ...over,
  } as ChessComGame;
}

function liGame(over: Partial<LichessGame> = {}): LichessGame {
  return {
    id: "xyz",
    speed: "blitz",
    lastMoveAt: 1_760_000_000_000,
    players: {
      white: { user: { id: "rival", name: "Rival" }, rating: 1600 },
      black: { user: { id: "aayan", name: "Aayan" }, rating: 1550 },
    },
    pgn: PGN_BLACK_WIN,
    ...over,
  } as LichessGame;
}

describe("resultFromPgn", () => {
  it("reads the result from the player's perspective", () => {
    expect(resultFromPgn(PGN_WHITE_WIN, "white")).toBe("win");
    expect(resultFromPgn(PGN_WHITE_WIN, "black")).toBe("loss");
    expect(resultFromPgn(PGN_BLACK_WIN, "black")).toBe("win");
    expect(resultFromPgn(PGN_BLACK_WIN, "white")).toBe("loss");
    expect(resultFromPgn(PGN_DRAW, "white")).toBe("draw");
  });

  it("returns undefined for an unfinished game rather than calling it a draw", () => {
    // "*" means adjourned or still in progress. Reporting a draw would be a
    // quiet lie on the one number a player cares most about.
    expect(resultFromPgn(PGN_UNFINISHED, "white")).toBeUndefined();
  });

  it("returns undefined when we cannot tell which side the user played", () => {
    expect(resultFromPgn(PGN_WHITE_WIN, undefined)).toBeUndefined();
  });

  it("returns undefined when the PGN has no Result tag", () => {
    expect(resultFromPgn("1. e4 e5", "white")).toBeUndefined();
  });
});

describe("normalizeChessComGame", () => {
  it("converts end_time from seconds to milliseconds", () => {
    // Chess.com reports SECONDS. Treating them as ms dates every game to 1970,
    // which after a newest-first sort looks like an empty list.
    expect(normalizeChessComGame(ccGame(), "Aayan").playedAt).toBe(
      1_760_000_000_000
    );
  });

  it("identifies the player and opponent when the user is White", () => {
    const g = normalizeChessComGame(ccGame(), "Aayan");
    expect(g.playerColor).toBe("white");
    expect(g.opponent).toBe("Rival");
    expect(g.opponentRating).toBe(1450);
    expect(g.playerRating).toBe(1400);
    expect(g.result).toBe("win");
  });

  it("matches usernames case-insensitively", () => {
    // Platforms are inconsistent about display casing; an exact match would
    // silently mislabel every game as "unknown side".
    const g = normalizeChessComGame(ccGame(), "aAyAn");
    expect(g.playerColor).toBe("white");
  });

  it("degrades gracefully when the user is in neither seat", () => {
    const g = normalizeChessComGame(ccGame(), "SomeoneElse");
    expect(g.playerColor).toBeUndefined();
    expect(g.result).toBeUndefined();
    expect(g.opponent).toBe("Unknown");
  });
});

describe("normalizeLichessGame", () => {
  it("reads a Lichess game from the black seat", () => {
    const g = normalizeLichessGame(liGame(), "Aayan");
    expect(g.platform).toBe("lichess");
    expect(g.playerColor).toBe("black");
    expect(g.opponent).toBe("Rival");
    expect(g.result).toBe("win");
    expect(g.speed).toBe("blitz");
    // Lichess already reports milliseconds — must NOT be scaled again.
    expect(g.playedAt).toBe(1_760_000_000_000);
  });

  it("handles anonymous and AI opponents that carry no user object", () => {
    const g = normalizeLichessGame(
      liGame({
        players: {
          white: { rating: 1500 },
          black: { user: { id: "a", name: "Aayan" } },
        },
      } as Partial<LichessGame>),
      "Aayan"
    );
    expect(g.opponent).toBe("Unknown");
    expect(g.playerColor).toBe("black");
  });

  it("survives a game with no players block at all", () => {
    const g = normalizeLichessGame(liGame({ players: undefined }), "Aayan");
    expect(g.opponent).toBe("Unknown");
    expect(g.playerColor).toBeUndefined();
  });
});

describe("mergeRecentGames", () => {
  const base: RecentGame = {
    id: "a",
    platform: "lichess",
    playedAt: 1,
    pgn: PGN_DRAW,
    opponent: "X",
  };

  it("sorts newest first across platforms", () => {
    const merged = mergeRecentGames([
      { ...base, id: "old", playedAt: 100 },
      { ...base, id: "new", platform: "chesscom", playedAt: 300 },
      { ...base, id: "mid", playedAt: 200 },
    ]);
    expect(merged.map((g) => g.id)).toEqual(["new", "mid", "old"]);
  });

  it("drops games with no PGN", () => {
    // The only action on a row is "Analyze now". A row that cannot be
    // analysed is worse than no row.
    const merged = mergeRecentGames([
      { ...base, id: "keep" },
      { ...base, id: "empty", pgn: "" },
      { ...base, id: "blank", pgn: "   " },
    ]);
    expect(merged.map((g) => g.id)).toEqual(["keep"]);
  });

  it("dedupes by id", () => {
    const merged = mergeRecentGames([
      { ...base, id: "same", playedAt: 2 },
      { ...base, id: "same", playedAt: 1 },
    ]);
    expect(merged).toHaveLength(1);
  });

  it("honours the limit", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      ...base,
      id: `g${i}`,
      playedAt: i,
    }));
    expect(mergeRecentGames(many, 10)).toHaveLength(10);
    expect(mergeRecentGames(many, 10)[0].id).toBe("g29");
  });

  it("returns an empty list for no input", () => {
    expect(mergeRecentGames([])).toEqual([]);
  });
});
