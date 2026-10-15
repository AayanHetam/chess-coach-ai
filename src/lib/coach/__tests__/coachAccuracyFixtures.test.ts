/**
 * The regression games and their engine truth are evidence for every other
 * coach-accuracy test, so they are checked first: Game B's PGN against the
 * game's own move list from chess.com, every stored position against the
 * PGN replay, and the engine facts the bug reports rest on.
 */
import fs from "node:fs";
import path from "node:path";
import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import {
  FIXTURE_DIR,
  loadEngineTruth,
  loadGame,
  truthAt,
  type GameId,
} from "./coachAccuracyFixtures";

/** chess.com's TCN: two characters per move, one per square (a1 = "a"), promotions above 63. */
function decodeTcn(tcn: string): string[] {
  const alphabet =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!?{~}(^)[_]@#$,./&-*++=";
  const sq = (i: number) => `${"abcdefgh"[i % 8]}${Math.floor(i / 8) + 1}`;
  const out: string[] = [];
  for (let k = 0; k < tcn.length; k += 2) {
    const from = alphabet.indexOf(tcn[k]);
    let to = alphabet.indexOf(tcn[k + 1]);
    let promo = "";
    if (to > 63) {
      promo = "qnrbkp"[Math.floor((to - 64) / 3)];
      to = from + (from < 16 ? -8 : 8) + ((to - 64) % 3) - 1;
    }
    out.push(`${sq(from)}${sq(to)}${promo}`);
  }
  return out;
}

/** Can the side to move force mate within `moves` of its own moves? Brute force, checks first. */
function forcedMate(fen: string, moves: number): boolean {
  const g = new Chess(fen);
  const candidates = g
    .moves({ verbose: true })
    .sort((a, b) => Number(b.san.includes("+")) - Number(a.san.includes("+")));
  for (const m of candidates) {
    g.move(m.san);
    if (g.isCheckmate()) return true;
    if (moves > 1 && !g.isGameOver()) {
      const replies = g.moves();
      const allMated = replies.every((r) => {
        g.move(r);
        const mated = forcedMate(g.fen(), moves - 1);
        g.undo();
        return mated;
      });
      if (allMated) return true;
    }
    g.undo();
  }
  return false;
}

describe("coach-accuracy fixtures", () => {
  it("Game B's PGN is the game chess.com recorded, move for move", () => {
    const source = JSON.parse(
      fs.readFileSync(path.join(FIXTURE_DIR, "game-b.source.json"), "utf8")
    );
    const game = loadGame("gameB");
    expect(game.uci).toEqual(decodeTcn(source.moveList));
    expect(game.sans).toHaveLength(source.plyCount);
    expect(game.sans.at(-1)).toBe("g4#");
    expect(new Chess(game.fens.at(-1)).isCheckmate()).toBe(true);
  });

  it("the Opera Game replays to 17.Rd8#", () => {
    const game = loadGame("operaGame");
    expect(game.sans).toHaveLength(33);
    expect(game.sans.at(-1)).toBe("Rd8#");
    expect(game.sans[18]).toBe("Nxb5");
    expect(game.sans[19]).toBe("cxb5");
  });

  it("every stored position is the PGN's position, and every stored line replays", () => {
    const truth = loadEngineTruth();
    expect(truth.pov).toBe("white");
    for (const id of ["operaGame", "gameB"] as GameId[]) {
      const game = loadGame(id);
      for (const depth of ["16", "20"]) {
        const positions = truth.games[id].depths[depth];
        expect(positions).toHaveLength(game.fens.length);
        for (const p of positions) {
          expect(p.fen).toBe(game.fens[p.ply]);
          expect(p.engineName).toBe(truth.engineName);
          expect(p.version).toBe(truth.version);
          expect(p.depth).toBe(Number(depth));
          if (p.terminal) continue;
          expect(p.lines.length).toBeGreaterThan(0);
          for (const line of p.lines) {
            const g = new Chess(p.fen);
            for (const u of line.pv)
              g.move({
                from: u.slice(0, 2),
                to: u.slice(2, 4),
                promotion: u[4],
              });
            expect((line.evalCp === null) !== (line.mateIn === null)).toBe(
              true
            );
          }
        }
      }
    }
  });

  describe("Game B, the engine facts the bug reports rest on (d20)", () => {
    const san = (fen: string, uci: string) =>
      new Chess(fen).move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci[4],
      }).san;

    it("9...Qxb2 is a mistake and 10.Nb5 is the only good reply", () => {
      expect(
        truthAt("gameB", 20, 18).evalCp! - truthAt("gameB", 20, 17).evalCp!
      ).toBeGreaterThan(150);
      const before10 = truthAt("gameB", 20, 18);
      expect(san(before10.fen, before10.bestMove!)).toBe("Nb5");
      expect(
        before10.lines[0].evalCp! - before10.lines[1].evalCp!
      ).toBeGreaterThan(150);
    });

    it("12.Rb1 is the engine's 12th move at d20, 12.Bd3 at d16; 12.Ng5 is well behind both", () => {
      const d20 = truthAt("gameB", 20, 22);
      expect(san(d20.fen, d20.bestMove!)).toBe("Rb1");
      const ng5 = d20.lines.find((l) => l.pv[0] === "f3g5");
      expect(d20.evalCp! - ng5!.evalCp!).toBeGreaterThan(100);
      const d16 = truthAt("gameB", 16, 22);
      expect(san(d16.fen, d16.bestMove!)).toBe("Bd3");
    });

    it("before move 15 White has mate in 3 with 15.Nxe6+, and every reply to it is mated", () => {
      const before15 = truthAt("gameB", 20, 28);
      expect(before15.mateIn).toBe(3);
      expect(san(before15.fen, before15.bestMove!)).toBe("Nxe6+");
      const g = new Chess(before15.fen);
      g.move("Nxe6+");
      const replies = g.moves();
      expect(replies).toEqual(expect.arrayContaining(["fxe6", "Bxe6"]));
      for (const reply of replies) {
        g.move(reply);
        expect(forcedMate(g.fen(), 2)).toBe(true);
        g.undo();
      }
    });

    it("15.Qh7+ throws the mate away but keeps a winning position", () => {
      const after = truthAt("gameB", 20, 29);
      expect(after.mateIn).toBeNull();
      expect(after.evalCp!).toBeGreaterThan(300);
    });

    it("19.Nxa8 gives away most of the advantage", () => {
      expect(truthAt("gameB", 20, 36).evalCp!).toBeGreaterThan(300);
      expect(truthAt("gameB", 20, 37).evalCp!).toBeLessThan(100);
    });

    it("20...Kf5 is a blunder, and 21...Bd6 allows the mate", () => {
      expect(
        truthAt("gameB", 20, 40).evalCp! - truthAt("gameB", 20, 39).evalCp!
      ).toBeGreaterThan(200);
      expect(truthAt("gameB", 20, 42).mateIn).toBe(1);
    });
  });

  it("Opera Game: 10.Nxb5 is the engine's move and 10...cxb5 is not Black's", () => {
    const before10 = truthAt("operaGame", 20, 18);
    expect(before10.bestMove).toBe("c3b5");
    const reply = truthAt("operaGame", 20, 19);
    expect(reply.bestMove).not.toBe("c6b5");
    expect(
      truthAt("operaGame", 20, 20).evalCp! - reply.evalCp!
    ).toBeGreaterThan(100);
  });
});
