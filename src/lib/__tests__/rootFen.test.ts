import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";

import { getRootFen, boardFromRoot, replayFromRoot } from "../chess";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
// Scholar's-mate setup: white queen on h5. Nothing like the start position.
const CUSTOM = "rnbqkbnr/pppp1ppp/8/4p2Q/4P3/8/PPPP1PPP/RNB1KBNR b KQkq - 1 2";

/**
 * Replaying a game from the wrong starting position.
 *
 * /analysis replayed every game with `new Chess()`, which is the standard
 * start position. For a game loaded from a FEN there are no moves to replay,
 * so the result WAS the start position: the board, the eval bar, the Lines
 * tab and the coach's context all described a position the user never asked
 * for, underneath a greeting that said "Loaded a custom position". Reproduced
 * live on prod before the fix.
 */
describe("root position of a loaded game", () => {
  it("recovers the FEN from a game built with new Chess(fen)", () => {
    // This is the `?fen=` path.
    expect(getRootFen(new Chess(CUSTOM))).toBe(CUSTOM);
  });

  it("recovers the FEN from a PGN carrying a SetUp/FEN header", () => {
    // This is the `?puzzleFen=` path.
    const g = new Chess();
    g.loadPgn(`[FEN "${CUSTOM}"]\n[SetUp "1"]\n*`);
    expect(getRootFen(g)).toBe(CUSTOM);
  });

  it("returns undefined for an ordinary PGN, meaning the start position", () => {
    const g = new Chess();
    g.loadPgn("1. e4 e5 2. Nf3 Nc6 *");
    expect(getRootFen(g)).toBeUndefined();
  });

  it("replays a FEN-loaded game to its own position, not the start", () => {
    const game = new Chess(CUSTOM);
    const { board } = replayFromRoot(game.history({ verbose: true }), 0, getRootFen(game));
    // The regression, exactly: this returned the start position.
    expect(board.fen()).not.toBe(START);
    expect(board.fen()).toBe(CUSTOM);
  });

  it("replays moves played on top of a FEN start", () => {
    const game = new Chess(CUSTOM);
    game.move("Nc6");
    game.move("Bc4");
    const moves = game.history({ verbose: true });
    const root = getRootFen(game);

    const { board: atZero } = replayFromRoot(moves, 0, root);
    expect(atZero.fen()).toBe(CUSTOM);

    const { board: atTwo, lastMove } = replayFromRoot(moves, 2, root);
    expect(atTwo.fen()).toBe(game.fen());
    expect(lastMove?.san).toBe("Bc4");
  });

  it("still replays an ordinary game from the standard position", () => {
    const game = new Chess();
    ["e4", "e5", "Nf3"].forEach((m) => game.move(m));
    const { board, lastMove } = replayFromRoot(
      game.history({ verbose: true }),
      3,
      getRootFen(game)
    );
    expect(board.fen()).toBe(game.fen());
    expect(lastMove?.san).toBe("Nf3");
  });

  it("falls back to the start position rather than throwing on a bad FEN", () => {
    // A malformed ?fen= must not take the page down mid-render.
    expect(boardFromRoot("not a fen").fen()).toBe(START);
    expect(boardFromRoot(undefined).fen()).toBe(START);
  });

  it("stops at the last legal move instead of throwing", () => {
    const { board } = replayFromRoot(["e4", "e5", "Qxq9"], 3, undefined);
    expect(board.history()).toEqual(["e4", "e5"]);
  });
});
