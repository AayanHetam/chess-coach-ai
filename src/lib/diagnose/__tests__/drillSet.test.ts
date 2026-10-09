import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { Chess } from "chess.js";
import type { PositionEval } from "@/types/eval";
import { puzzleContextSchema } from "@/lib/validation/puzzleChatSchemas";
import { flattenEval } from "@/lib/contract/selectInsights";
import { getLineWinPercentage } from "@/lib/engine/helpers/winPercentage";
import {
  CAUSE_DRILL_NAMES,
  DRILL_SET_EMPTY,
  DRILL_SET_SIZE,
  MISTAKE_DROP_CP,
  ONLY_MOVE_GAP,
  causeFeedThemes,
  drillLinkLabel,
  drillSetFor,
  gameDrillsFor,
  practiceLabel,
  type GameDrill,
  type GameDrillsInput,
} from "../drillSet";
import type { DiagnoseCause } from "../gradeAnswer";

const REAL = path.join(
  process.cwd(),
  "src/lib/contract/__tests__/fixtures-real"
);
const FIXTURES = fs
  .readdirSync(REAL)
  .filter((f) => f.endsWith(".json"))
  .sort();

interface Fixture {
  moveHistory: string[];
  gameEval: { positions: PositionEval[]; settings?: { depth?: number } };
}

function load(name: string): Fixture {
  return JSON.parse(fs.readFileSync(path.join(REAL, name), "utf8"));
}

function input(name: string, player: "w" | "b"): GameDrillsInput {
  const fx = load(name);
  return {
    positions: fx.gameEval.positions,
    sans: fx.moveHistory,
    player,
    declaredDepth: fx.gameEval.settings?.depth ?? null,
    gameKey: name,
  };
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/** The mover's lead of the search's first line over its second, in win-% points. */
function gap(position: PositionEval, mover: "w" | "b"): number {
  const w = (i: number) => {
    const win = getLineWinPercentage(position.lines[i]);
    return mover === "w" ? win : 100 - win;
  };
  return w(0) - w(1);
}

/** The drop of the move at index `i` for its mover, in cp (the route's rule). */
function drop(fx: Fixture, i: number): number {
  const before = flattenEval(fx.gameEval.positions[i].lines[0])!;
  const after = flattenEval(fx.gameEval.positions[i + 1].lines[0])!;
  return i % 2 === 0 ? before - after : after - before;
}

describe("gameDrillsFor, on the real games", () => {
  it("07 as Black: 7... Qxc1 is a single drill, the queen 8. Qxc1 takes", () => {
    const drills = gameDrillsFor(input("07_knight_fork.json", "b"));
    const d = drills.find((x) => x.ply === 14)!;
    expect(d).toMatchObject({ ply: 14, kind: "single", cause: "hanging" });
    expect(d.puzzle.fen).toBe(
      "r1b1kbnr/pp1ppppp/2n5/1N6/4P3/5N2/P1P2PPP/q1BQKB1R b Kkq - 1 7"
    );
    expect(d.puzzle.solution).toEqual(["a1c1", "d1c1"]);
    expect(d.puzzle.themes).toEqual(["hangingPiece"]);
    expect(d.puzzle.rating).toBeUndefined();
    const fx = load("07_knight_fork.json");
    expect(gap(fx.gameEval.positions[14], "w")).toBeCloseTo(39.2, 1);
  });

  it("07 as Black: 5... Qxb2 is a mistake with one line, so no drill", () => {
    const fx = load("07_knight_fork.json");
    expect(drop(fx, 9)).toBeGreaterThanOrEqual(MISTAKE_DROP_CP);
    expect(fx.gameEval.positions[10].lines).toHaveLength(1);
    expect(fx.gameEval.positions[10].lines[0].mate).toBeUndefined();
    const drills = gameDrillsFor(input("07_knight_fork.json", "b"));
    expect(drills.map((d) => d.ply)).toEqual([14]);
  });

  it("09 as Black: 5... Bxd1 is a forcing drill, Legal's mate", () => {
    const drills = gameDrillsFor(input("09_legal_trap_tactics.json", "b"));
    expect(drills).toHaveLength(1);
    const d = drills[0];
    expect(d).toMatchObject({ ply: 10, kind: "forcing", cause: "check" });
    expect(d.puzzle.solution).toEqual(["g4d1", "c4f7", "e8e7", "c3d5"]);
    // The solver mates with its second move: the theme says so.
    expect(d.puzzle.themes).toEqual(["mateIn2"]);
    const g = new Chess(d.puzzle.fen);
    for (const uci of d.puzzle.solution)
      g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4) });
    expect(g.isCheckmate()).toBe(true);
    const fx = load("09_legal_trap_tactics.json");
    expect(gap(fx.gameEval.positions[10], "w")).toBeCloseTo(63.6, 1);
  });

  it("05 as Black: 30... Qf8 and 35... Qh5 are drills, four other mistakes have a second reply within 15 points", () => {
    const fx = load("05_long_game_six_mistakes.json");
    const drills = gameDrillsFor(input("05_long_game_six_mistakes.json", "b"));
    expect(drills.map((d) => [d.ply, d.kind])).toEqual([
      [60, "single"],
      [70, "single"],
    ]);
    expect(gap(fx.gameEval.positions[60], "w")).toBeCloseTo(49.2, 1);
    expect(gap(fx.gameEval.positions[70], "w")).toBeCloseTo(17.0, 1);
    const close: Array<[number, number]> = [
      [20, 3.0],
      [30, 0.4],
      [40, 0.7],
      [50, 6.8],
    ];
    for (const [ply, g] of close) {
      expect(drop(fx, ply - 1)).toBeGreaterThanOrEqual(MISTAKE_DROP_CP);
      expect(gap(fx.gameEval.positions[ply], "w")).toBeCloseTo(g, 1);
      expect(gap(fx.gameEval.positions[ply], "w")).toBeLessThan(ONLY_MOVE_GAP);
    }
  });

  it("03 (the sentinel game) gives nothing, for either side", () => {
    for (const side of ["w", "b"] as const)
      expect(gameDrillsFor(input("03_sentinel_timeout.json", side))).toEqual(
        []
      );
  });

  it("every drill of all ten games, both sides, replays legal from the game's own position and opens with the game's move", () => {
    let count = 0;
    for (const name of FIXTURES) {
      const fx = load(name);
      for (const side of ["w", "b"] as const) {
        const drills = gameDrillsFor(input(name, side));
        const ids = new Set<string>();
        for (const d of drills) {
          count++;
          expect(puzzleContextSchema.safeParse(d.puzzle).success).toBe(true);
          expect(d.id).toBe(d.puzzle.id);
          expect(d.id.length).toBeLessThanOrEqual(64);
          expect(ids.has(d.id)).toBe(false);
          ids.add(d.id);
          // The player's own move, at the position the game reached.
          const i = d.ply - 1;
          expect(i % 2 === 0 ? "w" : "b").toBe(side);
          const game = new Chess();
          for (const san of fx.moveHistory.slice(0, i)) game.move(san);
          expect(d.puzzle.fen).toBe(game.fen());
          const played = game.move(fx.moveHistory[i]);
          expect(d.puzzle.solution[0]).toBe(
            `${played.from}${played.to}${played.promotion ?? ""}`
          );
          // Every move legal, the solver's the side the game punished.
          const walk = new Chess(d.puzzle.fen);
          for (const uci of d.puzzle.solution) {
            const legal = walk
              .moves({ verbose: true })
              .some((m) => `${m.from}${m.to}${m.promotion ?? ""}` === uci);
            expect(legal, `${name} ${d.id} ${uci}`).toBe(true);
            walk.move({
              from: uci.slice(0, 2),
              to: uci.slice(2, 4),
              promotion: uci[4],
            });
          }
          expect(d.puzzle.solution).toHaveLength(d.kind === "single" ? 2 : 4);
        }
      }
    }
    expect(count).toBe(4);
  });

  it("ids are the game's, so two games never share one", () => {
    const a = gameDrillsFor(input("07_knight_fork.json", "b"));
    const b = gameDrillsFor({
      ...input("07_knight_fork.json", "b"),
      gameKey: "another game",
    });
    expect(a[0].id).toMatch(/^g-[0-9a-f]{1,8}-14$/);
    expect(b[0].id).not.toBe(a[0].id);
  });
});

describe("gameDrillsFor, the guards", () => {
  const base = () => input("07_knight_fork.json", "b");

  it("the opponent's moves are never rows", () => {
    const white = gameDrillsFor({ ...base(), player: "w" });
    expect(white.every((d) => (d.ply - 1) % 2 === 0)).toBe(true);
    expect(white.some((d) => d.ply === 14)).toBe(false);
  });

  it("a mixed-depth pair under a declared depth is skipped", () => {
    const i = base();
    const positions = clone(i.positions) as PositionEval[];
    for (const line of positions[13].lines) line.depth = 12;
    expect(gameDrillsFor({ ...i, positions, declaredDepth: 16 })).toEqual([]);
  });

  it("a depth-0 sentinel is skipped", () => {
    const i = base();
    const positions = clone(i.positions) as PositionEval[];
    positions[14].lines[0] = { ...positions[14].lines[0], depth: 0 };
    expect(gameDrillsFor({ ...i, positions })).toEqual([]);
  });

  it("an unscored line is skipped, never read as 0", () => {
    const i = base();
    const positions = clone(i.positions) as PositionEval[];
    delete positions[13].lines[0].cp;
    delete positions[13].lines[0].mate;
    expect(gameDrillsFor({ ...i, positions })).toEqual([]);
  });

  it("a second line within the gap is no only move", () => {
    const i = base();
    const positions = clone(i.positions) as PositionEval[];
    positions[14].lines[1] = {
      ...positions[14].lines[1],
      cp: positions[14].lines[0].cp,
    };
    expect(gameDrillsFor({ ...i, positions })).toEqual([]);
  });

  it("a punishment that does not replay drops the row", () => {
    const i = base();
    const positions = clone(i.positions) as PositionEval[];
    positions[14].lines[0].pv = ["d1d8", ...positions[14].lines[0].pv];
    expect(gameDrillsFor({ ...i, positions })).toEqual([]);
  });
});

describe("gameDrillsFor, one line: only a mate", () => {
  // 1. f3 e5 2. g4?? Qh4#: White's second move, punished by the mate.
  const sans = ["f3", "e5", "g4", "Qh4#"];
  const line = (pv: string[], score: { cp?: number; mate?: number }) => ({
    pv,
    depth: 16,
    multiPv: 1,
    ...score,
  });
  const positions = (after: { cp?: number; mate?: number }): PositionEval[] => [
    { lines: [line(["e2e4"], { cp: 30 })] },
    { lines: [line(["e7e5"], { cp: -50 })] },
    { lines: [line(["g2g3"], { cp: -40 })] },
    { lines: [line(["d8h4"], after)] },
    { lines: [] },
  ];
  const fools = (after: { cp?: number; mate?: number }): GameDrillsInput => ({
    positions: positions(after),
    sans,
    player: "w",
    declaredDepth: 16,
    gameKey: "fools",
  });

  it("a lone mate for the side to move is a drill: mate in one", () => {
    const drills = gameDrillsFor(fools({ mate: -1 }));
    expect(drills).toHaveLength(1);
    expect(drills[0]).toMatchObject({ ply: 3, kind: "single", cause: "check" });
    expect(drills[0].puzzle.solution).toEqual(["g2g4", "d8h4"]);
    expect(drills[0].puzzle.themes).toEqual(["mateIn1"]);
  });

  it("a lone line with a score is no drill", () => {
    expect(gameDrillsFor(fools({ cp: -900 }))).toEqual([]);
  });
});

describe("drillSetFor", () => {
  const drill = (ply: number, cause: DiagnoseCause): GameDrill => ({
    id: `g-0-${ply}`,
    ply,
    cause,
    kind: "single",
    puzzle: {
      id: `g-0-${ply}`,
      fen: "8/8/8/8/8/8/8/K6k w - - 0 1",
      solution: ["a1a2", "h1h2"],
      themes: [],
    },
  });
  const drills = [
    drill(10, "hanging"),
    drill(14, "check"),
    drill(20, "hanging"),
    drill(30, "hanging"),
    drill(40, "hanging"),
  ];

  it("keeps the cause, in game order, without the diagnosed move, three at most", () => {
    const a = drillSetFor(drills, "hanging", { excludePly: 20 });
    expect(a.fromGame.map((d) => d.ply)).toEqual([10, 30, 40]);
    expect(a.missing).toBe(0);
    const b = drillSetFor(drills, "check", { excludePly: 20 });
    expect(b.fromGame.map((d) => d.ply)).toEqual([14]);
    expect(b.missing).toBe(2);
    const c = drillSetFor(drills, "check", { excludePly: 14 });
    expect(c).toEqual({ fromGame: [], missing: DRILL_SET_SIZE });
    expect(drillSetFor(drills, "fork").missing).toBe(3);
    expect(drillSetFor(drills, "hanging", { size: 2 }).fromGame).toHaveLength(
      2
    );
  });

  it("a guess has no game drills of its own: the feed fills it", () => {
    expect(drillSetFor(drills, "guess")).toEqual({ fromGame: [], missing: 3 });
  });
});

describe("the copy", () => {
  it("the feed's themes per cause", () => {
    expect(causeFeedThemes("check")).toEqual([
      "mateIn1",
      "mateIn2",
      "discoveredCheck",
      "doubleCheck",
    ]);
    expect(causeFeedThemes("hanging")).toEqual(["hangingPiece"]);
    expect(causeFeedThemes("fork")).toEqual(["fork"]);
    expect(causeFeedThemes("calculation")).toEqual(["defensiveMove"]);
    expect(causeFeedThemes("guess")).toEqual([
      "hangingPiece",
      "fork",
      "mateIn1",
    ]);
  });

  it("the link under a graded reply", () => {
    expect(drillLinkLabel(3)).toBe("Drill it: 3 from this game");
    expect(drillLinkLabel(4)).toBe("Drill it: 3 from this game");
    expect(drillLinkLabel(1)).toBe("Drill it: 1 from this game, 2 like it");
    expect(drillLinkLabel(2)).toBe("Drill it: 2 from this game, 1 like it");
    expect(drillLinkLabel(0)).toBe("Drill it: 3 puzzles like it");
  });

  it("the banner on /puzzles", () => {
    expect(practiceLabel("hanging", 3, 0)).toBe(
      "Practising loose pieces: 3 from your game"
    );
    expect(practiceLabel("check", 1, 2)).toBe(
      "Practising missed checks: 1 from your game, 2 like it"
    );
    expect(practiceLabel("fork", 0, 3)).toBe(
      "Practising forks: puzzles like the one in your game"
    );
    expect(CAUSE_DRILL_NAMES).toEqual({
      check: "missed checks",
      hanging: "loose pieces",
      fork: "forks",
      calculation: "answering threats",
      guess: "the blunder check",
    });
  });

  it("the empty set", () => {
    expect(DRILL_SET_EMPTY).toBe(
      "The puzzle store didn't answer just now. Try again in a moment."
    );
  });

  it("no em dash and no semicolon in any of it", () => {
    const causes: DiagnoseCause[] = [
      "check",
      "hanging",
      "fork",
      "calculation",
      "guess",
    ];
    const all = [
      DRILL_SET_EMPTY,
      ...[0, 1, 2, 3].map((n) => drillLinkLabel(n)),
      ...causes.flatMap((c) => [
        practiceLabel(c, 0, 3),
        practiceLabel(c, 1, 2),
        practiceLabel(c, 3, 0),
      ]),
    ];
    for (const s of all) expect(s).not.toMatch(/[—;]/);
  });
});
