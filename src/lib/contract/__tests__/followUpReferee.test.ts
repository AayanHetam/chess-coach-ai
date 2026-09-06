/**
 * Follow-up referee — the chat path's sentence-level enforcement.
 *
 * Fixture 07 throughout: White's 8.Nc7+ (played) vs 8.Qxc1 (engine best),
 * Black's 7...Qxc1 one ply earlier, the game continuation Kd8 Nxa8 Qxd1+ Kxd1.
 * The compact contract carries the review's line story and the game story,
 * exactly as toCompactContract builds it.
 */
import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import { toCompactContract } from "../followUp";
import { buildLineStory } from "../lineStory";
import { FOLLOWUP_REFEREE_FALLBACK, refereeFollowUp } from "../followUpReferee";
import { lineFact, makeContract, makeInsight } from "./insightFactory";

const MOVES = "e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Qb6 Nf3 Qxb2 Na3 Qxa1 Nb5 Qxc1 Nc7+ Kd8 Nxa8 Qxd1+ Kxd1 e5".split(" ");
function fenAfter(n: number): string {
  const g = new Chess();
  MOVES.slice(0, n).forEach((m) => g.move(m));
  return g.fen();
}
const fenBefore8 = fenAfter(14);
const insight = makeInsight({
  factIdPrefix: "M1",
  moveNumber: 8,
  color: "w",
  colorName: "White",
  playedSan: "Nc7+",
  bestSan: "Qxc1",
  fenBefore: fenBefore8,
  motifs: [],
  allowedTacticalKeywords: [],
  evalBefore: { cp: 284, mate: null, depth: 16, sentinel: false, display: "+2.84", provenance: { source: "stockfish_client", confidence: "client_reported", depth: 16 } },
  evalAfter: { cp: -211, mate: null, depth: 16, sentinel: false, display: "-2.11", provenance: { source: "stockfish_client", confidence: "client_reported", depth: 16 } },
  lines: [{ ...lineFact("M1.pv0", ["Qxc1", "Rb8", "Qf4"], ["d1c1", "a8b8", "c1f4"], { cp: 284, display: "+2.84" }), story: buildLineStory(fenBefore8, ["Qxc1", "Rb8", "Qf4"]) }],
  gameStory: buildLineStory(fenBefore8, ["Nc7+", "Kd8", "Nxa8", "Qxd1+", "Kxd1"]),
  // the review's own board read before 8.Nc7+: Black's queen on c1 stood undefended
  sayables: { motifs: [], relationalCaptures: [], relationalHanging: ["The q on c1 is undefended."], relationalPins: [] },
});
const compact = toCompactContract(makeContract([insight]), ["M1"]);
const finalFen = fenAfter(MOVES.length);
const run = (reply: string, activeFen = finalFen) => refereeFollowUp({ reply, compact, activeFen, moveHistory: MOVES });

describe("legacy contexts pass through", () => {
  it("does nothing without a compact contract", () => {
    const r = refereeFollowUp({ reply: "The rook on c8 is hanging to a skewer.", compact: null, activeFen: finalFen, moveHistory: MOVES });
    expect(r.applied).toBe(false);
    expect(r.text).toBe("The rook on c8 is hanging to a skewer.");
  });
});

describe("tactical words need a licence", () => {
  it("keeps a fork the game story confirms and drops a skewer nothing backs", () => {
    const r = run("Your knight check on c7 forks the king on e8 and the rook on a8. Black then had a skewer along the c-file with the rook on c8.");
    expect(r.text).toBe("Your knight check on c7 forks the king on e8 and the rook on a8.");
    expect(r.dropped).toEqual([{ sentence: "Black then had a skewer along the c-file with the rook on c8.", reason: "tactical:skewer" }]);
  });
  it("licenses 'hanging' from the story, or from the board under discussion", () => {
    // the game story says the queen on c1 could be taken / the knight on c7 is attacked
    expect(run("The queen on c1 was hanging with no defenders.").dropped).toEqual([]);
    // a board with a genuinely hanging piece licenses the word even with an empty pool
    const bare = toCompactContract(
      makeContract([makeInsight({ motifs: [], allowedTacticalKeywords: [], lines: [], sayables: { motifs: [], relationalCaptures: [], relationalHanging: [], relationalPins: [] } })]),
      null,
    );
    const hangingBoard = "3rk3/8/8/3N4/8/8/8/4K3 w - - 0 1"; // White's d5 knight hangs to the d8 rook
    const r = refereeFollowUp({ reply: "Your knight on d5 is hanging.", compact: bare, activeFen: hangingBoard, moveHistory: [] });
    expect(r.dropped).toEqual([]);
  });
  it("definitional prose is exempt", () => {
    expect(run("A fork is when one piece attacks two enemy pieces at once.").dropped).toEqual([]);
  });
});

describe("moves in notation need a licence", () => {
  it("keeps game moves and engine-line moves, drops an invented one", () => {
    const r = run("After 8. Qxc1 Rb8 9. Qf4 you are a queen up. Instead 8. Nc7+ Kd8 9. Nxa8 walked into Qxd1+. Your best was 8. Bg5 with pressure.");
    expect(r.dropped.map((d) => d.reason)).toEqual(["san:Bg5"]);
    expect(r.text).toContain("8. Qxc1 Rb8 9. Qf4");
    expect(r.text).not.toContain("Bg5");
  });
  it("accepts a move that is legal on the board under discussion, and a line that follows from it", () => {
    // final position: White to move after 10...e5 — Kc2 is legal; a two-move sequence stays legal in order
    const r = run("From here you could play Ke2, and after Ke7 the king walks to b3.");
    expect(r.dropped).toEqual([]);
  });
  it("a bare square is not a move", () => {
    expect(run("The pawn on e5 is now a target.").dropped).toEqual([]);
  });
  it("a move with a move number is checked where the coach put it", () => {
    // 8.Ne6 was legal for White at move 8 (knight from b5? no — from c7 it had not moved); Nd6+ was legal at move 8 from b5
    expect(run("You also had 8. Nd6+ there.").dropped).toEqual([]);
    expect(run("You also had 8. Nh6 there.").dropped).toEqual([{ sentence: "You also had 8. Nh6 there.", reason: "san:Nh6" }]);
  });
});

describe("pieces on squares must be there, and belong to who the sentence says", () => {
  it("drops the founder-class inventions: the wrong owner, a piece that is not there", () => {
    // Black's queen stood on c1 before 8.Nc7+; the player is White
    expect(run("Your queen on c1 is hanging with no defenders.").dropped).toEqual([{ sentence: "Your queen on c1 is hanging with no defenders.", reason: "piece:Your queen on c1" }]);
    expect(run("Your opponent's queen on c1 was hanging.").dropped).toEqual([]);
    expect(run("Your opponent's rook on c8 is attacking it.").dropped.map((d) => d.reason)).toEqual(["piece:opponent's rook on c8"]);
    // a piece that stood there on a reviewed board, though not on the final one, is fine
    expect(run("The knight on b5 jumped to c7.").dropped).toEqual([]);
  });
  it("catches an invented checkmate threat", () => {
    expect(run("After 18. Rh5, Black must deal with this mating threat immediately.").dropped.map((d) => d.reason)).toEqual(["tactical:mate threat"]);
  });
});

describe("evals need a licence", () => {
  it("keeps the displayed figures and drops an invented one", () => {
    const r = run("The position was +2.84 before your move and -2.11 after. The engine had it at +7.5 earlier.");
    expect(r.dropped).toEqual([{ sentence: "The engine had it at +7.5 earlier.", reason: "eval:+7.5" }]);
  });
  it("an extra licensed eval table is honoured", () => {
    const r = refereeFollowUp({ reply: "You were +7.16 after move 5.", compact, activeFen: finalFen, moveHistory: MOVES, licensedEvals: ["+7.16"] });
    expect(r.dropped).toEqual([]);
  });
});

describe("shape of the result", () => {
  it("keeps bullets and paragraphs, and falls back honestly when nothing survives", () => {
    const r = run("**Why it failed:**\n- Your check on c7 forked the king on e8 and the rook on a8.\n- The bishop on g4 skewers the queen.\n\nTakeaway: count before you fork.");
    expect(r.text).toBe("**Why it failed:**\n- Your check on c7 forked the king on e8 and the rook on a8.\n\nTakeaway: count before you fork.");
    const empty = run("The rook on c8 pins the queen after 8. Bg5.");
    expect(empty.text).toBe(FOLLOWUP_REFEREE_FALLBACK);
    expect(empty.dropped).toHaveLength(1);
  });
});
