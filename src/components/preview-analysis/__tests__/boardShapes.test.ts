import { afterEach, describe, expect, it, vi } from "vitest";
import { Chess } from "chess.js";
import { captionLine } from "@/lib/coach/lineCaptions";
import {
  ANNOTATION_STYLE,
  buildBoardAnnotation,
  type BoardAnnotation,
} from "@/lib/coach/boardAnnotations";
import {
  ARROW_PALETTE,
  DEFAULT_ARROW_TOGGLES,
  type ArrowToggleState,
} from "@/components/ui/BoardArrowToggles";
import { CHESSGROUND_BRUSHES } from "@/components/ui/chessgroundBrushes";
import { playedLineAt } from "../coachLines";
import {
  BOARD_ANNOTATIONS_DEFAULT,
  TOGGLE_BRUSH,
  computeBaseShapes,
  heldEvalShare,
  isBoardAnnotationsEnabledPublic,
  lineAnnotationAt,
  mergeBoardShapes,
  sanToShape,
  uciToShape,
  type BaseShapesInput,
  type MergeInput,
} from "../boardShapes";

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

function fenAfter(n: number): string {
  const g = new Chess();
  for (const m of MOVES.slice(0, n)) g.move(m);
  return g.fen();
}

const START = fenAfter(0);
const BEFORE_8 = fenAfter(14);
const AFTER_8 = fenAfter(15);

const ALL_ON: ArrowToggleState = {
  ...DEFAULT_ARROW_TOGGLES,
  best: true,
  common: true,
  game: true,
  maia: true,
};

function base(over: Partial<BaseShapesInput> = {}): BaseShapesInput {
  return {
    takeoverMode: false,
    takeoverPreview: null,
    takeoverCandidates: [],
    toggles: DEFAULT_ARROW_TOGGLES,
    displayFen: START,
    exploring: false,
    bestUci: null,
    commonUci: null,
    nextMove: null,
    maiaSan: null,
    ...over,
  };
}

/** The strip's mark for 8. Nc7+: the move, the engine's Qxc1 and the rook on a8. */
function stripAt8(): BoardAnnotation {
  return buildBoardAnnotation({
    source: "strip",
    fenBefore: BEFORE_8,
    played: "Nc7+",
    engine: "Qxc1",
    facts: captionLine(BEFORE_8, ["Nc7+", "Kd8", "Nxa8"], "w").plies[0].facts,
    moveArrows: true,
  })!;
}

/** A line's mark for the same move: the ring alone. */
function lineAt8(): BoardAnnotation {
  return buildBoardAnnotation({
    source: "line",
    fenBefore: BEFORE_8,
    played: "Nc7+",
    facts: captionLine(BEFORE_8, ["Nc7+", "Kd8", "Nxa8"], "w").plies[0].facts,
    moveArrows: false,
  })!;
}

function merge(over: Partial<MergeInput> = {}) {
  return mergeBoardShapes({
    displayFen: AFTER_8,
    base: { preview: [], toggles: [] },
    takeoverMode: false,
    drill: false,
    annotationsOn: true,
    line: null,
    strip: stripAt8(),
    ...over,
  });
}

describe("computeBaseShapes", () => {
  it("fans out the top three master moves, skipping a short UCI", () => {
    const { preview, toggles } = computeBaseShapes(
      base({
        takeoverMode: true,
        takeoverCandidates: [
          { uci: "e2e4" },
          { uci: "d2" },
          { uci: "g1f3" },
          { uci: "c2c4" },
        ],
      })
    );
    expect(preview).toEqual([
      { orig: "e2", dest: "e4", brush: "green" },
      { orig: "g1", dest: "f3", brush: "paleGreen" },
    ]);
    expect(toggles).toEqual([]);
  });

  it("draws the previewed move in gold, in place of the fan-out", () => {
    const preview = { from: "d1", to: "c1" };
    expect(
      computeBaseShapes(
        base({
          takeoverMode: true,
          takeoverPreview: preview,
          takeoverCandidates: [{ uci: "e2e4" }],
        })
      ).preview
    ).toEqual([{ orig: "d1", dest: "c1", brush: "gold" }]);
    // An explored line outside the Masters view has its gold arrow too.
    expect(
      computeBaseShapes(base({ takeoverPreview: preview })).preview
    ).toEqual([{ orig: "d1", dest: "c1", brush: "gold" }]);
  });

  it("draws the toggles in order: engine best, most common, game played, Maia", () => {
    const { preview, toggles } = computeBaseShapes(
      base({
        toggles: ALL_ON,
        displayFen: BEFORE_8,
        bestUci: "d1c1",
        commonUci: "b5c7",
        nextMove: { from: "b5", to: "c7" },
        maiaSan: "Nd6+",
      })
    );
    expect(preview).toEqual([]);
    expect(toggles).toEqual([
      { orig: "d1", dest: "c1", brush: "green" },
      { orig: "b5", dest: "c7", brush: "blue" },
      { orig: "b5", dest: "c7", brush: "yellow" },
      { orig: "b5", dest: "d6", brush: "purple" },
    ]);
  });

  it("draws nothing for a toggle that is off or has nothing to draw", () => {
    expect(
      computeBaseShapes(
        base({
          bestUci: "d1c1",
          commonUci: "b5c7",
          nextMove: { from: "b5", to: "c7" },
          maiaSan: "Nd6+",
        })
      ).toggles
    ).toEqual([]);
    expect(computeBaseShapes(base({ toggles: ALL_ON })).toggles).toEqual([]);
  });

  it("draws no game arrow while exploring, and skips a short best or an illegal Maia move", () => {
    const { toggles } = computeBaseShapes(
      base({
        toggles: ALL_ON,
        displayFen: BEFORE_8,
        exploring: true,
        bestUci: "d1",
        nextMove: { from: "b5", to: "c7" },
        maiaSan: "Qxh8",
      })
    );
    expect(toggles).toEqual([]);
  });

  it("keeps the toggles' brushes ARROW_PALETTE's", () => {
    for (const key of ["best", "common", "game", "maia"] as const)
      expect(TOGGLE_BRUSH[key]).toBe(ARROW_PALETTE[key].brush);
  });

  it("resolves a SAN against the position, and slices a UCI", () => {
    expect(sanToShape(BEFORE_8, "Qxc1", "purple")).toEqual({
      orig: "d1",
      dest: "c1",
      brush: "purple",
    });
    expect(sanToShape(BEFORE_8, "Nc4", "purple")).toBeNull();
    expect(sanToShape("not a fen", "e4", "purple")).toBeNull();
    expect(uciToShape("e7e8q", "green")).toEqual({
      orig: "e7",
      dest: "e8",
      brush: "green",
    });
  });
});

describe("mergeBoardShapes", () => {
  it("draws the strip's mark: the two move arrows and the ring", () => {
    const m = merge();
    expect(m.source).toBe("strip");
    expect(m.autoShapes).toEqual([
      { orig: "b5", dest: "c7", brush: "cmPlayed" },
      { orig: "d1", dest: "c1", brush: "cmEngine" },
    ]);
    expect(Array.from(m.squareClasses)).toEqual([["a8", "cm-anno-target"]]);
  });

  it("puts a line's ply before the strip's move at the same position", () => {
    const m = merge({ line: lineAt8() });
    expect(m.source).toBe("line");
    expect(m.autoShapes).toEqual([]);
    expect(Array.from(m.squareClasses)).toEqual([["a8", "cm-anno-target"]]);
  });

  it("uses the strip's move when the line's ply is another position", () => {
    const elsewhere: BoardAnnotation = {
      fen: fenAfter(13),
      source: "line",
      arrows: [],
      squares: [{ square: "d1", tag: "target" }],
    };
    const m = merge({ line: elsewhere });
    expect(m.source).toBe("strip");
    expect(Array.from(m.squareClasses)).toEqual([["a8", "cm-anno-target"]]);
  });

  it("draws the preview first and the toggles last, a toggle on a mark's squares once", () => {
    const m = merge({
      base: {
        preview: [{ orig: "e2", dest: "e4", brush: "gold" }],
        toggles: [
          { orig: "d1", dest: "c1", brush: "green" },
          { orig: "h2", dest: "h4", brush: "purple" },
        ],
      },
    });
    expect(m.autoShapes).toEqual([
      { orig: "e2", dest: "e4", brush: "gold" },
      { orig: "b5", dest: "c7", brush: "cmPlayed" },
      { orig: "d1", dest: "c1", brush: "cmEngine" },
      { orig: "h2", dest: "h4", brush: "purple" },
    ]);
  });

  it("draws no mark on another position, and ignores the move counters", () => {
    const off = merge({ displayFen: fenAfter(16) });
    expect(off.source).toBeNull();
    expect(off.autoShapes).toEqual([]);
    expect(off.squareClasses.size).toBe(0);
    const counters = AFTER_8.split(" ").slice(0, 4).join(" ") + " 12 40";
    expect(merge({ displayFen: counters }).source).toBe("strip");
  });

  it("draws no mark in a drill, even on the strip's own position", () => {
    // A drill can start on a game position: the mark would be its answer.
    const m = merge({
      drill: true,
      line: lineAt8(),
      base: {
        preview: [],
        toggles: [{ orig: "h2", dest: "h4", brush: "purple" }],
      },
    });
    expect(m.source).toBeNull();
    expect(m.squareClasses.size).toBe(0);
    expect(m.autoShapes).toEqual([{ orig: "h2", dest: "h4", brush: "purple" }]);
  });

  it("draws no mark in the Masters view or with the marks turned off", () => {
    for (const over of [{ takeoverMode: true }, { annotationsOn: false }]) {
      const m = merge({ ...over, line: lineAt8() });
      expect(m.source).toBeNull();
      expect(m.autoShapes).toEqual([]);
      expect(m.squareClasses.size).toBe(0);
    }
  });

  it("takes the rings from the mark drawn and from no other", () => {
    const line: BoardAnnotation = {
      fen: AFTER_8,
      source: "line",
      arrows: [],
      squares: [{ square: "b2", tag: "threat" }],
    };
    const m = merge({ line });
    expect(Array.from(m.squareClasses)).toEqual([["b2", "cm-anno-threat"]]);
  });

  it("emits only brushes the board has", () => {
    const every: BoardAnnotation = {
      fen: AFTER_8,
      source: "strip",
      arrows: [
        { orig: "b5", dest: "c7", tag: "played" },
        { orig: "d1", dest: "c1", tag: "engine" },
        { orig: "h2", dest: "h4", tag: "threat" },
        { orig: "g2", dest: "g4", tag: "target" },
      ],
      squares: [],
    };
    const shapes = [
      ...computeBaseShapes(
        base({
          takeoverMode: true,
          takeoverCandidates: [{ uci: "e2e4" }, { uci: "d2d4" }],
        })
      ).preview,
      ...computeBaseShapes(base({ takeoverPreview: { from: "a2", to: "a4" } }))
        .preview,
      ...merge({
        strip: every,
        base: computeBaseShapes(
          base({
            toggles: ALL_ON,
            displayFen: BEFORE_8,
            bestUci: "a2a3",
            commonUci: "c2c3",
            nextMove: { from: "f2", to: "f3" },
            maiaSan: "Nd6+",
          })
        ),
      }).autoShapes,
    ];
    expect(shapes.length).toBeGreaterThanOrEqual(11);
    for (const s of shapes)
      expect(CHESSGROUND_BRUSHES).toHaveProperty(s.brush!);
  });

  it("keeps the marks' brushes and colours the board's", () => {
    for (const tag of ["played", "engine", "threat", "target"] as const) {
      const style = ANNOTATION_STYLE[tag];
      const brush =
        CHESSGROUND_BRUSHES[style.brush as keyof typeof CHESSGROUND_BRUSHES];
      expect(brush, tag).toBeDefined();
      expect(brush.color).toBe(style.color);
    }
  });
});

describe("lineAnnotationAt", () => {
  // The "What happened" line of the card at 8. Nc7+.
  const line = playedLineAt(MOVES, 8, "w")!;
  const captions = captionLine(line.startFen, line.sans, "w");

  it("rings the rook the fork wins on the first ply, with no arrows", () => {
    expect(line.startFen).toBe(BEFORE_8);
    const a = lineAnnotationAt(line, 1, captions.plies[0])!;
    expect(a.source).toBe("line");
    expect(a.fen).toBe(AFTER_8);
    expect(a.arrows).toEqual([]);
    expect(a.squares).toEqual([{ square: "a8", tag: "target" }]);
  });

  it("reads the ply after it from its own caption", () => {
    const a = lineAnnotationAt(line, 2, captions.plies[1])!;
    expect(a.fen).toBe(fenAfter(16));
    expect(a.squares).toEqual([{ square: "c7", tag: "target" }]);
  });

  it("draws nothing from a caption of another move, at the start or past the end", () => {
    expect(lineAnnotationAt(line, 1, captions.plies[1])).toBeNull();
    expect(lineAnnotationAt(line, 1, null)).toBeNull();
    expect(lineAnnotationAt(line, 0, captions.plies[0])).toBeNull();
    expect(
      lineAnnotationAt(line, line.sans.length + 1, captions.plies[0])
    ).toBeNull();
    expect(
      lineAnnotationAt(
        { startFen: BEFORE_8, sans: ["Qxh8", "Nc7+"] },
        2,
        captions.plies[0]
      )
    ).toBeNull();
  });
});

describe("heldEvalShare", () => {
  it("holds the last value while pending, and clamps a settled one", () => {
    expect(heldEvalShare(true, 80, null)).toBe(50);
    expect(heldEvalShare(true, 80, 64)).toBe(64);
    expect(heldEvalShare(false, 80, 64)).toBe(80);
    expect(heldEvalShare(false, 140, null)).toBe(100);
    expect(heldEvalShare(false, -5, 30)).toBe(0);
  });
});

describe("isBoardAnnotationsEnabledPublic", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is off by default and read from NEXT_PUBLIC_COACH_BOARD_ANNOTATIONS", () => {
    expect(BOARD_ANNOTATIONS_DEFAULT).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_COACH_BOARD_ANNOTATIONS", "");
    expect(isBoardAnnotationsEnabledPublic()).toBe(false);
    for (const v of ["1", "on", "true", " TRUE "]) {
      vi.stubEnv("NEXT_PUBLIC_COACH_BOARD_ANNOTATIONS", v);
      expect(isBoardAnnotationsEnabledPublic(), v).toBe(true);
    }
    for (const v of ["0", "off", "false", "yes"]) {
      vi.stubEnv("NEXT_PUBLIC_COACH_BOARD_ANNOTATIONS", v);
      expect(isBoardAnnotationsEnabledPublic(), v).toBe(false);
    }
  });
});
