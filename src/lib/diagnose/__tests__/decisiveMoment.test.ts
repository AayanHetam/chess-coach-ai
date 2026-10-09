import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { Chess } from "chess.js";
import type { PositionEval } from "@/types/eval";
import { buildGameStory, type GameStoryInput } from "@/lib/coach/gameStory";
import {
  DIAGNOSE_MIN_SWING,
  diagnoseMomentAt,
  findDiagnoseMoment,
  isConcrete,
  replyAt,
  threatAt,
  type DiagnoseMoment,
} from "../decisiveMoment";
import { truthCause } from "../gradeAnswer";

const REAL = path.join(
  process.cwd(),
  "src/lib/contract/__tests__/fixtures-real"
);

function fixture(name: string, player: "w" | "b" | null): GameStoryInput {
  const fx = JSON.parse(fs.readFileSync(path.join(REAL, name), "utf8"));
  return {
    positions: fx.gameEval.positions,
    sans: fx.moveHistory,
    white: fx.gameHeaders?.white ?? null,
    black: fx.gameHeaders?.black ?? null,
    result: fx.gameHeaders?.result ?? null,
    playerColor: player,
    declaredDepth: fx.gameEval.settings?.depth ?? null,
  };
}

function fenAfter(sans: readonly string[], n: number): string {
  const g = new Chess();
  for (const m of sans.slice(0, n)) g.move(m);
  return g.fen();
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

describe("findDiagnoseMoment, on the real games", () => {
  it("07 as White: the move the game turned on, 8. Nc7+, whose reply is no threat (the plan variant)", () => {
    const input = fixture("07_knight_fork.json", "w");
    const m = findDiagnoseMoment(input)!;
    expect(m).toMatchObject({
      ply: 15,
      moveNumber: 8,
      color: "w",
      san: "Nc7+",
      label: "8. Nc7+",
      source: "decisive",
    });
    expect(m.swing).toBeGreaterThanOrEqual(DIAGNOSE_MIN_SWING);
    expect(m.fenBefore).toBe(fenAfter(input.sans, 14));
    expect(m.fenAfter).toBe(fenAfter(input.sans, 15));
    // The engine's reply is 8... Kd8, the only move: not forcing.
    expect(replyAt(m.fenAfter, input.positions![15], "w", 15)?.san).toBe("Kd8");
    expect(threatAt(m, input.positions!)).toBeNull();
  });

  it("07 as Black: the game turned on White's move, so Black's largest swing, 7... Qxc1, and the queen it loses", () => {
    const input = fixture("07_knight_fork.json", "b");
    const m = findDiagnoseMoment(input)!;
    expect(m).toMatchObject({
      ply: 14,
      color: "b",
      label: "7... Qxc1",
      source: "swing",
    });
    expect(m.swing).toBeCloseTo(46.5, 1);
    const t = threatAt(m, input.positions!)!;
    expect(t.uci).toBe("d1c1");
    expect(t.label).toBe("8. Qxc1");
    expect(t.captured).toBe("q");
    expect(t.materialGainCp).toBe(900);
    expect(t.capturesHanging).toBe(true);
    expect(t.depth).toBe(16);
    expect(t.line).toEqual(["d1c1", "a8b8", "c1f4", "f7f6"]);
    // The search's other two lines are far worse for White: no equal reply.
    expect(t.engineReplies).toEqual(["b5c7", "b5d6"]);
    expect(t.equalReplies).toEqual([]);
    expect(truthCause(t)).toBe("hanging");
  });

  it("07, asked at 6. Na3: the rook on a1 the queen takes", () => {
    const input = fixture("07_knight_fork.json", "w");
    const m = diagnoseMomentAt(input, 11)!;
    expect(m).toMatchObject({ label: "6. Na3", source: "asked", color: "w" });
    const t = threatAt(m, input.positions!)!;
    expect(t).toMatchObject({
      uci: "b2a1",
      san: "Qxa1",
      label: "6... Qxa1",
      captured: "r",
      capturesHanging: true,
      forkTargets: [],
    });
    expect(truthCause(t)).toBe("hanging");
    // Asked at the opponent's move, or a move that gave nothing away: none.
    expect(diagnoseMomentAt(input, 12)).toBeNull();
    expect(
      diagnoseMomentAt(fixture("07_knight_fork.json", null), 11)
    ).toBeNull();
  });

  it("09 as Black: the 2.7-point turning point is passed over for 5... Bxd1, and the check it walks into", () => {
    const input = fixture("09_legal_trap_tactics.json", "b");
    const story = buildGameStory(input);
    expect(story.decisive?.label).toBe("2...d6");
    expect(story.decisive!.swing).toBeLessThan(DIAGNOSE_MIN_SWING);
    const m = findDiagnoseMoment(input, story)!;
    expect(m).toMatchObject({ ply: 10, label: "5... Bxd1", source: "swing" });
    const t = threatAt(m, input.positions!)!;
    expect(t.uci).toBe("c4f7");
    expect(t.san).toBe("Bxf7+");
    expect(t.isCheck).toBe(true);
    // The bishop hits the king and nothing worth a knight: no fork.
    expect(t.forkTargets).toEqual([]);
    expect(truthCause(t)).toBe("check");
  });

  it("05 as White and as Black", () => {
    const w = fixture("05_long_game_six_mistakes.json", "w");
    const mw = findDiagnoseMoment(w)!;
    expect(mw).toMatchObject({ ply: 71, label: "36. Na7", source: "decisive" });
    const tw = threatAt(mw, w.positions!)!;
    expect(tw.uci).toBe("h8a8");
    expect(truthCause(tw)).toBe("hanging");

    const b = fixture("05_long_game_six_mistakes.json", "b");
    const mb = findDiagnoseMoment(b)!;
    expect(mb).toMatchObject({ ply: 38, label: "19... c5", source: "swing" });
    const tb = threatAt(mb, b.positions!)!;
    expect(tb.uci).toBe("a7c8");
    expect(tb.san).toBe("Nxc8+");
    expect(truthCause(tb)).toBe("check");
  });

  it("10 as White: 18. Ne6 and the bishop that takes it", () => {
    const input = fixture("10_queenless_endgame.json", "w");
    const m = findDiagnoseMoment(input)!;
    expect(m).toMatchObject({ ply: 35, label: "18. Ne6", source: "decisive" });
    const t = threatAt(m, input.positions!)!;
    expect(t.uci).toBe("c8e6");
    expect(truthCause(t)).toBe("hanging");
  });

  it("02 and 03 (the sentinel game) have no moment for either side, and no side known is no moment", () => {
    for (const name of ["02_mate_for_black.json", "03_sentinel_timeout.json"])
      for (const side of ["w", "b"] as const)
        expect(
          findDiagnoseMoment(fixture(name, side)),
          `${name} ${side}`
        ).toBeNull();
    expect(findDiagnoseMoment(fixture("07_knight_fork.json", null))).toBeNull();
  });

  it("every moment over the ten games is the player's own move, replayed from the start", () => {
    for (const name of fs.readdirSync(REAL).filter((f) => f.endsWith(".json")))
      for (const side of ["w", "b"] as const) {
        const input = fixture(name, side);
        const m = findDiagnoseMoment(input);
        if (!m) continue;
        expect(m.color).toBe(side);
        expect(m.swing).toBeGreaterThanOrEqual(DIAGNOSE_MIN_SWING);
        const g = new Chess(m.fenBefore);
        expect(g.turn()).toBe(side);
        g.move(m.san);
        expect(g.fen()).toBe(m.fenAfter);
        const t = threatAt(m, input.positions!);
        if (!t) continue;
        // The truth is the opponent's legal move, and its line replays.
        const r = new Chess(m.fenAfter);
        expect(r.turn()).not.toBe(side);
        for (const uci of t.line)
          r.move({
            from: uci.slice(0, 2),
            to: uci.slice(2, 4),
            promotion: uci[4],
          });
        expect(t.line[0]).toBe(t.uci);
        expect(isConcrete(m.fenAfter, t.uci)).toBe(true);
      }
  });
});

describe("findDiagnoseMoment, the guards", () => {
  it("never reads a mixed-depth pair as a moment", () => {
    const input = fixture("07_knight_fork.json", "b");
    const positions = clone(input.positions!) as PositionEval[];
    positions[14].lines[0].depth = 12;
    const mixed = { ...input, positions, declaredDepth: 16 };
    expect(findDiagnoseMoment(mixed)?.ply).not.toBe(14);
    expect(diagnoseMomentAt(mixed, 14)).toBeNull();
  });

  it("returns null when the game does not replay up to the move", () => {
    const input = fixture("07_knight_fork.json", "b");
    const sans = [...input.sans];
    sans[3] = "Qxz9";
    expect(findDiagnoseMoment({ ...input, sans })).toBeNull();
  });
});

describe("replyAt and threatAt, the guards", () => {
  const input = fixture("07_knight_fork.json", "b");
  const moment = findDiagnoseMoment(input)!;
  const withLine = (edit: (p: PositionEval) => void) => {
    const positions = clone(input.positions!) as PositionEval[];
    edit(positions[14]);
    return positions;
  };

  it("reads no truth from a search that timed out (depth 0)", () => {
    const positions = withLine((p) => {
      p.lines[0].depth = 0;
    });
    expect(threatAt(moment, positions)).toBeNull();
  });

  it("reads no truth from a first move that does not replay", () => {
    expect(
      threatAt(
        moment,
        withLine((p) => {
          p.lines[0].pv = ["a1a8", ...p.lines[0].pv.slice(1)];
        })
      )
    ).toBeNull();
    // A stray promotion suffix is no second spelling of Qxc1.
    expect(
      threatAt(
        moment,
        withLine((p) => {
          p.lines[0].pv = ["d1c1q", ...p.lines[0].pv.slice(1)];
        })
      )
    ).toBeNull();
  });

  it("reads the reply only for the side to move, at its own index", () => {
    const p = input.positions![14];
    expect(replyAt(moment.fenAfter, p, "b", 14)?.uci).toBe("d1c1");
    // White is to move after 7... Qxc1: the player is Black, never White.
    expect(replyAt(moment.fenAfter, p, "w", 14)).toBeNull();
    // Index 13 is a Black move.
    expect(replyAt(moment.fenAfter, p, "b", 13)).toBeNull();
  });

  it("cuts the line where it stops replaying", () => {
    const t = threatAt(
      moment,
      withLine((p) => {
        p.lines[0].pv = ["d1c1", "a8b8", "c1c1", "f7f6"];
      })
    )!;
    expect(t.line).toEqual(["d1c1", "a8b8"]);
  });
});

describe("replyAt, synthetic positions", () => {
  const moment = (fenAfter: string, ply: number): DiagnoseMoment => {
    const color = ply % 2 === 1 ? "w" : "b";
    return {
      ply,
      moveNumber: Math.ceil(ply / 2),
      color,
      san: "?",
      label: "?",
      swing: 30,
      source: "swing",
      fenBefore: fenAfter,
      fenAfter,
    };
  };
  const at = (ply: number, lines: PositionEval["lines"]): PositionEval[] => {
    const out: PositionEval[] = [];
    out[ply] = { lines };
    return out;
  };

  it("names a knight fork that wins the rook as a fork", () => {
    // Black's last move left the king on e8 and the rook on a8.
    const fen = "r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1";
    const t = threatAt(
      moment(fen, 20),
      at(20, [{ pv: ["b5c7"], cp: 600, depth: 18, multiPv: 1 }])
    )!;
    expect(t.label).toBe("11. Nc7+");
    expect(t.isCheck).toBe(true);
    expect(t.forkTargets.sort()).toEqual(["a8", "e8"]);
    expect(truthCause(t)).toBe("fork");
  });

  it("names a mate in one as a check, for Black's reply too", () => {
    const white = threatAt(
      moment("6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1", 30),
      at(30, [{ pv: ["e1e8"], mate: 1, depth: 20, multiPv: 1 }])
    )!;
    expect(white.isMate).toBe(true);
    expect(white.label).toBe("16. Re8#");
    expect(truthCause(white)).toBe("check");
    const black = threatAt(
      moment("4r1k1/8/8/8/8/8/5PPP/6K1 b - - 0 1", 31),
      at(31, [{ pv: ["e8e1"], mate: -1, depth: 20, multiPv: 1 }])
    )!;
    expect(black.isMate).toBe(true);
    expect(black.label).toBe("16... Re1#");
    expect(truthCause(black)).toBe("check");
  });

  it("counts a second line of the same search within 5 points as equal, and none at another depth", () => {
    const fen = "r3k3/ppp2ppp/2n5/1B1q4/4P2r/2N2N2/PPP2PPP/3QK2R w K - 0 1";
    const t = replyAt(
      fen,
      {
        lines: [
          { pv: ["c3d5", "c6d4"], cp: 950, depth: 18, multiPv: 1 },
          { pv: ["e4d5"], cp: 940, depth: 18, multiPv: 2 },
          { pv: ["b5c6"], cp: 300, depth: 18, multiPv: 3 },
          { pv: ["d1d5"], cp: 948, depth: 12, multiPv: 4 },
        ],
      },
      "b",
      30
    )!;
    expect(t.uci).toBe("c3d5");
    expect(t.equalReplies).toEqual(["e4d5"]);
    expect(t.engineReplies).toEqual(["e4d5", "b5c6"]);
    expect(t.capturesHanging).toBe(true);
    expect(truthCause(t)).toBe("hanging");
  });

  it("reads an unscored line as no score, never as an even one", () => {
    const fen = "r3k3/ppp2ppp/2n5/1B1q4/4P2r/2N2N2/PPP2PPP/3QK2R w K - 0 1";
    const t = replyAt(
      fen,
      {
        lines: [
          { pv: ["c3d5"], cp: 950, depth: 18, multiPv: 1 },
          {
            pv: ["e4d5"],
            cp: null as unknown as number,
            depth: 18,
            multiPv: 2,
          },
        ],
      },
      "b",
      30
    )!;
    expect(t.engineReplies).toEqual(["e4d5"]);
    expect(t.equalReplies).toEqual([]);
  });

  it("keeps a promotion's piece: e7e8q is not e7e8n", () => {
    const fen = "8/4P3/8/8/8/8/k7/4K3 w - - 0 1";
    const t = replyAt(
      fen,
      {
        lines: [
          { pv: ["e7e8q"], cp: 900, depth: 20, multiPv: 1 },
          { pv: ["e7e8n"], cp: 0, depth: 20, multiPv: 2 },
        ],
      },
      "b",
      40
    )!;
    expect(t.uci).toBe("e7e8q");
    expect(t.san).toBe("e8=Q");
    expect(t.engineReplies).toEqual(["e7e8n"]);
    expect(isConcrete(fen, "e7e8q")).toBe(false);
  });

  it("finds the threats of the side to move", () => {
    const fen = "r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1";
    expect(isConcrete(fen, "b5c7")).toBe(true);
    expect(isConcrete(fen, "b5a7")).toBe(false);
    expect(isConcrete("not a fen", "b5c7")).toBe(false);
  });

  it("is quick on the long game", () => {
    const input = fixture("05_long_game_six_mistakes.json", "w");
    const t0 = performance.now();
    const m = findDiagnoseMoment(input)!;
    threatAt(m, input.positions!);
    const ms = performance.now() - t0;
    console.info(`diagnose on fixture 05: ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(2000);
  });
});
