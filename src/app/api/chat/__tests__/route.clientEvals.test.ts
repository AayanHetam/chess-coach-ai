import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { Chess } from "chess.js";
import { toCompactContract } from "@/lib/contract/followUp";
import {
  makeContract,
  makeInsight,
} from "@/lib/contract/__tests__/insightFactory";

/**
 * PR 2.3's exit: a correct what-if number survives the validator.
 *
 * The route is driven end to end with the REAL validator pipeline and the
 * REAL referee: only the providers are stubbed (the coach's draft and the
 * eval parser's reading of it come through the mocked callLLM, the parser
 * told apart by its system prompt), plus the session, the cached context,
 * the category classifier and the data sources. route.test.ts mocks the
 * validators as a whole; this file must not, or it proves nothing.
 *
 * Fixture 07 at move 8: the game played 8. Nc7+ (the review has the
 * position after it at -2.11), and the client's search scored 8. Qxc1 at
 * +2.51 beside 8. Nc7+ at -0.97. Before this PR the eval validator checked
 * every claim against the played move's eval, so "8. Qxc1 keeps White at
 * +2.51" was an error and the sentence was deleted. The figures sit
 * mid-sentence: the referee's eval check does not read a figure at the end
 * of a sentence, and a test written that way would pass for the wrong
 * reason.
 */

const {
  mockLog,
  mockSession,
  mockCallLLM,
  mockGetAnalysisContext,
  mockClassifyQuestion,
  mockFetchDataSources,
} = vi.hoisted(() => ({
  mockLog: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  mockSession: vi.fn(),
  mockCallLLM: vi.fn(),
  mockGetAnalysisContext: vi.fn(),
  mockClassifyQuestion: vi.fn(),
  mockFetchDataSources: vi.fn(),
}));
vi.mock("@/lib/logging", () => ({
  logger: { child: vi.fn(() => mockLog) },
  withRequestContext: (_: string, fn: () => unknown) => fn(),
  extractRequestId: () => "client-evals",
  logErrorToSentry: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ requireSession: mockSession }));
vi.mock("@/lib/llmProvider", () => ({
  callLLM: mockCallLLM,
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
vi.mock("@/lib/mastermind/categorization/categoryClassifier", async (orig) => ({
  ...(await orig<object>()),
  classifyQuestion: mockClassifyQuestion,
}));
vi.mock("@/lib/mastermind/wireValidators", async (orig) => ({
  ...(await orig<object>()),
  fetchDataSources: mockFetchDataSources,
}));

import { __resetMastermindEnvCacheForTests } from "@/env";
import { EVAL_CLAIM_PARSER_SYSTEM } from "@/lib/mastermind/validators";
import { POST } from "@/app/api/chat/route";

const GAME =
  "e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Qb6 Nf3 Qxb2 Na3 Qxa1 Nb5 Qxc1 Nc7+ Kd8".split(
    " "
  );
const FEN_BEFORE_8 = (() => {
  const g = new Chess();
  for (const m of GAME.slice(0, 14)) g.move(m);
  return g.fen();
})();

function gameEval() {
  const positions: Array<Record<string, unknown>> = Array.from(
    { length: GAME.length + 1 },
    () => ({ lines: [{ pv: [], cp: 0, depth: 16, multiPv: 1 }] })
  );
  // Before move 8 the review's best is Qxc1; after 8. Nc7+ it is -2.11.
  positions[14] = {
    lines: [{ pv: ["d1c1", "a8b8"], cp: 284, depth: 16, multiPv: 1 }],
    bestMove: "d1c1",
  };
  positions[15] = { lines: [{ pv: [], cp: -211, depth: 16, multiPv: 1 }] };
  return { positions };
}

/** The client's what-if for move 8, as coachWhatIf.ts would send it. */
const CLIENT_EVALS = {
  index: 14,
  fen: FEN_BEFORE_8,
  depth: 12,
  moves: [
    {
      role: "asked",
      uci: "d1c1",
      cp: 251,
      depth: 12,
      pv: ["d1c1", "a8b8", "c1f4", "g8f6"],
    },
    {
      role: "played",
      uci: "b5c7",
      cp: -97,
      depth: 12,
      pv: ["b5c7", "e8d8", "c7a8"],
    },
  ],
};

const llm = (content: string) => ({
  content,
  inputTokens: 1,
  outputTokens: 1,
  model: "claude-haiku-4-5",
  provider: "anthropic",
});

/** The coach answers `draft`; the eval parser reads one claim from it. */
function provider(draft: string, span: string, statedCp: number, band: string) {
  const coachCalls: Array<Record<string, any>> = [];
  mockCallLLM.mockImplementation(async (opts: Record<string, any>) => {
    if (opts.system === EVAL_CLAIM_PARSER_SYSTEM)
      return llm(
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
        })
      );
    if (opts.outputSchema) return llm('{"claims":[]}');
    coachCalls.push(opts);
    return llm(draft);
  });
  return coachCalls;
}

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

function ask(userMessage: string, clientEvals?: unknown) {
  return POST(
    new NextRequest("http://x/api/chat", {
      method: "POST",
      body: JSON.stringify({
        contextId: "c",
        userMessage,
        moveIndex: 0,
        ...(clientEvals === undefined ? {} : { clientEvals }),
      }),
      headers: { "Content-Type": "application/json" },
    })
  );
}

const DRAFT =
  "8. Qxc1 keeps White at +2.51 (a whole queen up), so it was the move. 8. Nc7+ hands Black the queen for a rook.";
const SPAN = "8. Qxc1 keeps White at +2.51";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("MASTERMIND_VALIDATORS_ENABLED", "true");
  vi.stubEnv("COACH_WHATIF_EVALS", "1");
  __resetMastermindEnvCacheForTests();
  mockSession.mockResolvedValue({ session: { uid: "u" } });
  mockClassifyQuestion.mockResolvedValue({
    category: "position_analysis",
    confidence: 0.9,
    rationale: "t",
  });
  mockFetchDataSources.mockResolvedValue({
    featureDelta: EMPTY_DELTA,
    pieceRoleDiff: [],
    scout: undefined,
    userHistory: undefined,
  });
  mockGetAnalysisContext.mockReturnValue({
    contextId: "c",
    gameContext: "",
    compactGameContext: "## compact",
    playedMoves: GAME,
    systemPrompt: "s",
    fewShotExamples: "",
    fen: "8/8/8/8/8/8/8/K6k w - - 0 1",
    skillLevel: "intermediate",
    playerColor: "w",
    moveCount: 8,
    createdAt: Date.now(),
    initialAnalysis: "Review.",
    gameEval: gameEval(),
    compactContract: toCompactContract(makeContract([makeInsight({})]), ["M1"]),
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  __resetMastermindEnvCacheForTests();
});

describe("a correct what-if number survives the validator (validators on)", () => {
  it("with the client's verified numbers, the sentence is served as written", async () => {
    const coachCalls = provider(DRAFT, SPAN, 251, "much_better");
    const json = await (
      await ask("what about 8. Qxc1 instead?", CLIENT_EVALS)
    ).json();
    expect(json.gameAnalysis.clientEvals).toEqual({
      status: "verified",
      index: 14,
      depth: 12,
    });
    expect(json.gameAnalysis.pipeline.finalOutcome).toBe("passed_initial");
    expect(json.gameAnalysis.analysis).toContain("+2.51");
    expect(json.gameAnalysis.analysis).toContain("so it was the move");
    // One draft, no regeneration.
    expect(coachCalls).toHaveLength(1);
    // The anchor block told the model the what-if's own numbers, labelled.
    const suffix = String(coachCalls[0].systemSuffix);
    expect(suffix).toContain("WHAT-IF SEARCH of the position before 8. Nc7+");
    expect(suffix).toContain(
      "8. Qxc1 (the alternative asked about): +2.51 (White's perspective)"
    );
    expect(suffix).toContain(
      "8. Nc7+ (the move played): -0.97 (White's perspective)"
    );
  });

  it("control: the same draft without the numbers is flagged and the sentence deleted, as before", async () => {
    provider(DRAFT, SPAN, 251, "much_better");
    const json = await (await ask("what about 8. Qxc1 instead?")).json();
    expect(json.gameAnalysis.clientEvals).toEqual({ status: "absent" });
    expect(json.gameAnalysis.pipeline.finalOutcome).not.toBe("passed_initial");
    expect(json.gameAnalysis.analysis).not.toContain("+2.51");
  });

  it("control: the played move's number pinned on the alternative passes without the numbers and is caught with them", async () => {
    // -2.11 is the review's figure after 8. Nc7+, said of 8. Qxc1.
    const wrong =
      "8. Qxc1 drops White to -2.11 (nothing gained), so it was no better. 8. Nc7+ hands Black the queen for a rook.";
    const span = "8. Qxc1 drops White to -2.11";
    provider(wrong, span, -211, "much_worse");
    const without = await (await ask("what about 8. Qxc1 instead?")).json();
    expect(without.gameAnalysis.pipeline.finalOutcome).toBe("passed_initial");
    provider(wrong, span, -211, "much_worse");
    const json = await (
      await ask("what about 8. Qxc1 instead?", CLIENT_EVALS)
    ).json();
    expect(json.gameAnalysis.clientEvals.status).toBe("verified");
    expect(json.gameAnalysis.pipeline.finalOutcome).not.toBe("passed_initial");
    expect(json.gameAnalysis.analysis).not.toContain("-2.11");
  });

  it("control: two moves in one sentence cannot swap numbers", async () => {
    const swapped =
      "Rather than 8. Nc7+, 8. Qxc1 leaves White at -0.97 (no real gain), so it was no better. 8. Nc7+ hands Black the queen for a rook.";
    provider(
      swapped,
      "Rather than 8. Nc7+, 8. Qxc1 leaves White at -0.97",
      -97,
      "slightly_worse"
    );
    const json = await (
      await ask("what about 8. Qxc1 instead?", CLIENT_EVALS)
    ).json();
    expect(json.gameAnalysis.clientEvals.status).toBe("verified");
    expect(json.gameAnalysis.pipeline.finalOutcome).not.toBe("passed_initial");
    expect(json.gameAnalysis.analysis).not.toContain("-0.97");
  });

  it("the review's own number for its best move passes beside the search's cold one", async () => {
    // The review rates 8. Qxc1 at +0.40 (its eval before the move); the
    // client's cold search has +2.51. A sentence quoting the review's
    // figure for the review's best is not wrong.
    const ev = gameEval();
    ev.positions[14] = {
      lines: [{ pv: ["d1c1", "a8b8"], cp: 40, depth: 16, multiPv: 1 }],
      bestMove: "d1c1",
    };
    mockGetAnalysisContext.mockReturnValue({
      ...mockGetAnalysisContext(),
      gameEval: ev,
    });
    const draft =
      "The engine line 8. Qxc1 Rb8 keeps the game at +0.40 (White's perspective) and the queen. 8. Nc7+ hands Black the queen for a rook.";
    provider(
      draft,
      "The engine line 8. Qxc1 Rb8 keeps the game at +0.40",
      40,
      "equal"
    );
    const json = await (
      await ask("what about 8. Qxc1 instead?", CLIENT_EVALS)
    ).json();
    expect(json.gameAnalysis.clientEvals.status).toBe("verified");
    expect(json.gameAnalysis.pipeline.finalOutcome).toBe("passed_initial");
    expect(json.gameAnalysis.analysis).toContain("+0.40");
  });

  it("the game's own move asked about by name is told as the move played, not as an alternative", async () => {
    const coachCalls = provider(DRAFT, SPAN, 251, "much_better");
    const json = await (
      await ask("what about 8. Nc7+?", {
        ...CLIENT_EVALS,
        moves: [
          { ...CLIENT_EVALS.moves[1], role: "asked" },
          { ...CLIENT_EVALS.moves[0], role: "best" },
        ],
      })
    ).json();
    expect(json.gameAnalysis.clientEvals.status).toBe("verified");
    expect(json.gameAnalysis.anchor.askedSan).toBeUndefined();
    const suffix = String(coachCalls[0].systemSuffix);
    expect(suffix).toContain(
      "8. Nc7+ (the move played, asked about): -0.97 (White's perspective)"
    );
    expect(suffix).toContain(
      "8. Qxc1 (the engine's best): +2.51 (White's perspective)"
    );
    expect(suffix).not.toContain("alternative asked about");
  });

  it("a bare question the words anchor elsewhere is grounded on the move the board shows", async () => {
    // "Qxc1" alone was played as 7... Qxc1; the client's verified what-if
    // is White's 8. Qxc1, and the turn follows it.
    const coachCalls = provider(DRAFT, SPAN, 251, "much_better");
    const json = await (
      await ask("what about Qxc1 instead?", CLIENT_EVALS)
    ).json();
    expect(json.gameAnalysis.anchor).toEqual({
      ply: 15,
      moveNumber: 8,
      color: "w",
      san: "Nc7+",
      askedSan: "Qxc1",
    });
    expect(json.gameAnalysis.pipeline.finalOutcome).toBe("passed_initial");
    expect(json.gameAnalysis.analysis).toContain("+2.51");
    expect(String(coachCalls[0].systemSuffix)).toContain(
      "The player asks about Qxc1 as an alternative at this point."
    );
    const anchorLog = mockLog.info.mock.calls.find(
      (c) => c[0] === "followup_anchor"
    )?.[1];
    expect(anchorLog).toMatchObject({
      clientEvals: "verified",
      wordsPly: 14,
      askedSan: "Qxc1",
      ply: 15,
    });
    // The turn is read on the anchor it is served on: the intent is the
    // what-if's, and the contract block says the move has two lines.
    expect(json.gameAnalysis.intent).toMatchObject({
      intent: "what_if",
      rule: "what_if:asked_san",
    });
    expect(String(coachCalls[0].systemSuffix)).toContain(
      "the review's and the what-if search's"
    );
  });

  it("numbers that do not verify are dropped with the reason, and the turn is answered as without them", async () => {
    provider(DRAFT, SPAN, 251, "much_better");
    const json = await (
      await ask("what about 8. Qxc1 instead?", { ...CLIENT_EVALS, index: 15 })
    ).json();
    expect(json.gameAnalysis.clientEvals).toEqual({
      status: "dropped",
      reason: "fen",
    });
    expect(json.gameAnalysis.pipeline.finalOutcome).not.toBe("passed_initial");
    expect(json.gameAnalysis.analysis).not.toContain("+2.51");
    // A malformed payload is not a 400.
    const res = await ask("what about 8. Qxc1 instead?", "not a payload");
    expect(res.status).toBe(200);
    expect((await res.json()).gameAnalysis.clientEvals).toEqual({
      status: "dropped",
      reason: "shape",
    });
  });

  it("with COACH_WHATIF_EVALS off, the field is ignored and the turn is answered as without it", async () => {
    vi.stubEnv("COACH_WHATIF_EVALS", "");
    const sent = provider(DRAFT, SPAN, 251, "much_better");
    const off = await (
      await ask("what about 8. Qxc1 instead?", CLIENT_EVALS)
    ).json();
    const bare = provider(DRAFT, SPAN, 251, "much_better");
    const none = await (await ask("what about 8. Qxc1 instead?")).json();
    expect(off.gameAnalysis.clientEvals).toEqual({ status: "off" });
    expect(none.gameAnalysis.clientEvals).toEqual({ status: "absent" });
    // The same prompt, the same served text: only the echo differs.
    expect(sent[0].systemSuffix).toBe(bare[0].systemSuffix);
    expect(sent[0].messages).toEqual(bare[0].messages);
    expect(off.gameAnalysis.analysis).toBe(none.gameAnalysis.analysis);
    expect(off.gameAnalysis.pipeline.finalOutcome).toBe(
      none.gameAnalysis.pipeline.finalOutcome
    );
    expect(off.gameAnalysis.pipeline.finalOutcome).not.toBe("passed_initial");
  });
});

describe("the referee keeps a licensed what-if number (validators off)", () => {
  beforeEach(() => {
    vi.stubEnv("MASTERMIND_VALIDATORS_ENABLED", "false");
    __resetMastermindEnvCacheForTests();
  });

  it("an alternative's own line and number are kept with the numbers, dropped without; its replies lend to no other line", async () => {
    // 8. Nd6+ was never played: the block names it as the move asked about,
    // but its reply exd6 is in no licensed line. Only the what-if's root
    // walks "Nd6+ exd6", and only its search licenses -1.30.
    const nd6 = {
      ...CLIENT_EVALS,
      moves: [
        {
          role: "asked",
          uci: "b5d6",
          cp: -130,
          depth: 12,
          pv: ["b5d6", "e7d6", "d1c1"],
        },
        CLIENT_EVALS.moves[1],
        { ...CLIENT_EVALS.moves[0], role: "best" },
      ],
    };
    const draft =
      "Nd6+ exd6 just gives the knight away, at -1.30 (White's perspective) for nothing. 8. Nc7+ was the flashier move.";
    const dropReasons = () =>
      mockLog.info.mock.calls
        .filter((c) => c[0] === "followup_referee_dropped")
        .flatMap((c) => c[1].dropped as string[]);
    provider(draft, "", 0, "equal");
    const kept = await (await ask("what about 8. Nd6+ instead?", nd6)).json();
    expect(kept.gameAnalysis.clientEvals.status).toBe("verified");
    expect(kept.gameAnalysis.pipeline).toBeUndefined();
    expect(kept.gameAnalysis.analysis).toContain("Nd6+ exd6 just gives");
    expect(dropReasons()).toEqual([]);

    mockLog.info.mockClear();
    provider(draft, "", 0, "equal");
    const without = await (await ask("what about 8. Nd6+ instead?")).json();
    expect(without.gameAnalysis.analysis).not.toContain("Nd6+ exd6");
    expect(dropReasons()).toEqual(["san:exd6"]);

    // The alternative's number is licensed beside its own move only.
    mockLog.info.mockClear();
    provider(
      "8. Nc7+ still keeps White at -1.30 (White's perspective), roughly. 8. Qxc1 was simpler.",
      "",
      0,
      "equal"
    );
    const pinned = await (await ask("what about 8. Nd6+ instead?", nd6)).json();
    expect(pinned.gameAnalysis.analysis).not.toContain("-1.30");
    expect(dropReasons()).toEqual(["eval:-1.30"]);

    // exd6 answers Nd6+, not Qxc1: the search's lines are walked from
    // their own roots, never pooled.
    mockLog.info.mockClear();
    provider(
      "Qxc1 exd6 is a free pawn, too. 8. Nc7+ was the flashier move.",
      "",
      0,
      "equal"
    );
    const borrowed = await (
      await ask("what about 8. Nd6+ instead?", nd6)
    ).json();
    expect(borrowed.gameAnalysis.analysis).not.toContain("exd6");
    expect(dropReasons()).toEqual(["san:exd6"]);
  });
});
