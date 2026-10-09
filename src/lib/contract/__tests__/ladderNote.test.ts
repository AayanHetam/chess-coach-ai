/**
 * Pathway 4.9: the line a sentence_drop card carries about what it left out
 * (ladderNote.ts), and the ladder that writes it.
 *
 * The flag, the kind table, the 21 forms of the copy and their hygiene
 * against the referee, which dropped sentences count, where the line goes,
 * how the page's own cut reads it, and the ladder with the option on and
 * off. All key-less: the deterministic referee and injected LLM seams.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dropViolatingSentences,
  dropViolatingSentencesDetailed,
  DEFAULT_LADDER_BUDGETS,
  runInsightLadder,
} from "@/lib/contract/ladder";
import type { LadderCardOpts, LadderCardResult } from "@/lib/contract/ladder";
import {
  GRAMMAR_LINE_RE,
  insertLadderNote,
  isLadderNoteEnabled,
  LADDER_NOTE_KIND_PRIORITY,
  LADDER_NOTE_MIXED_PHRASE,
  LADDER_NOTE_VERSION,
  ladderNoteFor,
  ladderNoteKind,
  renderLadderNote,
  sectionAfter,
  SILENT_SECTIONS,
} from "@/lib/contract/ladderNote";
import type {
  DroppedSentence,
  LadderNoteKind,
} from "@/lib/contract/ladderNote";
import type { ArmingTable, ServingFinding } from "@/lib/contract/armingConfig";
import { renderInsightBlock } from "@/lib/contract/insightGrammar";
import { refereeInsight } from "@/lib/contract/referee";
import { isClaimSentence } from "@/lib/contract/refereeChecks";
import { splitLineSentences } from "@/lib/contract/sentences";
import { liftTurnMoment } from "@/lib/contract/turnMoments";
import { cardKey } from "@/lib/coach/turnMoment";
import { momentFromCardBody } from "@/lib/coach/moment";
import { parseInsights } from "@/components/AICoachInsights.parser";
import { splitInsightWhy } from "@/components/preview-analysis/insightWhy";
import type { StreamCorrectionResult } from "@/lib/mastermind/validators/streamCorrection";
import type { LLMResult } from "@/lib/llmProvider";
import { makeContract, makeInsight } from "./insightFactory";

const insight = makeInsight();
const contract = makeContract([insight]);

/** ladder.test.ts's explicit table: these tests exercise the ladder's machinery. */
const ENFORCE_TABLE: ArmingTable = {
  eval_display: "error",
  san_whitelist: "error",
  tactical_keyword: "error",
  forbidden_claim: "error",
  relational_claim: "error",
  citation_invalid: "error",
};

const CLEAN_BODY =
  "You went for Bd3, but Ne6 was the star move [F:M1]. After Ne6 Qd7 Nxg7 the knight nets material at +3.20 [F:M1.pv0]. A fine fighting choice, just one square short.";
const BAD_EVAL_SENTENCE = "The eval crashed to -9.50 after this.";
const CLEAN_WHY = [
  "[WHY]",
  "Idea: You wanted to develop the bishop and keep things calm.",
  "Problem: The knight had a stronger jump, and the bishop move let it slip.",
  "Find the knight's best square before you develop the bishop.",
  "[/WHY]",
].join("\n");

afterEach(() => {
  vi.unstubAllEnvs();
});

function makeOpts(over: Partial<LadderCardOpts> = {}): LadderCardOpts {
  return {
    insight,
    contract,
    refereeOpts: {
      userRating: 1500,
      correlationId: "t",
      playerPerspective: "white",
    },
    refereeMode: "deterministic",
    citationGranularity: "sentence",
    deadlineAtMs: Date.now() + 60_000,
    budgets: DEFAULT_LADDER_BUDGETS(),
    regenSystem: { stable: "SYS", perUser: "USER" },
    ...over,
  };
}

function llmResult(content: string): LLMResult {
  return {
    content,
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    inputTokens: 100,
    outputTokens: 50,
    elapsedMs: 5,
  } as LLMResult;
}

function finding(
  check: string,
  category: string,
  span: string
): ServingFinding {
  return {
    check,
    category,
    span,
    severity: "error",
    detail: "",
  } as ServingFinding;
}

/** Every form the copy can take: 5 singular, 5 plural, 10 joins, the mixed one. */
function allForms(): string[] {
  const ks = LADDER_NOTE_KIND_PRIORITY;
  const out: string[] = [];
  for (const k of ks) out.push(renderLadderNote([k])!);
  for (const k of ks) out.push(renderLadderNote([k, k])!);
  for (let i = 0; i < ks.length; i++) {
    for (let j = i + 1; j < ks.length; j++)
      out.push(renderLadderNote([ks[j], ks[i]])!);
  }
  out.push(renderLadderNote(["tactic", "evaluation", "move"])!);
  return out;
}

/** The card text with every line that reads `line` removed. */
function withoutLine(text: string, line: string): string {
  return text
    .split("\n")
    .filter((l) => l.trim() !== line)
    .join("\n");
}

describe("isLadderNoteEnabled", () => {
  it("is off unless the env says 1, on or true, and is read per call", () => {
    vi.stubEnv("COACH_LADDER_NOTE", undefined);
    expect(isLadderNoteEnabled()).toBe(false);
    for (const v of ["", "0", "off", "false", "yes"]) {
      vi.stubEnv("COACH_LADDER_NOTE", v);
      expect(isLadderNoteEnabled(), v).toBe(false);
    }
    for (const v of ["1", "on", "true", " TRUE ", "On\n"]) {
      vi.stubEnv("COACH_LADDER_NOTE", v);
      expect(isLadderNoteEnabled(), v).toBe(true);
    }
    vi.stubEnv("COACH_LADDER_NOTE", "0");
    expect(isLadderNoteEnabled()).toBe(false);
  });

  it("keys the cache under ln1", () => {
    expect(LADDER_NOTE_VERSION).toBe("ln1");
  });
});

describe("ladderNoteKind", () => {
  const rows: Array<[string, string, LadderNoteKind]> = [
    ["tactical_keyword", "tactical_keyword_unbacked", "tactic"],
    ["tactical_keyword", "anything", "tactic"],
    ["eval_display", "eval_unbacked", "evaluation"],
    ["eval_display", "mate_distance_wrong", "evaluation"],
    ["eval_display", "something_else", "point"],
    ["stage9_mate_in_n", "mate_in_n", "evaluation"],
    ["san_whitelist", "san_unknown", "move"],
    ["san_whitelist", "hypothetical_line_off_contract", "move"],
    ["san_whitelist", "square_unknown", "pieces"],
    ["san_whitelist", "something_else", "point"],
    ["mobility_claims", "mobility_count_wrong", "pieces"],
    ["relational_claim", "relational_claim", "pieces"],
    ["forbidden_claim", "forbidden_claim_present", "point"],
    ["stage9_positional_claim", "positional_claim", "point"],
    ["stage9_material_win", "material_win", "point"],
    ["stage9_user_visibility", "user_visibility", "point"],
    ["citation_invalid", "citation_invalid", "point"],
    ["a_check_nobody_wrote", "x", "point"],
  ];
  it.each(rows)("%s / %s is %s", (check, category, kind) => {
    expect(ladderNoteKind({ check, category } as ServingFinding)).toBe(kind);
  });
});

describe("renderLadderNote", () => {
  it("names one kind once, or as some", () => {
    expect(renderLadderNote([])).toBeNull();
    expect(renderLadderNote(["tactic"])).toBe(
      "I left out a tactic I couldn't check."
    );
    expect(renderLadderNote(["evaluation"])).toBe(
      "I left out an evaluation I couldn't check."
    );
    expect(renderLadderNote(["move"])).toBe(
      "I left out a move I couldn't check."
    );
    expect(renderLadderNote(["pieces"])).toBe(
      "I left out a point about the pieces I couldn't check."
    );
    expect(renderLadderNote(["point"])).toBe(
      "I left out a point I couldn't check."
    );
    expect(renderLadderNote(["tactic", "tactic"])).toBe(
      "I left out some tactics I couldn't check."
    );
    expect(renderLadderNote(["evaluation", "evaluation", "evaluation"])).toBe(
      "I left out some evaluations I couldn't check."
    );
    expect(renderLadderNote(["move", "move"])).toBe(
      "I left out some moves I couldn't check."
    );
    expect(renderLadderNote(["pieces", "pieces"])).toBe(
      "I left out some points about the pieces I couldn't check."
    );
    expect(renderLadderNote(["point", "point"])).toBe(
      "I left out a few points I couldn't check."
    );
  });

  it("joins two sentences of two kinds in priority order", () => {
    const joins: Array<[LadderNoteKind, LadderNoteKind, string]> = [
      ["tactic", "evaluation", "a tactic and an evaluation"],
      ["tactic", "move", "a tactic and a move"],
      ["tactic", "pieces", "a tactic and a point about the pieces"],
      ["tactic", "point", "a tactic and a point"],
      ["evaluation", "move", "an evaluation and a move"],
      ["evaluation", "pieces", "an evaluation and a point about the pieces"],
      ["evaluation", "point", "an evaluation and a point"],
      ["move", "pieces", "a move and a point about the pieces"],
      ["move", "point", "a move and a point"],
      ["pieces", "point", "a point about the pieces and a point"],
    ];
    for (const [a, b, phrase] of joins) {
      const want = `I left out ${phrase} I couldn't check.`;
      expect(renderLadderNote([a, b])).toBe(want);
      expect(renderLadderNote([b, a])).toBe(want);
    }
  });

  it("says a few points past that", () => {
    expect(LADDER_NOTE_MIXED_PHRASE).toBe("a few points");
    for (const kinds of [
      ["tactic", "evaluation", "move"],
      ["tactic", "tactic", "evaluation"],
      ["pieces", "move", "pieces", "move"],
    ] as LadderNoteKind[][]) {
      expect(renderLadderNote(kinds)).toBe(
        "I left out a few points I couldn't check."
      );
    }
  });
});

describe("the copy is clean against the referee in every form", () => {
  const forms = allForms();

  it("has 21 forms", () => {
    expect(forms).toHaveLength(21);
  });

  it.each(forms)("%s", (s) => {
    expect(s).not.toContain(String.fromCharCode(0x2014)); // an em dash
    expect(s).not.toContain(";");
    expect(s).not.toMatch(/\d/);
    expect(s).not.toMatch(/[a-h][1-8]/);
    expect(s).not.toContain(String.fromCharCode(0x2019)); // a curly apostrophe
    expect(s).toContain("couldn't");
    expect(s.endsWith(".")).toBe(true);
    const r = refereeInsight(s, makeInsight(), {
      userRating: 1500,
      correlationId: "t",
      contract: makeContract([makeInsight()]),
    });
    expect(r.findings).toEqual([]);
    expect(isClaimSentence(s)).toBe(false);
    expect(splitLineSentences(s)).toHaveLength(1);
    expect(GRAMMAR_LINE_RE.test(s)).toBe(false);
  });
});

describe("sectionAfter", () => {
  it("an open token sets the section, its close clears it, other tokens leave it", () => {
    expect(sectionAfter("[WHY]", null)).toBe("WHY");
    expect(sectionAfter("  [THREATS]  ", null)).toBe("THREATS");
    expect(sectionAfter("[CONCEPT:fork:Fork]", null)).toBe("CONCEPT");
    expect(sectionAfter("[ENGINE_LINE]", null)).toBe("ENGINE_LINE");
    expect(sectionAfter("[/WHY]", "WHY")).toBeNull();
    expect(sectionAfter("[/THREATS]", "WHY")).toBe("WHY");
    expect(sectionAfter("[CONTINUATION:12:w]", "WHY")).toBe("WHY");
    expect(sectionAfter("[CONTINUATION:12:w]", null)).toBeNull();
    expect(sectionAfter("Some prose.", "ROLES")).toBe("ROLES");
  });

  it("silences the sections the page never renders, and only those", () => {
    expect(Array.from(SILENT_SECTIONS).sort()).toEqual([
      "CONCEPT",
      "ENGINE_LINE",
      "ROLES",
      "THREATS",
    ]);
    expect(SILENT_SECTIONS.has("WHY")).toBe(false);
  });
});

describe("ladderNoteFor", () => {
  const evalSpan = "-9.50";
  const errors = [finding("eval_display", "eval_unbacked", evalSpan)];

  it("counts a top-level sentence and a [WHY] sentence", () => {
    const dropped: DroppedSentence[] = [
      { text: "The eval crashed to -9.50 after this.", section: null },
      { text: "Problem: it went to -9.50 at once.", section: "WHY" },
    ];
    expect(ladderNoteFor(dropped, errors)).toEqual({
      text: "I left out some evaluations I couldn't check.",
      kinds: ["evaluation", "evaluation"],
      version: "ln1",
    });
  });

  it("does not count [THREATS], [ROLES], [CONCEPT] or [ENGINE_LINE], and an all-silent drop has no note", () => {
    for (const section of [
      "THREATS",
      "ROLES",
      "CONCEPT",
      "ENGINE_LINE",
    ] as const) {
      expect(
        ladderNoteFor([{ text: "It sits at -9.50 now.", section }], errors),
        section
      ).toBeNull();
    }
    const mixed = ladderNoteFor(
      [
        { text: "It sits at -9.50 now.", section: "THREATS" },
        { text: "The eval crashed to -9.50 after this.", section: null },
      ],
      errors
    );
    expect(mixed?.kinds).toEqual(["evaluation"]);
    expect(ladderNoteFor([], errors)).toBeNull();
  });

  it("takes the kind of the highest-priority finding a sentence held", () => {
    const sentence = "The skewer on c5 decided it.";
    const note = ladderNoteFor(
      [{ text: sentence, section: null }],
      [
        finding("san_whitelist", "square_unknown", "c5"),
        finding("tactical_keyword", "tactical_keyword_unbacked", "skewer"),
      ]
    );
    expect(note?.kinds).toEqual(["tactic"]);
    expect(note?.text).toBe("I left out a tactic I couldn't check.");
  });

  it("reads the finding that cut the sentence, never another sentence's", () => {
    const note = ladderNoteFor(
      [{ text: "The knight had no legal moves.", section: "WHY" }],
      [
        finding("tactical_keyword", "tactical_keyword_unbacked", "skewer"),
        finding("mobility_claims", "mobility_count_wrong", "no legal moves"),
      ]
    );
    expect(note?.kinds).toEqual(["pieces"]);
  });

  it("reads a tactical keyword at a word start, as the referee does", () => {
    const hanging = [
      finding("tactical_keyword", "tactical_keyword_unbacked", "hanging"),
    ];
    // The drop cuts these by substring, but none holds the claim.
    for (const text of [
      "Idea: You wanted to keep exchanging pieces.",
      "Solution: keeping the knight on d4 held it.",
    ]) {
      expect(
        ladderNoteFor([{ text, section: "WHY" }], hanging),
        text
      ).toBeNull();
    }
    const pin = [
      finding("tactical_keyword", "tactical_keyword_unbacked", "pin"),
    ];
    expect(
      ladderNoteFor(
        [
          {
            text: "Solution: keeping the knight on d4 held it.",
            section: "WHY",
          },
        ],
        pin
      )
    ).toBeNull();
    // A capitalised claim still counts.
    expect(
      ladderNoteFor(
        [{ text: "Pinned, the knight could not move.", section: null }],
        [finding("tactical_keyword", "tactical_keyword_unbacked", "pin")]
      )?.kinds
    ).toEqual(["tactic"]);
    // A sentence that held an evaluation too is named for the evaluation.
    expect(
      ladderNoteFor(
        [
          {
            text: "You were exchanging pieces and it crashed to -9.50.",
            section: null,
          },
        ],
        [...hanging, ...errors]
      )?.kinds
    ).toEqual(["evaluation"]);
  });
});

describe("insertLadderNote", () => {
  const NOTE = "I left out a tactic I couldn't check.";

  it("puts the note between the lede and [WHY]", () => {
    expect(insertLadderNote("Lede here.\n[WHY]\nIdea: x.\n[/WHY]", NOTE)).toBe(
      `Lede here.\n${NOTE}\n[WHY]\nIdea: x.\n[/WHY]`
    );
  });

  it("with no lede, directly before [WHY]", () => {
    expect(insertLadderNote("[WHY]\nIdea: x.\n[/WHY]", NOTE)).toBe(
      `${NOTE}\n[WHY]\nIdea: x.\n[/WHY]`
    );
  });

  it("after the lede when a top-level grammar line comes before [WHY]", () => {
    expect(
      insertLadderNote(
        "Lede here.\n[CONTINUATION:11:w]\n[WHY]\nIdea: x.\n[/WHY]",
        NOTE
      )
    ).toBe(`Lede here.\n${NOTE}\n[CONTINUATION:11:w]\n[WHY]\nIdea: x.\n[/WHY]`);
  });

  it("after the last prose line before the first section, blank lines kept", () => {
    expect(
      insertLadderNote(
        "Lede one.\n\nLede two.\n\n\n[THREATS]\nT.\n[/THREATS]\n[WHY]\nW.\n[/WHY]",
        NOTE
      )
    ).toBe(
      `Lede one.\n\nLede two.\n${NOTE}\n\n\n[THREATS]\nT.\n[/THREATS]\n[WHY]\nW.\n[/WHY]`
    );
  });

  it("before a section token that shares its line with prose", () => {
    expect(insertLadderNote("Lede.\n[WHY] Idea: x.\n[/WHY]", NOTE)).toBe(
      `Lede.\n${NOTE}\n[WHY] Idea: x.\n[/WHY]`
    );
  });

  it("after the first prose line of a body with no section", () => {
    expect(insertLadderNote("P1.\n\nP2.\n\nP3.", NOTE)).toBe(
      `P1.\n${NOTE}\n\nP2.\n\nP3.`
    );
    expect(insertLadderNote("\nP1.", NOTE)).toBe(`\nP1.\n${NOTE}`);
    expect(insertLadderNote("", NOTE)).toBe(`\n${NOTE}`);
  });
});

/**
 * The page's own cut (DarkInsightCard calls these): the note reads as part
 * of the lede, and the [WHY] cut, the Lesson included, is what it would be
 * without the note.
 */
describe("the page reads the note as part of the lede, never as the Lesson", () => {
  const NOTE = "I left out a tactic I couldn't check.";
  const WHY = [
    "[WHY]",
    "Idea: You wanted to develop the bishop and keep things calm.",
    "Problem: The knight had a stronger jump, and the bishop move let it slip.",
    "Solution: Ne6 first, and the queen has to answer it.",
    "Find the knight's best square before you develop the bishop.",
    "[/WHY]",
  ].join("\n");
  const shapes: Array<[string, string]> = [
    ["lede then [WHY]", `You went for Bd3, but Ne6 was the star move.\n${WHY}`],
    ["no lede", WHY],
    [
      "a grammar line before [WHY]",
      `You went for Bd3, but Ne6 was the star move.\n[CONTINUATION:11:w]\n${WHY}`,
    ],
    [
      "sections after [WHY]",
      `You went for Bd3.\n\nNe6 was the star move.\n${WHY}\n[THREATS]\nThe queen is loose.\n[/THREATS]`,
    ],
    [
      "no sections",
      "You went for Bd3.\n\nNe6 was the star move.\n\nFind the knight's best square first.",
    ],
  ];

  it.each(shapes)("%s", (_name, body) => {
    const noted = renderInsightBlock(insight, insertLadderNote(body, NOTE));
    const plain = renderInsightBlock(insight, body);
    const a = parseInsights(noted).insights[0];
    const b = parseInsights(plain).insights[0];
    expect(a.headline).toContain(NOTE);
    expect(b.headline).not.toContain(NOTE);
    expect(a.why).toEqual(b.why);
    expect(splitInsightWhy(a.why)).toEqual(splitInsightWhy(b.why));
    expect(momentFromCardBody(a.why ?? "")).toEqual(
      momentFromCardBody(b.why ?? "")
    );
    expect(splitInsightWhy(a.why).lesson ?? "").not.toContain("couldn't check");
  });

  // COACH_TURN1_MOMENTS (4.1) cuts a card with no [WHY] from its lede, so
  // the lift is told which line the ladder wrote and cuts as if it were
  // not there, keyed on the card's exact text.
  it.each(shapes)(
    "the turn-1 lift leaves the note out of every field: %s",
    (_name, body) => {
      const notedText = renderInsightBlock(
        insight,
        insertLadderNote(body, NOTE)
      );
      const plainText = renderInsightBlock(insight, body);
      const noted = liftTurnMoment({
        insight,
        stage: "sentence_drop",
        finalText: notedText,
        noteLine: NOTE,
      });
      const plain = liftTurnMoment({
        insight,
        stage: "sentence_drop",
        finalText: plainText,
      });
      expect(noted).not.toBeNull();
      expect(noted!.card.key).toBe(cardKey(notedText));
      expect({ ...noted!, card: { ...noted!.card, key: "" } }).toEqual({
        ...plain!,
        card: { ...plain!.card, key: "" },
      });
      expect(JSON.stringify(noted)).not.toContain("couldn't check");
    }
  );

  it("without being told, the lift of a card with no [WHY] would take the note as prose", () => {
    const body =
      "You went for Bd3.\n\nNe6 was the star move.\n\nFind the knight's best square first.";
    const finalText = renderInsightBlock(insight, insertLadderNote(body, NOTE));
    const untold = liftTurnMoment({
      insight,
      stage: "sentence_drop",
      finalText,
    });
    expect(JSON.stringify(untold)).toContain("couldn't check");
  });
});

describe("dropViolatingSentencesDetailed", () => {
  it("keeps today's text and fraction, and lists each dropped sentence with its section", () => {
    const body = [
      `${CLEAN_BODY} ${BAD_EVAL_SENTENCE}`,
      "[WHY]",
      "Idea: You wanted to develop the bishop and keep things calm.",
      "Problem: It slid to -9.50 at once. The knight had a stronger jump.",
      "[CONTINUATION:11:w]",
      "[/WHY]",
      "[THREATS]",
      "The queen is loose. Black stands at -9.50 here.",
      "[/THREATS]",
    ].join("\n");
    const res = dropViolatingSentencesDetailed(body, ["-9.50"])!;
    expect(res.text).toBe(dropViolatingSentences(body, ["-9.50"]));
    expect(res.text).toBe(
      [
        CLEAN_BODY,
        "[WHY]",
        "Idea: You wanted to develop the bishop and keep things calm.",
        "The knight had a stronger jump.",
        "[CONTINUATION:11:w]",
        "[/WHY]",
        "[THREATS]",
        "The queen is loose.",
        "[/THREATS]",
      ].join("\n")
    );
    expect(res.removedFraction).toBe(TODAY_REMOVED_FRACTION);
    expect(res.dropped).toEqual([
      { text: BAD_EVAL_SENTENCE, section: null },
      { text: "Problem: It slid to -9.50 at once.", section: "WHY" },
      { text: "Black stands at -9.50 here.", section: "THREATS" },
    ]);
  });

  it("lists nothing when there is nothing to drop", () => {
    expect(dropViolatingSentencesDetailed(CLEAN_BODY, [])).toEqual({
      text: CLEAN_BODY,
      removedFraction: 0,
      dropped: [],
    });
  });
});

describe("runInsightLadder with the note", () => {
  const LEDE_DROP_BODY = `${CLEAN_BODY} ${BAD_EVAL_SENTENCE}\n${CLEAN_WHY}`;
  const THREATS_DROP_BODY = `${CLEAN_BODY}\n${CLEAN_WHY}\n[THREATS]\nThe queen is loose. ${BAD_EVAL_SENTENCE}\n[/THREATS]`;

  async function both(
    body: string,
    over: () => Partial<LadderCardOpts> = () => ({})
  ) {
    const omitted = await runInsightLadder(
      body,
      makeOpts(over()),
      ENFORCE_TABLE
    );
    const off = await runInsightLadder(
      body,
      makeOpts({ ...over(), ladderNote: false }),
      ENFORCE_TABLE
    );
    const on = await runInsightLadder(
      body,
      makeOpts({ ...over(), ladderNote: true }),
      ENFORCE_TABLE
    );
    return { omitted, off, on };
  }

  const comparable = (r: LadderCardResult) => ({ ...r, elapsedMs: 0 });

  it("omitted and false give the same card, with no note", async () => {
    const { omitted, off } = await both(LEDE_DROP_BODY);
    expect(omitted.stage).toBe("sentence_drop");
    expect(comparable(off)).toEqual(comparable(omitted));
    expect("note" in omitted).toBe(false);
    expect("note" in off).toBe(false);
  });

  it("on, a lede drop carries the note between the lede and [WHY], and nothing else changes", async () => {
    const { off, on } = await both(LEDE_DROP_BODY);
    expect(on.stage).toBe("sentence_drop");
    expect(on.note).toEqual({
      text: "I left out an evaluation I couldn't check.",
      kinds: ["evaluation"],
      version: "ln1",
    });
    expect(withoutLine(on.finalText, on.note!.text)).toBe(off.finalText);
    const lines = on.finalText.split("\n");
    const at = lines.indexOf(on.note!.text);
    expect(lines[at + 1]).toBe("[WHY]");
    expect(lines[at - 1]).toContain("A fine fighting choice");
    // Apart from the note and its line, the result is the flag-off result.
    expect({
      ...comparable(on),
      note: undefined,
      finalText: off.finalText,
    }).toEqual(comparable(off));
  });

  it("on, a [THREATS] tactic whose keyword sits inside a word of the Idea line has no note", async () => {
    const body = [
      CLEAN_BODY,
      "[WHY]",
      "Idea: You wanted to keep exchanging pieces so the position stays calm.",
      "Problem: The knight had a stronger jump, and the bishop move let it slip.",
      "Find the knight's best square before you develop the bishop.",
      "[/WHY]",
      "[THREATS]",
      "- The pawn on g7 is hanging.",
      "[/THREATS]",
    ].join("\n");
    const { off, on } = await both(body);
    expect(on.stage).toBe("sentence_drop");
    // The drop itself is the flag-off drop, Idea line included.
    expect(off.finalText).not.toContain("exchanging");
    expect("note" in on).toBe(false);
    expect(on.finalText).toBe(off.finalText);
  });

  it("on, a drop inside [THREATS] alone has no note and the same text", async () => {
    const { off, on } = await both(THREATS_DROP_BODY);
    expect(on.stage).toBe("sentence_drop");
    expect("note" in on).toBe(false);
    expect(on.finalText).toBe(off.finalText);
    expect(on.finalText).not.toContain("-9.50");
  });

  it("on, the deferred heavy drop carries the note", async () => {
    const body =
      "A perfectly clean coaching sentence that survives the excision here.\n" +
      "The eval crashed to -9.50 after this, and the long slide that followed left the bishop with nothing to do and the king with no shelter at all.";
    const correct = () =>
      vi.fn(
        async (): Promise<StreamCorrectionResult> => ({
          correctedText: `${body}\n\n---\n*Engine check: ...*`,
          mode: "footnoted",
          costUsd: 0,
        })
      );
    const callLLMImpl = vi.fn(async () => llmResult(CLEAN_BODY));
    const offCorrect = correct();
    const onCorrect = correct();
    const off = await runInsightLadder(
      body,
      makeOpts({ deps: { correctImpl: offCorrect, callLLMImpl } }),
      ENFORCE_TABLE
    );
    const on = await runInsightLadder(
      body,
      makeOpts({
        deps: { correctImpl: onCorrect, callLLMImpl },
        ladderNote: true,
      }),
      ENFORCE_TABLE
    );
    expect(onCorrect).toHaveBeenCalledOnce();
    expect(callLLMImpl).not.toHaveBeenCalled();
    expect(on.stage).toBe("sentence_drop");
    expect(on.editsUsed).toBe(1);
    expect(on.note?.kinds).toEqual(["evaluation"]);
    expect(withoutLine(on.finalText, on.note!.text)).toBe(off.finalText);
  });

  it("every other rung is the same with the note on", async () => {
    const gutBody =
      "The eval crashed to -9.50 which loses everything for -9.50 reasons.";
    const cases: Array<[string, string, () => Partial<LadderCardOpts>]> = [
      ["pass", CLEAN_BODY, () => ({})],
      [
        "edited",
        gutBody,
        () => ({
          deps: {
            correctImpl: async (): Promise<StreamCorrectionResult> => ({
              correctedText: CLEAN_BODY,
              mode: "edited",
              costUsd: 0,
            }),
          },
        }),
      ],
      [
        "regenerated",
        gutBody,
        () => ({
          deps: {
            correctImpl: async (): Promise<StreamCorrectionResult> => ({
              correctedText: gutBody,
              mode: "footnoted",
              costUsd: 0,
            }),
            callLLMImpl: async () => llmResult(CLEAN_BODY),
          },
        }),
      ],
      [
        "templated",
        gutBody,
        () => ({
          budgets: {
            editsRemaining: 0,
            regensRemaining: 0,
            relationalRemaining: 0,
          },
        }),
      ],
      [
        "passthrough_footnoted",
        LEDE_DROP_BODY,
        () => ({
          refereeOpts: {
            get userRating(): number {
              throw new Error("referee down");
            },
            correlationId: "t",
          },
        }),
      ],
    ];
    for (const [stage, body, over] of cases) {
      const { off, on } = await both(body, over);
      expect(on.stage, stage).toBe(stage);
      expect(off.stage, stage).toBe(stage);
      expect(on.finalText, stage).toBe(off.finalText);
      expect("note" in on, stage).toBe(false);
    }
  });
});

/** removedFraction of the first dropViolatingSentencesDetailed case at 72261a8, before this change. */
const TODAY_REMOVED_FRACTION = 0.26790450928381965;
