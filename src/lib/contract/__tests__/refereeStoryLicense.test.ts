/**
 * Verbalizer 4.1 — line-story licensing is SENTENCE-scoped.
 *
 * A story can truthfully say "forks" about ply 3 of a sideline. That fact
 * must license the word only in a sentence that cites that ply (or that
 * line), never anywhere in the card — otherwise deep sidelines would widen
 * the tactical-keyword license the 30-game FP measurement was built on.
 */
import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import { checkTacticalKeywords, storyLicensesKeyword } from "../refereeChecks";
import { buildLineStory } from "../lineStory";
import { lineFact, makeInsight } from "./insightFactory";

function fenAfter(moves: string, n: number): string {
  const g = new Chess();
  moves.split(" ").slice(0, n).forEach((m) => g.move(m));
  return g.fen();
}
const F07 = "e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Qb6 Nf3 Qxb2 Na3 Qxa1 Nb5 Qxc1 Nc7+ Kd8 Nxa8 Qxd1+ Kxd1 e5";
const fen = fenAfter(F07, 14);
// real stories: the game continuation forks on s0; the engine line is quiet
const gameStory = buildLineStory(fen, ["Nc7+", "Kd8", "Nxa8", "Qxd1+", "Kxd1"]);
const quiet = buildLineStory(fen, ["Bc4", "Kd8", "Bb3"]);
const insight = makeInsight({
  factIdPrefix: "M1",
  fenBefore: fen,
  playedSan: "Nc7+",
  motifs: [], // nothing licensed card-wide
  motifLicense: [],
  allowedTacticalKeywords: [],
  lines: [{ ...lineFact("M1.pv0", ["Bc4", "Kd8", "Bb3"], ["f1c4", "e8d8", "c4b3"], {}), story: quiet }],
  gameStory,
});

describe("storyLicensesKeyword", () => {
  it("licenses a keyword only through a citation of the ply that backs it", () => {
    expect(gameStory.plies[0].facts.some((f) => f.kind === "motif" && f.motif.motif === "fork")).toBe(true);
    expect(storyLicensesKeyword("fork", "The knight check forks king and rook [F:M1.game.s0].", insight)).toBe(true);
    expect(storyLicensesKeyword("fork", "The knight check forks king and rook [F:M1.game].", insight)).toBe(true);
    expect(storyLicensesKeyword("fork", "The knight check forks king and rook [F:M1.game.s1].", insight)).toBe(false);
    expect(storyLicensesKeyword("fork", "The knight check forks king and rook [F:M1].", insight)).toBe(false);
    expect(storyLicensesKeyword("fork", "The bishop retreat forks nothing [F:M1.pv0].", insight)).toBe(false);
  });
  it("maps each keyword to its own fact family", () => {
    // 8...Kd8 attacks the undefended knight on c7 → "hanging" is backed by s1, "trapped" is not
    expect(storyLicensesKeyword("hanging", "the knight is hanging [F:M1.game.s1]", insight)).toBe(true);
    expect(storyLicensesKeyword("trapped", "the knight is trapped [F:M1.game.s1]", insight)).toBe(false);
  });
});

describe("checkTacticalKeywords honours the story citation", () => {
  // (sentences name a square: a sentence with no square, SAN or piece-on-square is
  // exempt as definitional prose — refereeChecks.isDefinitionalSentence)
  it("a cited story fact silences the fire; the same claim uncited still fires", () => {
    const cited = checkTacticalKeywords("Your check on c7 forks the king on e8 and the rook on a8 [F:M1.game.s0].", insight);
    expect(cited).toEqual([]);
    const uncited = checkTacticalKeywords("Your check on c7 forks the king on e8 and the rook on a8 [F:M1].", insight);
    expect(uncited.map((v) => v.span)).toContain("fork");
  });
  it("a story fact in one line does not license the word in a sentence citing another line", () => {
    const wrongLine = checkTacticalKeywords("The bishop on c4 forks two pieces [F:M1.pv0.s0].", insight);
    expect(wrongLine.map((v) => v.span)).toContain("fork");
  });
});
