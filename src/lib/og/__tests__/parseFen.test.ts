import { describe, it, expect } from "vitest";
import { parseFenToBoard, sideToMoveFromFen } from "../parseFen";

const STARTING_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("parseFenToBoard", () => {
  it("parses the starting position into an 8×8 grid", () => {
    const board = parseFenToBoard(STARTING_FEN);
    expect(board).toHaveLength(8);
    board.forEach((row) => expect(row).toHaveLength(8));
    // Top-left = a8 = black rook
    expect(board[0][0]).toBe("r");
    // Bottom-right = h1 = white rook
    expect(board[7][7]).toBe("R");
    // White king is on e1 = row 7, file 4
    expect(board[7][4]).toBe("K");
    // Black king is on e8 = row 0, file 4
    expect(board[0][4]).toBe("k");
  });

  it("treats digits as runs of empty squares", () => {
    const board = parseFenToBoard("8/8/8/8/8/8/8/8");
    for (const row of board) {
      for (const sq of row) expect(sq).toBeNull();
    }
  });

  it("parses a real mid-game FEN with mixed runs", () => {
    // Sicilian Najdorf, after 5...a6
    const fen =
      "rnbqkb1r/1p2pppp/p2p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq - 0 6";
    const board = parseFenToBoard(fen);
    // a6 = row 2, file 0 = black pawn
    expect(board[2][0]).toBe("p");
    // d4 = row 4, file 3 = white knight
    expect(board[4][3]).toBe("N");
    // f6 = row 2, file 5 = black knight
    expect(board[2][5]).toBe("n");
  });

  it("falls back to starting position on empty / malformed FEN", () => {
    expect(parseFenToBoard("")[0][0]).toBe("r");
    expect(parseFenToBoard("not-a-fen")[0][0]).toBe("r");
    // Wrong row count
    expect(parseFenToBoard("8/8/8")[0][0]).toBe("r");
    // Wrong file count in one row
    expect(parseFenToBoard("rnbq/8/8/8/8/8/8/RNBQ")[0][0]).toBe("r");
    // Illegal piece letter
    expect(parseFenToBoard("X7/8/8/8/8/8/8/8")[0][0]).toBe("r");
  });

  it("ignores trailing fields and parses only the placement", () => {
    const fen = "8/8/8/8/8/8/8/4K2k w - - 0 1";
    const board = parseFenToBoard(fen);
    expect(board[7][4]).toBe("K");
    expect(board[7][7]).toBe("k");
  });
});

describe("sideToMoveFromFen", () => {
  it("returns w for white-to-move FEN", () => {
    expect(sideToMoveFromFen(STARTING_FEN)).toBe("w");
  });
  it("returns b for black-to-move FEN", () => {
    expect(sideToMoveFromFen("8/8/8/8/8/8/8/8 b - - 0 1")).toBe("b");
  });
  it("defaults to w when the side field is missing", () => {
    expect(sideToMoveFromFen("8/8/8/8/8/8/8/8")).toBe("w");
    expect(sideToMoveFromFen("")).toBe("w");
  });
  it("defaults to w for unrecognized values", () => {
    expect(sideToMoveFromFen("8/8/8/8/8/8/8/8 z - - 0 1")).toBe("w");
  });
});
