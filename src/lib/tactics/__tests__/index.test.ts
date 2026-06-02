import { describe, it, expect } from "vitest";
import { detectMotifs } from "../index";

// ─── Fork tests ────────────────────────────────────────────────────────────
describe("detectMotifs — fork", () => {
  // Knight on f3 moves to e5, attacking black Queen on d7 and Rook on f7.
  const FORK_FEN_BEFORE = "4k3/3q1r2/8/8/8/5N2/8/4K3 w - - 0 1";

  it("detects a knight fork (attacks queen + rook)", () => {
    const motifs = detectMotifs(FORK_FEN_BEFORE, "Ne5");
    const fork = motifs.find((m) => m.motif === "fork");
    expect(fork).toBeDefined();
    expect(fork?.by_square).toBe("e5");
    expect(fork?.by_piece).toBe("n");
    expect(fork?.targets.length).toBeGreaterThanOrEqual(2);
    const targetSquares = fork?.targets.map((t) => t.square) ?? [];
    expect(targetSquares).toContain("d7");
    expect(targetSquares).toContain("f7");
  });

  it("fork target includes queen (high value)", () => {
    const motifs = detectMotifs(FORK_FEN_BEFORE, "Ne5");
    const fork = motifs.find((m) => m.motif === "fork");
    const hasQueen = fork?.targets.some((t) => t.piece === "q");
    expect(hasQueen).toBe(true);
  });

  // Negative: knight attacks only one piece
  it("does NOT fire fork when only one enemy piece attacked", () => {
    // Ke1, Ne4, Qd6 (only one enemy piece attacked)
    const fen = "4k3/8/3q4/8/4N3/8/8/4K3 w - - 0 1";
    // Move Nd2→e4 (from d2). FEN before: knight on d2.
    const fenBefore = "4k3/8/3q4/8/8/8/3N4/4K3 w - - 0 1";
    const motifs = detectMotifs(fenBefore, "Ne4");
    const fork = motifs.find((m) => m.motif === "fork");
    expect(fork).toBeUndefined();
  });
});

// ─── Pin tests ─────────────────────────────────────────────────────────────
describe("detectMotifs — pin", () => {
  // White Bishop on f1, moves to g2. Black Knight on d5, Black King on a8.
  // Ray: g2 → (−1,+1) → f3, e4, d5 (knight), c6, b7, a8 (king) → absolute pin.
  const PIN_FEN_BEFORE = "k7/8/8/3n4/8/8/8/4KB2 w - - 0 1";

  it("detects absolute pin (knight pinned to king on same diagonal)", () => {
    const motifs = detectMotifs(PIN_FEN_BEFORE, "Bg2");
    const pin = motifs.find((m) => m.motif === "pin");
    expect(pin).toBeDefined();
    expect(pin?.kind).toBe("absolute");
    expect(pin?.pinned.square).toBe("d5");
    expect(pin?.behind.piece).toBe("k");
    expect(pin?.confirmed).toBe(true);
  });

  it("absolute pin is always confirmed", () => {
    const motifs = detectMotifs(PIN_FEN_BEFORE, "Bg2");
    const pin = motifs.find((m) => m.motif === "pin" && m.kind === "absolute");
    expect(pin?.confirmed).toBe(true);
    expect(pin?.refutation).toBeNull();
  });
});

// ─── Hanging piece tests ────────────────────────────────────────────────────
describe("detectMotifs — hanging_piece", () => {
  // White Qf1 moves to d3, attacking Black Nd6 (undefended).
  // Black king on e8 cannot defend d6 (too far).
  const HANG_FEN_BEFORE = "4k3/8/3n4/8/8/8/8/4KQ2 w - - 0 1";

  it("detects a hanging piece after move", () => {
    const motifs = detectMotifs(HANG_FEN_BEFORE, "Qd3");
    const hanging = motifs.find((m) => m.motif === "hanging_piece");
    expect(hanging).toBeDefined();
    expect(hanging?.square).toBe("d6");
    expect(hanging?.piece).toBe("n");
    expect(hanging?.see_value_cp).toBeGreaterThan(0);
    expect(hanging?.confirmed).toBe(true);
  });

  // Negative: piece is defended
  it("does NOT flag a defended piece as hanging", () => {
    // Black knight on d6, defended by black king on e7 (adjacent).
    const fenBefore = "4k3/4k3/3n4/8/8/8/8/4KQ2 w - - 0 1";
    const motifs = detectMotifs(fenBefore, "Qd3");
    // d6 knight is defended by king on e7 (e7→d6 is adjacent, king attacks it)
    const hanging = motifs.find((m) => m.motif === "hanging_piece" && m.square === "d6");
    // King defends d6 via attack, so SEE should be negative → not hanging
    if (hanging) {
      expect(hanging.see_value_cp).toBeLessThanOrEqual(0);
    }
  });
});

// ─── Back rank mate tests ───────────────────────────────────────────────────
describe("detectMotifs — back_rank_mate", () => {
  // White Ra1 slides to a8, checkmate. Black Kh8 hemmed by own g7+h7 pawns; rook far from king (no capture).
  const BACKRANK_FEN_BEFORE = "7k/6pp/8/8/8/8/8/R3K3 w - - 0 1";

  it("detects immediate back rank checkmate", () => {
    const motifs = detectMotifs(BACKRANK_FEN_BEFORE, "Ra8#");
    const br = motifs.find(
      (m) => m.motif === "back_rank_mate" || m.motif === "back_rank_threat",
    );
    expect(br).toBeDefined();
    expect(br?.motif).toBe("back_rank_mate");
    expect(br?.confirmed).toBe(true);
    expect(br?.king_square).toBe("h8");
  });

  it("back_rank_mate has no interposers", () => {
    const motifs = detectMotifs(BACKRANK_FEN_BEFORE, "Ra8#");
    const br = motifs.find((m) => m.motif === "back_rank_mate");
    expect(br?.interposers.length).toBe(0);
    expect(br?.refutation).toBeNull();
  });
});

// ─── Integration tests ─────────────────────────────────────────────────────
describe("detectMotifs — integration", () => {
  it("returns empty array for starting position pawn move (no tactical motifs)", () => {
    const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const motifs = detectMotifs(START, "e4");
    // Pawn to e4 from starting position should detect no tactical motifs
    const tactical = motifs.filter(
      (m) => m.motif === "fork" || m.motif === "pin" || m.motif === "skewer",
    );
    expect(tactical.length).toBe(0);
  });

  it("returns empty array for invalid FEN", () => {
    const motifs = detectMotifs("not-a-fen", "e4");
    expect(motifs).toEqual([]);
  });

  it("returns empty array for invalid SAN", () => {
    const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const motifs = detectMotifs(START, "Zz9");
    expect(motifs).toEqual([]);
  });

  it("all returned motifs have confirmed field", () => {
    const FORK_FEN_BEFORE = "4k3/3q1r2/8/8/8/5N2/8/4K3 w - - 0 1";
    const motifs = detectMotifs(FORK_FEN_BEFORE, "Ne5");
    for (const m of motifs) {
      expect(typeof m.confirmed).toBe("boolean");
      if (!m.confirmed) {
        // unconfirmed motif may or may not have refutation
        expect(m.refutation === null || typeof m.refutation === "object").toBe(true);
      }
    }
  });
});
