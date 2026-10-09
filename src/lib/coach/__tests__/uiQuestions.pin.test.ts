/**
 * Every question the page writes itself is routed by rule (pathway PR 3.4):
 * the suggestion pills (generateSuggestions), the Masters rows
 * (coachQuestionFor), the strip's Ask Masti (MoveAnalysisCard's
 * questionFor) and the takeover (AnalysisImpl). The first two are called.
 * The last two are read from their source, so a new template fails here
 * until it has a rule.
 *
 * The no-game pills ("How do I load a game?", "What can you help me
 * with?") are left out: they show only with no game loaded, so they never
 * carry a contextId and never reach the chat route's router.
 */
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { Chess } from "chess.js";
import { MoveClassification } from "@/types/enums";
import type { PositionEval } from "@/types/eval";
import { generateSuggestions } from "@/components/preview-analysis/generateSuggestions";
import {
  coachQuestionFor,
  type MasterCandidate,
} from "@/components/ui/MasterGamesPanel";
import { resolveQuestionAnchor } from "../questionAnchor";
import { resolveLiveIntent } from "../intentRules";

const SRC = path.join(process.cwd(), "src/components");
const GAME = JSON.parse(
  fs.readFileSync(
    path.join(
      process.cwd(),
      "src/lib/contract/__tests__/fixtures-real/07_knight_fork.json"
    ),
    "utf8"
  )
) as { moveHistory: string[] };
const MOVES = GAME.moveHistory;

function game(): Chess {
  const g = new Chess();
  for (const m of MOVES) g.move(m);
  return g;
}

/** Positions 0..20 with the given classifications by ply. */
function positions(by: Record<number, MoveClassification>): PositionEval[] {
  return Array.from({ length: MOVES.length + 1 }, (_, ply) => ({
    lines: [{ pv: [], cp: 0, depth: 16, multiPv: 1 }],
    ...(by[ply] ? { moveClassification: by[ply] } : {}),
  }));
}

/** Routed by rule over fixture 07, with the anchor the route would read and with none. */
function expectRuled(q: string, moveIndex = MOVES.length) {
  const anchor = resolveQuestionAnchor(q, MOVES, "w", moveIndex);
  for (const a of [anchor, null]) {
    const live = resolveLiveIntent(q, {
      anchor: a,
      moves: MOVES,
      playerColor: "w",
    });
    expect(live.source, `${q} (${a ? "anchored" : "no anchor"})`).toBe("rule");
    expect(live.rule, q).not.toBe("none");
  }
}

describe("the suggestion pills", () => {
  const inputs: Parameters<typeof generateSuggestions>[0][] = [
    {
      loadedGame: game(),
      enginePositions: positions({
        [15]: MoveClassification.Blunder,
        [9]: MoveClassification.Brilliant,
        [6]: MoveClassification.Inaccuracy,
      }),
      mistakeContext: { movePlayed: "Nc7+", classification: "blunder" },
      openingName: "Sicilian Defense",
      playerColor: "w",
    },
    {
      loadedGame: game(),
      enginePositions: positions({}),
      mistakeContext: null,
      openingName: "Sicilian Defense",
      playerColor: "w",
    },
    {
      loadedGame: game(),
      enginePositions: positions({ [9]: MoveClassification.Brilliant }),
      mistakeContext: null,
      openingName: "Sicilian Defense: Open, Najdorf Variation",
      playerColor: "w",
    },
    {
      loadedGame: game(),
      enginePositions: positions({
        [14]: MoveClassification.Mistake,
        [6]: MoveClassification.Inaccuracy,
      }),
      mistakeContext: { movePlayed: "Qxc1", classification: "mistake" },
      openingName: null,
      playerColor: null,
    },
    {
      loadedGame: game(),
      enginePositions: positions({ [15]: MoveClassification.Miss }),
      mistakeContext: { movePlayed: "Nc7+", classification: "miss" },
      openingName: "Opening",
      playerColor: "w",
    },
    {
      loadedGame: game(),
      enginePositions: positions({ [6]: MoveClassification.Inaccuracy }),
      mistakeContext: null,
      openingName: null,
    },
    // An endgame: 14 pieces or fewer on the board.
    {
      loadedGame: new Chess("8/5k2/8/3p4/3P4/8/5K2/R7 w - - 0 1"),
      enginePositions: null,
      mistakeContext: null,
      openingName: null,
    },
    { loadedGame: null, enginePositions: null },
  ];

  it("every pill the generator writes is routed by rule", () => {
    const seen = new Set<string>();
    for (const input of inputs)
      for (const s of generateSuggestions(input)) seen.add(s.text);
    for (const q of Array.from(seen)) expectRuled(q);
    // Every rule of the generator was reached.
    for (const q of [
      "Analyze my game",
      "Why was Nc7+ a blunder?",
      "Why was Qxc1 a mistake?",
      "Why was Nc7+ a miss?",
      "Walk me through the blunder at 8.Nc7+",
      "What is each of my pieces doing right now?",
      "Why was 5.Nf3 brilliant?",
      "Tell me about the Sicilian Defense",
      "Tell me about the Sicilian Defense: Open, Najdorf Variation",
      "What was the key endgame idea?",
      "Which inaccuracies hurt me the most?",
      "What's the most important moment in this game?",
      "Show me one improvement to study",
      "What's my biggest weakness here?",
    ])
      expect(seen, q).toContain(q);
  });
});

describe("the Masters rows", () => {
  const row = (
    partial: Partial<MasterCandidate> & { san: string }
  ): MasterCandidate => ({ uci: "", count: 0, ...partial });

  it("all three forms are routed by rule", () => {
    for (const san of ["d6", "Nf6", "O-O", "exd5"]) {
      const forms = [
        coachQuestionFor(
          row({
            san,
            count: 68_000,
            whiteWins: 34_000,
            draws: 17_000,
            blackWins: 17_000,
          }),
          "Black"
        ),
        coachQuestionFor(row({ san, count: 12 }), "White"),
        coachQuestionFor(row({ san, eval: -4, rank: 2 }), "Black"),
        coachQuestionFor(row({ san, eval: 35 }), "White"),
        coachQuestionFor(row({ san }), "Black"),
      ];
      for (const q of forms) {
        expectRuled(q, 3);
        const live = resolveLiveIntent(q, {
          anchor: null,
          moves: MOVES,
          playerColor: "w",
        });
        expect(live.rule, q).toBe("ui:masters");
      }
    }
  });
});

/** The template literals in a function's source, as written. */
function templates(body: string): string[] {
  return Array.from(body.matchAll(/`[^`]*`/g)).map((m) => m[0]);
}

/** Every filling of a template, each `${...}` from its own list. */
function fill(
  template: string,
  values: Record<string, readonly string[]>
): string[] {
  let out = [template.slice(1, -1)];
  for (const m of Array.from(
    template.matchAll(/\$\{([\s\S]*?)\}(?=[^}]|$)/g)
  )) {
    const expr = m[1].trim();
    const vs = values[expr];
    if (!vs) throw new Error(`no values for \${${expr}} in ${template}`);
    out = out.flatMap((s) => vs.map((v) => s.replace(m[0], v)));
  }
  return out;
}

describe("the strip's Ask Masti", () => {
  const source = fs.readFileSync(
    path.join(SRC, "preview-analysis/MoveAnalysisCard.tsx"),
    "utf8"
  );
  const start = source.indexOf("function questionFor(");
  const body = source.slice(start, source.indexOf("\n}\n", start));

  it("questionFor has exactly its four templates", () => {
    expect(start).toBeGreaterThan(-1);
    expect(templates(body)).toEqual([
      "`Why was ${a.label} a ${STYLE[cls].label.toLowerCase()}?`",
      '`What did ${mine ? "I" : "my opponent"} miss with ${a.label}?`',
      "`Why was ${a.label} so strong?`",
      "`What was the idea behind ${a.label}?`",
    ]);
  });

  it("every filling of them is routed by rule", () => {
    const values = {
      "a.label": ["8. Nc7+", "7... Qxc1", "1. e4", "3... cxd4", "9... Qxd1+"],
      "STYLE[cls].label.toLowerCase()": ["blunder", "mistake", "inaccuracy"],
      'mine ? "I" : "my opponent"': ["I", "my opponent"],
    };
    for (const t of templates(body))
      for (const q of fill(t, values)) expectRuled(q);
  });
});

describe("the takeover", () => {
  const source = fs.readFileSync(
    path.join(SRC, "preview-analysis/AnalysisImpl.tsx"),
    "utf8"
  );
  const start = source.indexOf("const text = `Walk me through ");
  const template = source.slice(
    start + "const text = ".length,
    source.indexOf("`;", start) + 1
  );

  it("is the template the rule reads", () => {
    expect(start).toBeGreaterThan(-1);
    expect(template).toBe(
      '`Walk me through ${moveNumber}.${\n        ply % 2 === 1 ? "" : ".."\n      }${san}. What\'s the idea behind ${sideLabel}\'s move, what were the alternatives, and what does it change about the position?`'
    );
  });

  it("every filling of it is routed by rule", () => {
    const values = {
      moveNumber: ["8", "7"],
      'ply % 2 === 1 ? "" : ".."': ["", ".."],
      san: ["Nc7+", "Qxc1", "e4"],
      sideLabel: ["White", "Black"],
    };
    for (const q of fill(template, values)) expectRuled(q);
  });
});
