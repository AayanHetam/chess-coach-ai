import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import type { StoryFact } from "@/lib/contract/lineStory";
import { captionLine } from "../lineCaptions";
import {
  ANNOTATION_SQUARE_CLASS,
  ANNOTATION_STYLE,
  MAX_ANNOTATION_SQUARES,
  MAX_FACT_ARROWS,
  buildBoardAnnotation,
  samePosition,
  type AnnotationInput,
} from "../boardAnnotations";

// Fixture 07, inline as moveAnalysis.test.ts has it.
const MOVES = [
  "e4",
  "c5",
  "Nf3",
  "Nc6",
  "d4",
  "cxd4",
  "Nxd4",
  "Qb6",
  "Nf3",
  "Qxb2",
  "Na3",
  "Qxa1",
  "Nb5",
  "Qxc1",
  "Nc7+",
  "Kd8",
  "Nxa8",
  "Qxd1+",
  "Kxd1",
  "e5",
];
// 1.e4 e5 2.Qh5 Nc6 3.Bc4 Nf6: the scholar's mate setup.
const SCHOLAR = ["e4", "e5", "Qh5", "Nc6", "Bc4", "Nf6"];

function fenAfter(n: number, moves: readonly string[] = MOVES): string {
  const g = new Chess();
  for (const m of moves.slice(0, n)) g.move(m);
  return g.fen();
}

/** The played move's facts, through captionLine, so the pass-through is exercised end to end. */
function factsOf(fenBefore: string, sans: readonly string[]) {
  return captionLine(fenBefore, sans, "w").plies[0]?.facts ?? [];
}

function strip(
  fenBefore: string,
  played: string,
  engine: string | null,
  sans: readonly string[] = [played],
  moveArrows = true
): AnnotationInput {
  return {
    source: "strip",
    fenBefore,
    played,
    engine,
    facts: factsOf(fenBefore, sans),
    moveArrows,
  };
}

const BEFORE_8 = fenAfter(14);

describe("buildBoardAnnotation", () => {
  it("draws the demo's fork: the move, the engine's choice and the rook the fork wins, never the king", () => {
    const a = buildBoardAnnotation(
      strip(BEFORE_8, "Nc7+", "Qxc1", ["Nc7+", "Kd8", "Nxa8"])
    )!;
    expect(a).not.toBeNull();
    expect(a.fen).toBe(fenAfter(15));
    expect(a.source).toBe("strip");
    expect(a.arrows).toEqual([
      { orig: "b5", dest: "c7", tag: "played" },
      { orig: "d1", dest: "c1", tag: "engine" },
    ]);
    expect(a.squares).toEqual([{ square: "a8", tag: "target" }]);
    expect(a.squares.some((s) => s.square === "e8")).toBe(false);
  });

  it("draws nothing for a quiet move the engine agrees with, and the two arrows when it does not", () => {
    expect(buildBoardAnnotation(strip(fenAfter(0), "e4", "e4"))).toBeNull();
    // Black's move: the engine wanted 1... e5.
    const a = buildBoardAnnotation(strip(fenAfter(1), "c5", "e5"))!;
    expect(a.arrows).toEqual([
      { orig: "c7", dest: "c5", tag: "played" },
      { orig: "e7", dest: "e5", tag: "engine" },
    ]);
    expect(a.squares).toEqual([]);
  });

  it("compares moves by squares, not by SAN text: Nc7 is Nc7+", () => {
    const a = buildBoardAnnotation(
      strip(BEFORE_8, "Nc7+", "Nc7", ["Nc7+", "Kd8", "Nxa8"])
    )!;
    expect(a.arrows).toEqual([]);
    expect(a.squares).toEqual([{ square: "a8", tag: "target" }]);
  });

  it("rings a piece left en prise as a threat (Black's 5... Qxb2)", () => {
    const a = buildBoardAnnotation(strip(fenAfter(9), "Qxb2", null))!;
    expect(a.squares).toEqual([{ square: "b2", tag: "threat" }]);
    expect(a.arrows).toEqual([]);
  });

  it("rings a pawn that can be taken en passant, for either side", () => {
    for (const [fen, played, square] of [
      ["4k3/8/8/8/3p4/8/4P3/4K3 w - - 0 1", "e4", "e4"],
      ["4k3/3p4/8/4P3/8/8/8/4K3 b - - 0 1", "d5", "d5"],
    ] as const) {
      const input = strip(fen, played, null);
      expect(
        input.facts?.some((f) => f.kind === "en_prise"),
        played
      ).toBe(true);
      const a = buildBoardAnnotation(input)!;
      expect(a.squares, played).toEqual([{ square, tag: "threat" }]);
    }
  });

  it("draws no move arrows for two promotions on the same squares", () => {
    const white = buildBoardAnnotation(
      strip("8/4P2k/8/8/8/8/8/6K1 w - - 0 1", "e8=N", "e8=Q")
    );
    expect(white?.arrows ?? []).toEqual([]);
    const black = buildBoardAnnotation(
      strip("6k1/8/8/8/8/8/4p2K/8 b - - 0 1", "e1=R", "e1=Q")
    );
    expect(black?.arrows ?? []).toEqual([]);
    // A promotion elsewhere is a different move and keeps both arrows.
    const elsewhere = buildBoardAnnotation(
      strip("3r3k/4P3/8/8/8/8/8/6K1 w - - 0 1", "e8=Q", "exd8=Q")
    )!;
    expect(elsewhere.arrows.map((x) => x.tag)).toEqual(["played", "engine"]);
  });

  it("rings the pinned queen as a target (Black's 7... Qxc1)", () => {
    const a = buildBoardAnnotation(strip(fenAfter(13), "Qxc1", null))!;
    expect(a.squares).toEqual([{ square: "d1", tag: "target" }]);
  });

  it("draws a mate threatened as a target arrow and a mate allowed as a threat arrow", () => {
    const bc4 = buildBoardAnnotation(
      strip(fenAfter(4, SCHOLAR), "Bc4", null, ["Bc4", "Nf6"])
    )!;
    expect(bc4.arrows).toEqual([{ orig: "h5", dest: "f7", tag: "target" }]);
    expect(bc4.squares).toEqual([{ square: "f7", tag: "target" }]);

    const nf6 = buildBoardAnnotation(strip(fenAfter(5, SCHOLAR), "Nf6", null))!;
    expect(nf6.arrows).toEqual([{ orig: "h5", dest: "f7", tag: "threat" }]);
    expect(nf6.squares).toEqual([
      { square: "h5", tag: "target" },
      { square: "e4", tag: "target" },
    ]);
  });

  it("drops a mate the position does not back", () => {
    // The scholar's mate threat, handed to the start position.
    const facts: StoryFact[] = [
      { kind: "threatens_mate", mateSan: "Qxf7#" },
      { kind: "allows_mate", mateSan: "Qxf7#" },
    ];
    expect(
      buildBoardAnnotation({
        source: "strip",
        fenBefore: new Chess().fen(),
        played: "e4",
        facts,
        moveArrows: false,
      })
    ).toBeNull();
    // A move that replays but does not mate is no mate either.
    expect(
      buildBoardAnnotation({
        source: "strip",
        fenBefore: fenAfter(3, SCHOLAR),
        played: "Nc6",
        facts: [{ kind: "threatens_mate", mateSan: "Qh4" }],
        moveArrows: false,
      })
    ).toBeNull();
  });

  it("draws nothing from facts that do not belong to the position", () => {
    const fork = factsOf(BEFORE_8, ["Nc7+", "Kd8", "Nxa8"]);
    expect(fork.some((f) => f.kind === "motif")).toBe(true);
    // Black's rook stands on a8 at the start too, but nothing on c7 attacks it.
    expect(
      buildBoardAnnotation({
        source: "strip",
        fenBefore: new Chess().fen(),
        played: "e4",
        engine: null,
        facts: fork,
        moveArrows: true,
      })
    ).toBeNull();
  });

  it("returns null for a played move that does not replay, and no move arrows for an engine move that does not", () => {
    expect(buildBoardAnnotation(strip(BEFORE_8, "Qxh8", "Qxc1"))).toBeNull();
    expect(
      buildBoardAnnotation({
        ...strip(BEFORE_8, "Nc7+", null),
        fenBefore: "not a fen",
      })
    ).toBeNull();
    const a = buildBoardAnnotation(
      strip(BEFORE_8, "Nc7+", "Qxh8", ["Nc7+", "Kd8", "Nxa8"])
    )!;
    expect(a.arrows).toEqual([]);
    expect(a.squares).toEqual([{ square: "a8", tag: "target" }]);
  });

  it("on a line's ply keeps only the facts' marks", () => {
    const fork = buildBoardAnnotation({
      ...strip(BEFORE_8, "Nc7+", "Qxc1", ["Nc7+", "Kd8", "Nxa8"], false),
      source: "line",
    })!;
    expect(fork.source).toBe("line");
    expect(fork.arrows).toEqual([]);
    expect(fork.squares).toEqual([{ square: "a8", tag: "target" }]);
    const bc4 = buildBoardAnnotation(
      strip(fenAfter(4, SCHOLAR), "Bc4", "d3", ["Bc4", "Nf6"], false)
    )!;
    expect(bc4.arrows).toEqual([{ orig: "h5", dest: "f7", tag: "target" }]);
  });

  it("caps the rings at four, threats first, and the fact arrows at two", () => {
    // After 1. Qd4 the queen hits the rooks on d7 and h8, the knights on a7
    // and h4 and the bishop on a4. The knight on f3 is attacked by h4.
    const fenBefore = "4k2r/n2r4/8/8/b6n/5N2/3Q4/4K3 w - - 0 1";
    const attacks = (square: string, piece: string): StoryFact => ({
      kind: "attacks",
      square: square as never,
      piece: piece as never,
      defended: false,
      attacker: "q",
    });
    const discovered = (square: string, piece: string): StoryFact => ({
      kind: "motif",
      motif: {
        motif: "discovered_attack",
        confirmed: true,
        refutation: null,
        mover: { from: "d2", to: "d4", piece: "q" },
        revealer: { square: "d4", piece: "q" },
        victim: { square: square as never, piece: piece as never },
        also_check: false,
        double_attack_target: null,
      },
    });
    const facts: StoryFact[] = [
      attacks("d7", "r"),
      attacks("a7", "n"),
      discovered("h8", "r"),
      discovered("a4", "b"),
      discovered("h4", "n"),
      {
        kind: "en_prise",
        piece: "n",
        square: "f3",
        movedPiece: false,
        afterCapture: false,
      },
    ];
    const a = buildBoardAnnotation({
      source: "strip",
      fenBefore,
      played: "Qd4",
      engine: "Qd3",
      facts,
      moveArrows: true,
    })!;
    expect(a.squares).toHaveLength(MAX_ANNOTATION_SQUARES);
    expect(a.squares[0]).toEqual({ square: "f3", tag: "threat" });
    expect(a.squares.slice(1).map((s) => s.square)).toEqual(["d7", "a7", "h8"]);
    const factArrows = a.arrows.filter(
      (x) => x.tag === "target" || x.tag === "threat"
    );
    expect(factArrows).toHaveLength(MAX_FACT_ARROWS);
    expect(factArrows).toEqual([
      { orig: "d4", dest: "h8", tag: "target" },
      { orig: "d4", dest: "a4", tag: "target" },
    ]);
    // The move arrows come first.
    expect(a.arrows.slice(0, 2).map((x) => x.tag)).toEqual([
      "played",
      "engine",
    ]);
  });

  it("never draws a fact arrow twice or over a move arrow", () => {
    const fenBefore = "4k2r/n2r4/8/8/b6n/5N2/3Q4/4K3 w - - 0 1";
    const victim: StoryFact = {
      kind: "motif",
      motif: {
        motif: "discovered_attack",
        confirmed: true,
        refutation: null,
        mover: { from: "d2", to: "d4", piece: "q" },
        revealer: { square: "d4", piece: "q" },
        victim: { square: "d7", piece: "r" },
        also_check: false,
        double_attack_target: null,
      },
    };
    const a = buildBoardAnnotation({
      source: "strip",
      fenBefore,
      played: "Qd4",
      engine: null,
      facts: [victim, victim],
      moveArrows: true,
    })!;
    expect(a.arrows).toEqual([{ orig: "d4", dest: "d7", tag: "target" }]);
    expect(a.squares).toEqual([{ square: "d7", tag: "target" }]);
  });

  it("is cheap: 20 builds of the fork average under 25 ms each", () => {
    const input = strip(BEFORE_8, "Nc7+", "Qxc1", ["Nc7+", "Kd8", "Nxa8"]);
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) buildBoardAnnotation(input);
    expect((performance.now() - t0) / 20).toBeLessThan(25);
  });

  it("names a brush and a colour for every tag, and a class for every ring", () => {
    for (const tag of ["played", "engine", "threat", "target"] as const) {
      expect(ANNOTATION_STYLE[tag].brush).toMatch(/^cm[A-Z]/);
      expect(ANNOTATION_STYLE[tag].color).toMatch(/^#[0-9A-F]{6}$/);
    }
    expect(ANNOTATION_SQUARE_CLASS).toEqual({
      threat: "cm-anno-threat",
      target: "cm-anno-target",
    });
  });
});

describe("samePosition", () => {
  it("compares the first four FEN fields and ignores the move counters", () => {
    const fen = fenAfter(15);
    const counters = fen.split(" ").slice(0, 4).join(" ") + " 37 90";
    expect(samePosition(fen, counters)).toBe(true);
    expect(samePosition(fen, fenAfter(14))).toBe(false);
    // The side to move is part of the position.
    expect(samePosition(fen, fen.replace(" b ", " w "))).toBe(false);
    expect(samePosition("", "")).toBe(false);
  });
});
