import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { getCoachChatSystemPromptParts } from "@/lib/prompts/coachChatPrompt";
import { buildCompactGameContext } from "@/lib/coach/compactGameContext";
import { EVAL_CLAIM_PARSER_SYSTEM } from "@/lib/mastermind/validators/parserPrompts";
import { CATEGORY_CLASSIFIER_SYSTEM } from "@/lib/mastermind/categorization/categoryPrompts";
import {
  FOLLOWUP_BUDGET,
  FOLLOWUP_LEAN_BUDGET,
  FOLLOWUP_PROMPT_VERSION,
  getFollowUpSystemPromptStable,
} from "@/lib/prompts/followUpPrompt";
import {
  COMPARE_GRAMMAR_VERSION,
  followUpCompareClause,
  followUpCompareReminder,
} from "@/lib/prompts/followUpGrammar";
import {
  MOVES,
  compact,
  fenAt,
  gameEval,
} from "@/lib/coach/__tests__/fieldedFixture";

/**
 * Pathway 3.5a: a follow-up that compares two moves ("8. Qxc1 or 8.
 * Nd6+?") with the client's numbers for both, under COACH_COMPARE with the
 * intent router and COACH_WHATIF_EVALS on. Driven end to end on both
 * validator wings with the REAL pipeline and the REAL referee: only the
 * providers (told apart by what they send), the session, the context
 * lookup and the data fetch are stubbed. Fixture 07 at index 14: the game
 * played 8. Nc7+, the review's best there is 8. Qxc1.
 */

const {
  mockLog,
  mockSession,
  mockCallLLM,
  mockGetAnalysisContext,
  mockFetchDataSources,
} = vi.hoisted(() => ({
  mockLog: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  mockSession: vi.fn(),
  mockCallLLM: vi.fn(),
  mockGetAnalysisContext: vi.fn(),
  mockFetchDataSources: vi.fn(),
}));
vi.mock("@/lib/logging", () => ({
  logger: { child: vi.fn(() => mockLog) },
  withRequestContext: (_: string, fn: () => unknown) => fn(),
  extractRequestId: () => "compare",
  logErrorToSentry: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ requireSession: mockSession }));
vi.mock("@/lib/llmProvider", () => ({
  callLLM: mockCallLLM,
  callLLMStream: vi.fn(),
  LLMError: class LLMError extends Error {},
  PUBLIC_LLM_ERROR: { message: "x", code: "x" },
  toSafeLLMError: (e: unknown) => e,
}));
vi.mock("@/lib/analysisContextCache", () => ({
  getAnalysisContext: mockGetAnalysisContext,
  buildCondensedContext: vi.fn(() => ""),
}));
vi.mock("@/lib/server/firebaseAdmin", () => ({
  getAdminFirestore: vi.fn(),
  AdminConfigError: class extends Error {},
  __resetAdminCacheForTests: vi.fn(),
}));
vi.mock("@/lib/mastermind/wireValidators", async (orig) => ({
  ...(await orig<object>()),
  fetchDataSources: mockFetchDataSources,
}));

import { __resetMastermindEnvCacheForTests } from "@/env";
import { POST } from "@/app/api/chat/route";

const llm = (content: string) => ({
  content,
  inputTokens: 1,
  outputTokens: 1,
  model: "claude-haiku-4-5-20251001",
  provider: "anthropic",
  elapsedMs: 5,
});

const CLASSIFIED =
  '{"category":"position_analysis","confidence":0.9,"rationale":"t"}';
const DRAFT =
  "8. Qxc1 takes the queen that was hanging on c1. 8. Nd6+ gives a check, but exd6 takes the knight. Of the two, the engine prefers 8. Qxc1, by a wide margin.";

type Kind = "router" | "classifier" | "parser" | "coach";
const kindOf = (opts: Record<string, any>): Kind => {
  if (opts.outputSchema?.name === "coach_intent") return "router";
  if (opts.system === CATEGORY_CLASSIFIER_SYSTEM) return "classifier";
  if (opts.outputSchema?.name === "coach_moment") return "coach";
  if (opts.outputSchema || /claims/i.test(String(opts.system ?? "")))
    return "parser";
  return "coach";
};

const answers: { coach: string; evalParser: string | null } = {
  coach: DRAFT,
  evalParser: null,
};
let calls: { kind: Kind; opts: Record<string, any> }[] = [];

function provide() {
  mockCallLLM.mockImplementation(async (opts: Record<string, any>) => {
    const kind = kindOf(opts);
    calls.push({ kind, opts });
    if (kind === "router") return llm('{"intent":"verdict","confidence":0.9}');
    if (kind === "classifier") return llm(CLASSIFIED);
    if (kind === "parser") {
      if (opts.system === EVAL_CLAIM_PARSER_SYSTEM && answers.evalParser)
        return llm(answers.evalParser);
      return llm('{"claims":[]}');
    }
    return llm(answers.coach);
  });
}

/** The eval parser reads one claim from the draft. */
const claim = (span: string, statedCp: number, band: string) =>
  JSON.stringify({
    claims: [
      {
        stated_band: band,
        stated_cp: statedCp,
        supporting_spans: [span],
        confidence: 0.95,
        claim_class: "evaluative",
        perspective: "white",
      },
    ],
  });

const EMPTY_DELTA = {
  fenBefore: "8/8/8/8/8/8/8/K6k w - - 0 1",
  fenAfter: "8/8/8/8/8/8/8/K6k w - - 0 1",
  resolutionFen: "8/8/8/8/8/8/8/K6k w - - 0 1",
  resolutionReason: "quiescent",
  materialDelta: { white: 0, black: 0 },
  pawnStructureDelta: {
    doubledPawnsChange: { white: 0, black: 0 },
    isolatedPawnsChange: { white: 0, black: 0 },
    passedPawnsGained: { white: [], black: [] },
    passedPawnsLost: { white: [], black: [] },
    openFilesGained: [],
    openFilesLost: [],
    semiOpenFilesGained: { white: [], black: [] },
    semiOpenFilesLost: { white: [], black: [] },
  },
  kingSafetyDelta: { white: 0, black: 0 },
  pieceActivityDelta: { gainedActive: [], lostActive: [], newlyTrapped: [] },
  hangingPiecesDelta: { newlyHanging: [], nowDefended: [] },
  threatsDelta: { newThreats: [], resolvedThreats: [], carriedOverThreats: [] },
  isEmptyDelta: true,
};

const tail = getCoachChatSystemPromptParts({
  personalityId: "friendly",
  userRating: 1200,
  username: "kapil",
  playerColorName: "white",
}).perUser;

function context() {
  return {
    contextId: "c",
    gameContext: "",
    compactGameContext: buildCompactGameContext(MOVES, gameEval as never, "w"),
    playedMoves: MOVES,
    systemPrompt: "s",
    systemPromptStable: "stable",
    systemPromptSuffix: tail,
    fewShotExamples: "",
    fen: fenAt(MOVES.length),
    skillLevel: "intermediate",
    playerColor: "w",
    moveCount: 10,
    createdAt: Date.now(),
    initialAnalysis: "Review.",
    gameEval,
    compactContract: compact,
  };
}

const ASKED = {
  role: "asked",
  uci: "d1c1",
  cp: 251,
  depth: 12,
  pv: ["d1c1", "a8b8", "c1f4"],
};
const ND6 = {
  role: "compared",
  uci: "b5d6",
  cp: -130,
  depth: 12,
  pv: ["b5d6", "e7d6"],
};
/** The client's search for "8. Qxc1 or 8. Nd6+?", as coachWhatIf would send it. */
const PAYLOAD = { index: 14, fen: fenAt(14), depth: 12, moves: [ASKED, ND6] };
const Q = "8. Qxc1 or 8. Nd6+?";

async function turn(userMessage: string, extra: Record<string, unknown> = {}) {
  calls = [];
  mockLog.info.mockClear();
  const res = await POST(
    new NextRequest("http://x/api/chat", {
      method: "POST",
      body: JSON.stringify({
        contextId: "c",
        userMessage,
        moveIndex: MOVES.length,
        ...extra,
      }),
      headers: { "Content-Type": "application/json" },
    })
  );
  const json = await res.json();
  const of = (k: Kind) => calls.filter((c) => c.kind === k).map((c) => c.opts);
  const coach = of("coach");
  return {
    status: res.status,
    ga: json.gameAnalysis ?? {},
    router: of("router"),
    coach,
    /** What the coach is sent, as the golden pins it. */
    inputs: coach.map((c) => ({
      system: c.system,
      systemSuffix: c.systemSuffix,
      messages: c.messages,
    })),
    suffix: String(coach[0]?.systemSuffix ?? ""),
    lastUser: String(
      [...(coach[0]?.messages ?? [])]
        .reverse()
        .find((m: { role: string }) => m.role === "user")?.content ?? ""
    ),
    logged: (event: string) =>
      mockLog.info.mock.calls
        .filter((c) => c[0] === event)
        .map((c) => c[1] as Record<string, any>),
  };
}

const allOn = () => {
  vi.stubEnv("COACH_COMPARE", "1");
  vi.stubEnv("COACH_INTENT_ROUTER", "1");
  vi.stubEnv("COACH_WHATIF_EVALS", "1");
};

beforeEach(() => {
  vi.clearAllMocks();
  calls = [];
  answers.coach = DRAFT;
  answers.evalParser = null;
  mockSession.mockResolvedValue({ session: { uid: "u" } });
  mockFetchDataSources.mockResolvedValue({
    featureDelta: EMPTY_DELTA,
    pieceRoleDiff: [],
    scout: undefined,
    userHistory: undefined,
  });
  mockGetAnalysisContext.mockImplementation(() => context());
  provide();
  allOn();
});

afterEach(() => {
  vi.unstubAllEnvs();
  __resetMastermindEnvCacheForTests();
});

describe.each([
  ["validators on", "true"],
  ["validators off", "false"],
])("COACH_COMPARE, %s", (_, validators) => {
  const on = validators === "true";
  beforeEach(() => {
    vi.stubEnv("MASTERMIND_VALIDATORS_ENABLED", validators);
    __resetMastermindEnvCacheForTests();
  });

  it("a compare verifies, anchors on the game's move with the first move asked, and is served the compare grammar", async () => {
    const t = await turn(Q, { clientEvals: PAYLOAD });
    expect(t.status).toBe(200);
    expect(t.ga.clientEvals).toEqual({
      status: "verified",
      index: 14,
      depth: 12,
      compare: true,
    });
    expect(t.ga.anchor).toEqual({
      ply: 15,
      moveNumber: 8,
      color: "w",
      san: "Nc7+",
      askedSan: "Qxc1",
    });
    expect(t.ga.routing).toMatchObject({
      source: "rule",
      intent: "compare",
      rule: "compare:or",
      grammar: "one_move",
    });
    expect(t.router).toHaveLength(0);
    expect(t.coach).toHaveLength(1);
    // The stable prompt is untouched. The clause and the section ride in
    // the uncached suffix and the reminder under the question.
    expect(t.coach[0].system).toBe(
      getFollowUpSystemPromptStable("friendly", FOLLOWUP_BUDGET)
    );
    expect(t.suffix).toContain(followUpCompareClause());
    expect(t.suffix).toContain(
      "The player compares 8. Qxc1 and 8. Nd6+ at this point: two moves from the position before 8. Nc7+."
    );
    expect(t.suffix).toContain(
      "COMPARE SEARCH of the position before 8. Nc7+, at depth 12"
    );
    expect(t.suffix).toContain(
      "  8. Qxc1 (the first move compared): +2.51 (White's perspective), line 8. Qxc1 Rb8 9. Qf4"
    );
    expect(t.suffix).toContain(
      "  8. Nd6+ (the second move compared): -1.30 (White's perspective), line 8. Nd6+ exd6"
    );
    expect(t.suffix).toContain(
      '"Of the two, the engine prefers 8. Qxc1, by a wide margin."'
    );
    expect(t.suffix).toContain("the review's and the compare search's");
    expect(t.suffix).not.toContain("WHAT-IF SEARCH");
    expect(
      t.lastUser.endsWith(
        `\n\n${followUpCompareReminder(null, FOLLOWUP_BUDGET)}`
      )
    ).toBe(true);
    expect(t.lastUser.startsWith(`${Q}\n\n`)).toBe(true);
    expect(t.ga.analysis).toContain("by a wide margin");
    expect(t.logged("followup_anchor")[0]).toMatchObject({
      clientEvals: "verified",
      clientEvalsCompare: true,
      ply: 15,
      askedSan: "Qxc1",
    });
  });

  it("the game's own move as the second: anchored on the first, the played move named, one board for the other", async () => {
    const t = await turn("Qxc1 or Nc7+ here?", {
      moveIndex: 14,
      clientEvals: {
        ...PAYLOAD,
        moves: [ASKED, { ...ND6, uci: "b5c7", cp: -97, pv: ["b5c7", "e8d8"] }],
      },
    });
    expect(t.ga.clientEvals.compare).toBe(true);
    expect(t.ga.anchor).toMatchObject({ ply: 15, askedSan: "Qxc1" });
    expect(t.suffix).toContain(
      "  8. Nc7+ (the second move compared, the move played): -0.97"
    );
    expect(t.suffix).toContain(
      "The player compares 8. Qxc1 and 8. Nc7+ (the move played) at this point"
    );
    expect(t.suffix.split("\n").filter((l) => / instead \(/.test(l))).toEqual([
      "Board AFTER 8. Qxc1 instead (the first move compared, Black to move):",
    ]);
    // Without the payload the words anchor Black's 7... Qxc1.
    expect(t.logged("followup_anchor")[0]).toMatchObject({ wordsPly: 14 });
  });

  // Under the router a compare's row is game_review, outside the
  // position-anchored categories (intentTable.ts), so the eval validator
  // skips the turn on the validators-on wing and the referee, which runs
  // on both wings, is what holds each number to its own move.
  it("a number told beside its own move survives, and one pinned on the other move is caught", async () => {
    const drops = (t: Awaited<ReturnType<typeof turn>>) =>
      t
        .logged("followup_referee_dropped")
        .flatMap((l) => l.dropped as string[]);
    answers.coach =
      "8. Qxc1 keeps White at +2.51 (a whole queen up), so it is the move. 8. Nd6+ gives a check, but exd6 takes the knight.";
    answers.evalParser = claim(
      "8. Qxc1 keeps White at +2.51",
      251,
      "much_better"
    );
    const right = await turn(Q, { clientEvals: PAYLOAD });
    if (on) {
      expect(right.ga.pipeline.finalOutcome).toBe("passed_initial");
      expect(right.ga.pipeline.category).toBe("game_review");
    }
    expect(right.ga.analysis).toContain("+2.51");
    expect(right.ga.analysis).toContain("so it is the move");
    expect(drops(right)).toEqual([]);

    answers.coach =
      "8. Qxc1 drops White to -1.30 (nothing gained), so it is no better. 8. Nd6+ gives a check, but exd6 takes the knight.";
    answers.evalParser = claim("8. Qxc1 drops White to -1.30", -130, "worse");
    const wrong = await turn(Q, { clientEvals: PAYLOAD });
    expect(wrong.ga.analysis).not.toContain("-1.30");
    expect(wrong.ga.analysis).toContain("exd6 takes the knight");
    expect(drops(wrong)).toEqual(["eval:-1.30"]);
  });

  it("two figures in one sentence that names both moves are dropped, swapped or not", async () => {
    answers.coach =
      "8. Qxc1 sits at -1.30 while 8. Nd6+ sits at +2.51 in this search, a swap. 8. Nd6+ gives a check, but exd6 takes the knight.";
    const t = await turn(Q, { clientEvals: PAYLOAD });
    expect(t.ga.analysis).not.toContain("-1.30");
    expect(t.ga.analysis).not.toContain("+2.51");
    expect(t.ga.analysis).toContain("exd6 takes the knight");
    expect(
      t.logged("followup_referee_dropped").flatMap((l) => l.dropped as string[])
    ).toEqual(["eval:-1.30"]);
  });

  it("with any of its flags off, the payload is dropped and the turn is the no-payload turn, byte for byte", async () => {
    for (const [flag, reason] of [
      ["COACH_COMPARE", "shape"],
      ["COACH_INTENT_ROUTER", "shape"],
      ["COACH_WHATIF_EVALS", null],
    ] as const) {
      allOn();
      vi.stubEnv(flag, "");
      const sent = await turn(Q, { clientEvals: PAYLOAD });
      const bare = await turn(Q);
      expect(sent.ga.clientEvals, flag).toEqual(
        reason ? { status: "dropped", reason } : { status: "off" }
      );
      expect(bare.ga.clientEvals, flag).toEqual({ status: "absent" });
      expect(sent.inputs, flag).toEqual(bare.inputs);
      expect(sent.inputs.length, flag).toBeGreaterThan(0);
      expect(sent.ga.analysis, flag).toBe(bare.ga.analysis);
      expect(sent.suffix, flag).not.toContain("COMPARE SEARCH");
    }
  });

  it("words that do not name the two moves, in order, at that number: not_compare, and the no-payload turn", async () => {
    for (const q of [
      "what about 8. Qxc1 instead?",
      "9. Qxc1 or 9. Nd6+?",
      "8. Nd6+ or 8. Qxc1?",
    ]) {
      const sent = await turn(q, { clientEvals: PAYLOAD });
      expect(sent.logged("followup_anchor")[0], q).toMatchObject({
        clientEvals: "dropped",
        clientEvalsReason: "not_compare",
      });
      const bare = await turn(q);
      expect(sent.ga.clientEvals, q).toEqual({
        status: "dropped",
        reason: "not_compare",
      });
      expect(sent.inputs, q).toEqual(bare.inputs);
      expect(sent.ga.analysis, q).toBe(bare.ga.analysis);
    }
  });

  it("is never fielded: the v1 turn, with no output schema", async () => {
    vi.stubEnv("COACH_FOLLOWUP_PROMPT", "fielded");
    const t = await turn(Q, { clientEvals: PAYLOAD });
    expect(t.logged("followup_fielded")).toEqual([
      expect.objectContaining({ eligible: false, reason: "compare" }),
    ]);
    expect(t.ga.followUpPrompt).toBe(FOLLOWUP_PROMPT_VERSION);
    expect(FOLLOWUP_PROMPT_VERSION).toBe("1.3");
    expect(t.coach).toHaveLength(1);
    expect(t.coach[0].outputSchema).toBeUndefined();
    expect(t.suffix).toContain(followUpCompareClause());
  });

  it("lean: the reminder holds the lean budget's sixty words", async () => {
    vi.stubEnv("COACH_FOLLOWUP_LEAN", "1");
    const t = await turn(Q, { clientEvals: PAYLOAD });
    expect(t.ga.followUpBudget).toBe("lean");
    expect(t.lastUser).toContain(
      "[At most 60 words. One short paragraph per move"
    );
    expect(
      t.lastUser.endsWith(followUpCompareReminder(null, FOLLOWUP_LEAN_BUDGET))
    ).toBe(true);
  });

  it("the router's log carries the compare's version and no pending source", async () => {
    const t = await turn(Q, { clientEvals: PAYLOAD });
    expect(t.logged("followup_router")).toEqual([
      expect.objectContaining({
        intent: "compare",
        rule: "compare:or",
        compare: COMPARE_GRAMMAR_VERSION,
        pendingSource: null,
      }),
    ]);
    expect(COMPARE_GRAMMAR_VERSION).toBe("compare-1");
    // The same words with no numbers still wait for the second score.
    const bare = await turn(Q);
    const log = bare.logged("followup_router")[0];
    expect(log).toMatchObject({
      intent: "compare",
      pendingSource: "second_score",
    });
    expect(log).not.toHaveProperty("compare");
    expect(bare.suffix).not.toContain(followUpCompareClause());
  });
});
