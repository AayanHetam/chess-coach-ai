/**
 * Line story (lineStory.ts) — what each ply of a line does, as board facts.
 * Positions are replayed through chess.js in the assertions themselves, so a
 * wrong fixture fails on the replay, not on the detector.
 */
import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import { buildLineStory, projectLineStory } from "../lineStory";

function fenAfter(moves: string, n?: number): string {
  const g = new Chess();
  const list = moves.split(" ");
  for (const m of list.slice(0, n ?? list.length)) g.move(m);
  return g.fen();
}
const F07 = "e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Qb6 Nf3 Qxb2 Na3 Qxa1 Nb5 Qxc1 Nc7+ Kd8 Nxa8 Qxd1+ Kxd1 e5";
const kinds = (story: ReturnType<typeof buildLineStory>, i: number) => story.plies[i].facts.map((f) => f.kind);

describe("the game continuation of fixture 07 from 8.Nc7+", () => {
  const story = buildLineStory(fenAfter(F07, 14), ["Nc7+", "Kd8", "Nxa8", "Qxd1+", "Kxd1", "e5"]);
  it("narrates check + fork, the forced king step, the rook capture, the queen trade", () => {
    expect(kinds(story, 0)).toEqual(["check", "motif"]);
    expect(story.plies[0].sayable).toBe("8.Nc7+ — gives check; forks the king on e8 and the rook on a8");
    expect(kinds(story, 1)).toContain("escapes_check");
    expect(kinds(story, 2)).toContain("capture");
    expect(story.plies[2].sayable).toContain("takes the rook on a8");
    expect(kinds(story, 3)).toEqual(expect.arrayContaining(["check", "capture"]));
    expect(kinds(story, 4)).toEqual(expect.arrayContaining(["capture", "captures_checker", "only_move"]));
  });
  it("keeps the material ledger from the line owner's side (White nets a rook: +5, -9, +9)", () => {
    expect(story.owner).toBe("w");
    expect(story.plies.map((p) => p.netCp)).toEqual([0, 0, 500, -400, 500, 500]);
    expect(story.netMaterialCp).toBe(500);
    expect(projectLineStory(story).at(-1)).toBe("material: White up 5 after 6 shown plies");
  });
  it("a ply with nothing to say stays quiet", () => {
    expect(story.plies[5].facts).toEqual([]);
    expect(story.plies[5].sayable).toBe("10...e5");
  });
});

describe("mates", () => {
  it("a mate-in-two line ends in checkmate and stops there", () => {
    const story = buildLineStory("r1bqB1k1/ppp2ppp/3p4/8/5Q2/5N2/P1P2PPP/b4K1R w - - 0 14", ["Qxf7+", "Kh8", "Qf8#", "Kh7"]);
    expect(story.endsInMate).toBe(true);
    expect(story.plies).toHaveLength(3);
    expect(kinds(story, 2)).toEqual(["checkmate"]);
    expect(projectLineStory(story).at(-1)).toContain("ending in mate");
  });
  it("a checking move narrates the check and whether the checker hangs, not the whole board", () => {
    // Greek gift: while Black is in check every SEE read is distorted, so Bxh7+ must not
    // claim to "attack the d5 pawn"
    const story = buildLineStory("r1bq1rk1/ppp2ppp/2n1pn2/3p4/1bPP4/2NBPN2/PP3PPP/R2QK2R w KQ - 0 8", ["Bxh7+", "Kxh7", "Ng5+", "Kg8", "Qh5"]);
    expect(kinds(story, 0)).toEqual(["check", "capture", "en_prise"]);
    expect(story.plies[0].sayable).toBe("8.Bxh7+ — gives check; takes the pawn on h7; the bishop on h7 can be recaptured");
    expect(story.netMaterialCp).toBe(-200);
    // The 5-ply cut shows no payoff, so the bishop reads as an offer the shown moves never cash in.
    expect(story.unresolvedSacrifice).toMatchObject({ piece: "b", square: "h7", outcome: "not_recovered" });
    expect(projectLineStory(story).at(-1)).toContain("payoff lies beyond these moves");
  });
  it("a mate threat is a fact of the quiet move that creates it", () => {
    // Scholar's mate threat: 3.Qh5 threatens Qxf7#
    const story = buildLineStory("r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR w KQkq - 2 3", ["Qh5"]);
    expect(story.plies[0].facts).toContainEqual({ kind: "threatens_mate", mateSan: "Qxf7#" });
  });
});

describe("a line that offers material the shown moves never cash in", () => {
  it("flags an engine line whose reply simply ignores a free bishop", () => {
    // the synthetic-fixture Ba6 line: the bishop hangs to bxa6 and the PV pretends it does not
    const story = buildLineStory(fenAfter(F07, 8), ["Ba6", "Kd8", "Bb5", "Kc7"]);
    expect(story.plies[0].facts).toContainEqual({ kind: "en_prise", piece: "b", square: "a6", movedPiece: true, afterCapture: false });
    expect(story.unresolvedSacrifice).toMatchObject({ piece: "b", square: "a6", outcome: "declined_in_line" });
    expect(projectLineStory(story).at(-1)).toContain("assumes the capture is declined");
  });
  it("does not flag a normal developing line", () => {
    const story = buildLineStory(new Chess().fen(), ["e4", "e5", "Nf3", "Nc6", "Bb5"]);
    expect(story.unresolvedSacrifice).toBeNull();
    expect(story.plies[2].sayable).toBe("2.Nf3 — attacks the undefended pawn on e5");
    expect(story.plies[3].sayable).toBe("2...Nc6 — defends the pawn on e5");
    expect(story.plies[4].facts).toEqual([]);
  });
});

describe("ledger arithmetic", () => {
  it("credits a promotion as the piece the pawn became", () => {
    // a7-a8=Q: +8 for White (queen 9 minus the pawn 1)
    const story = buildLineStory("8/P6k/8/8/8/8/8/K7 w - - 0 1", ["a8=Q"]);
    expect(story.plies[0].facts).toContainEqual({ kind: "promotion", to: "q" });
    expect(story.netMaterialCp).toBe(800);
  });
  it("names the pawn actually taken en passant", () => {
    // 1.e4 e6 2.e5 d5 3.exd6 e.p. — the captured pawn stood on d5, the pawn lands on d6
    const story = buildLineStory("rnbqkbnr/ppp2ppp/4p3/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3", ["exd6"]);
    expect(story.plies[0].facts).toContainEqual({ kind: "capture", piece: "p", square: "d5", units: 1 });
    expect(story.plies[0].sayable).toContain("takes the pawn on d5");
  });
});

describe("what the adversarial review taught it (2026-09-05)", () => {
  it("a stalemating move is a draw, never a mate threat", () => {
    const story = buildLineStory("k7/8/1K6/8/8/8/8/2Q5 w - - 0 1", ["Qc7"]);
    expect(story.plies[0].facts).toEqual([{ kind: "stalemate" }]);
    expect(story.endsInStalemate).toBe(true);
    expect(projectLineStory(story).at(-1)).toContain("ending in stalemate");
  });
  it("names a double check, and a knight check that uncovers an attack on the queen is not a 'discovered check'", () => {
    const dbl = buildLineStory("r2bk3/3p1p2/4N3/8/8/8/8/4R1K1 w - - 0 1", ["Nc7+", "Kf8"]);
    expect(dbl.plies[0].facts[0]).toEqual({ kind: "double_check" });
    expect(dbl.plies[1].facts).toContainEqual({ kind: "only_move" });
    const knight = buildLineStory("6k1/5q2/8/3N4/8/1B6/8/6K1 w - - 0 1", ["Ne7+"]);
    expect(knight.plies[0].sayable).not.toContain("discovered check");
    expect(knight.plies[0].sayable).toContain("uncovers the bishop on b3 against the queen on f7");
  });
  it("a forced recapture of a decoy queen 'allows mate', it does not 'threaten' one", () => {
    const story = buildLineStory("r3r1k1/p4ppp/1q6/8/8/4Q3/5PPP/4R1K1 w - - 0 1", ["Qxe8+", "Rxe8", "Rxe8#"]);
    const s1 = story.plies[1].facts.map((f) => f.kind);
    expect(s1).toContain("allows_mate");
    expect(s1).toContain("only_move");
    expect(s1).not.toContain("threatens_mate");
    expect(story.endsInMate).toBe(true);
  });
  it("runs on past maxPlies while the line stays forcing, so it never stops one ply short of the mate", () => {
    const roller = buildLineStory("8/8/8/3k4/8/8/R7/1R4K1 w - - 0 1", ["Ra5+", "Kd6", "Rb6+", "Kd7", "Ra7+", "Kd8", "Rb8#"]);
    expect(roller.endsInMate).toBe(true);
    expect(roller.plies).toHaveLength(7);
    const exchange = buildLineStory("r1b1kbnr/pp1ppppp/2n5/8/4P3/N4N2/P1P2PPP/q1BQKB1R w Kkq - 0 7", ["Nb5", "Qxc1", "Nc7+", "Kd8", "Nxa8", "Qxd1+", "Kxd1", "e5"]);
    expect(exchange.plies).toHaveLength(8);
    expect(exchange.netMaterialCp).toBe(200);
  });
  it("a piece that was already lost is a desperado, not an offer; a fair trade is not a hanging piece", () => {
    const desperado = buildLineStory("r1b1k3/p4ppp/3p4/4N3/8/8/P4PPP/5RK1 w - - 0 1", ["Nxf7", "Kxf7"]);
    expect(desperado.unresolvedSacrifice).toBeNull();
    const trade = buildLineStory("r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4", ["Bxc6", "Nf6", "Bxd7+", "Qxd7"]);
    expect(trade.unresolvedSacrifice).toBeNull();
    expect(trade.plies[0].facts.some((f) => f.kind === "en_prise")).toBe(false);
  });
  it("an offer is paid for by a fork after the capture, not by the opponent's mate threat", () => {
    const paid = buildLineStory("5rk1/pp4pp/1q6/4N3/8/5Q2/PP4PP/7K w - - 0 1", ["Qxf8+", "Kxf8", "Nd7+", "Ke7"]);
    expect(paid.unresolvedSacrifice).toBeNull();
    const unpaid = buildLineStory("r2q1rk1/1pp2ppp/p2p4/2b1p3/4P1n1/2NP4/PPQ2PPP/R1B2RK1 w - - 0 1", ["Nb5", "axb5", "a3", "Qh4"]);
    expect(unpaid.unresolvedSacrifice).toMatchObject({ piece: "n", square: "b5", outcome: "not_recovered" });
  });
  it("a pinned interposer and a king that cannot take are not credited with attacks", () => {
    expect(buildLineStory("6k1/4qppp/8/8/3r4/8/PB3PPP/4K1N1 w - - 0 1", ["Ne2"]).plies[0].facts).toEqual([{ kind: "blocks_check" }]);
    expect(buildLineStory("4r1k1/5ppp/8/1n6/8/2r5/5PPP/B3K3 w - - 0 1", ["Kd2"]).plies[0].facts).toEqual([{ kind: "escapes_check" }]);
  });
  it("respects relative pins: a pawn guarded only by a pinned knight is not en prise, and a pinned knight defends nothing", () => {
    const pawn = buildLineStory("6k1/pp3ppp/3p4/2P1p3/6b1/5N2/PP3PPP/3Q2K1 b - - 0 1", ["dxc5"]);
    expect(pawn.plies[0].facts.some((f) => f.kind === "en_prise")).toBe(false);
    const knight = buildLineStory("6k1/5ppp/1b6/8/3N2b1/3P4/5PPP/3R2NK w - - 0 1", ["Ngf3"]);
    expect(knight.plies[0].facts.some((f) => f.kind === "defends")).toBe(false);
  });
  it("a checking move that abandons another piece is charged for it at the mover's next ply", () => {
    const story = buildLineStory("3rk3/2p1p1pp/8/8/8/3B4/P3QPPP/6K1 w - - 0 1", ["Qh5+", "g6", "Qh4", "Rxd3"]);
    expect(story.plies[2].facts).toContainEqual({ kind: "en_prise", piece: "b", square: "d3", movedPiece: false, afterCapture: false });
  });
  it("a reply that defuses a mate threat says so, and a mate threat suspends other costs", () => {
    const story = buildLineStory("r1bq1rk1/pppnbppp/2n1p3/3pP3/3P4/2NB1N2/PPP2PPP/R1BQ1RK1 w - - 0 1", ["Bxh7+", "Kxh7", "Ng5+", "Kg8", "Qh5", "Re8"]);
    expect(story.plies[4].facts).toEqual([{ kind: "threatens_mate", mateSan: "Qh7#" }]);
    expect(story.plies[5].facts.map((f) => f.kind)).toContain("parries_mate");
  });
  it("a check delivered by the uncovered piece is a discovered check", () => {
    // Bishop on b3 hidden behind the knight on d5; the knight steps aside with the bishop giving check
    const story = buildLineStory("6k1/8/8/3N4/8/1B6/8/6K1 w - - 0 1", ["Nf6+"]);
    expect(story.plies[0].facts[0]).toEqual({ kind: "double_check" });
    const quiet = buildLineStory("6k1/8/8/3N4/8/1B6/8/6K1 w - - 0 1", ["Nc3+"]);
    expect(quiet.plies[0].facts[0]).toEqual({ kind: "discovered_check" });
    expect(quiet.plies[0].sayable).toBe("1.Nc3+ — discovered check");
  });
  it("castling credits the rook's new attack", () => {
    const story = buildLineStory("6k1/6pp/8/5b2/8/8/P5PP/4K2R w K - 0 1", ["O-O"]);
    expect(story.plies[0].facts.some((f) => f.kind === "attacks" && f.square === "f5")).toBe(true);
  });
});

describe("robustness", () => {
  it("truncates at an unreplayable ply and past maxPlies without throwing", () => {
    const story = buildLineStory(new Chess().fen(), ["e4", "e5", "Qxz9", "Nf3"]);
    expect(story.plies).toHaveLength(2);
    expect(story.truncated).toBe(true);
    const long = buildLineStory(new Chess().fen(), ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6"], { maxPlies: 3 });
    expect(long.plies).toHaveLength(3);
    expect(long.truncated).toBe(true);
  });
  it("an invalid FEN yields an empty, truncated story", () => {
    const story = buildLineStory("not a fen", ["e4"]);
    expect(story.plies).toEqual([]);
    expect(story.truncated).toBe(true);
  });
  it("projects one 's<j>' string per ply", () => {
    const story = buildLineStory(fenAfter(F07, 14), ["Nc7+", "Kd8"]);
    expect(projectLineStory(story)).toEqual([
      "s0 8.Nc7+ — gives check; forks the king on e8 and the rook on a8",
      "s1 8...Kd8 — the king steps out of check; the only legal move; attacks the knight on c7",
      "material: material level for White after 2 shown plies",
    ]);
  });
});
