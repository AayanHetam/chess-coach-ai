import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { toCompactContract } from "@/lib/contract/followUp";
import {
  makeContract,
  makeInsight,
} from "@/lib/contract/__tests__/insightFactory";
import { Chess } from "chess.js";
import { getCoachChatSystemPromptParts } from "@/lib/prompts/coachChatPrompt";
import { buildCompactGameContext } from "@/lib/coach/compactGameContext";

/**
 * PR 2.5: the side a turn looks at the game from.
 *
 * Driven end to end with the real validator pipeline and the real referee,
 * the providers stubbed (as route.clientEvals.test.ts does). Fixture 07:
 * the player is White; Black's 7... Qxc1 is Black's worst move (the engine
 * wanted 7... Kd8 8. Be2 Qxa2 9. O-O), White's 8. Nc7+ the player's.
 *
 * Flag off, on the legacy prompt, or with nothing named, every request is
 * byte for byte what it was. With a side named, the per-turn facts, the
 * tail, the clause and the reminder turn the answer to that side, the
 * player still "you", and the referee licenses the side's own lines.
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
import { POST } from "@/app/api/chat/route";

const GAME =
  "e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Qb6 Nf3 Qxb2 Na3 Qxa1 Nb5 Qxc1 Nc7+ Kd8".split(
    " "
  );

const fenAt = (n: number) => {
  const g = new Chess();
  for (const m of GAME.slice(0, n)) g.move(m);
  return g.fen();
};
const FINAL_FEN = fenAt(GAME.length);

function gameEval() {
  const positions: Array<Record<string, unknown>> = Array.from(
    { length: GAME.length + 1 },
    () => ({ lines: [{ pv: [], cp: 0, depth: 16, multiPv: 1 }] })
  );
  // Before 7... Qxc1 Black stood better; the engine wanted 7... Kd8.
  positions[13] = {
    lines: [
      { pv: ["e8d8", "f1e2", "a1a2", "e1g1"], cp: -263, depth: 16, multiPv: 1 },
    ],
    bestMove: "e8d8",
  };
  // After it White is winning with 8. Qxc1; 8. Nc7+ throws it back.
  positions[14] = {
    lines: [{ pv: ["d1c1", "a8b8"], cp: 284, depth: 16, multiPv: 1 }],
    bestMove: "d1c1",
  };
  positions[15] = { lines: [{ pv: [], cp: -211, depth: 16, multiPv: 1 }] };
  return { positions };
}

const llm = (content: string) => ({
  content,
  inputTokens: 1,
  outputTokens: 1,
  model: "claude-haiku-4-5",
  provider: "anthropic",
});

/** The coach answers `draft`; every parser reads no claims. */
function provider(draft: string) {
  const coachCalls: Array<Record<string, any>> = [];
  mockCallLLM.mockImplementation(async (opts: Record<string, any>) => {
    if (opts.outputSchema || /claims/i.test(String(opts.system ?? "")))
      return llm('{"claims":[]}');
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

const confirmedTail = getCoachChatSystemPromptParts({
  personalityId: "friendly",
  userRating: 1200,
  username: "kapil",
  playerColorName: "white",
}).perUser;
const unconfirmedTail = getCoachChatSystemPromptParts({
  personalityId: "friendly",
  userRating: 1200,
  username: "kapil",
}).perUser;

function context(overrides: Record<string, unknown> = {}) {
  return {
    contextId: "c",
    gameContext: "",
    compactGameContext: buildCompactGameContext(GAME, gameEval() as never, "w"),
    playedMoves: GAME,
    systemPrompt: "s",
    systemPromptStable: "stable",
    systemPromptSuffix: confirmedTail,
    fewShotExamples: "",
    fen: FINAL_FEN,
    skillLevel: "intermediate",
    playerColor: "w",
    moveCount: 8,
    createdAt: Date.now(),
    initialAnalysis: "Review.",
    gameEval: gameEval(),
    compactContract: toCompactContract(makeContract([makeInsight({})]), ["M1"]),
    ...overrides,
  };
}

function ask(userMessage: string, extra: Record<string, unknown> = {}) {
  return POST(
    new NextRequest("http://x/api/chat", {
      method: "POST",
      body: JSON.stringify({
        contextId: "c",
        userMessage,
        moveIndex: 16,
        ...extra,
      }),
      headers: { "Content-Type": "application/json" },
    })
  );
}

const DRAFT =
  "Black grabbed material with the queen and walked into trouble. 7... Kd8 8. Be2 Qxa2 kept Black's queen alive.";

const dropReasons = () =>
  mockLog.info.mock.calls
    .filter((c) => c[0] === "followup_referee_dropped")
    .flatMap((c) => c[1].dropped as string[]);

/** Two requests' model inputs and served text, compared field by field. */
async function pair(a: () => Promise<Response>, b: () => Promise<Response>) {
  const sentA = provider(DRAFT);
  const jsonA = await (await a()).json();
  const sentB = provider(DRAFT);
  const jsonB = await (await b()).json();
  return { sentA, jsonA, sentB, jsonB };
}

function expectSameInputs(r: Awaited<ReturnType<typeof pair>>) {
  expect(r.sentA).toHaveLength(r.sentB.length);
  r.sentA.forEach((call, i) => {
    expect(call.system).toBe(r.sentB[i].system);
    expect(call.systemSuffix).toBe(r.sentB[i].systemSuffix);
    expect(call.messages).toEqual(r.sentB[i].messages);
  });
  expect(r.jsonA.gameAnalysis.analysis).toBe(r.jsonB.gameAnalysis.analysis);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("MASTERMIND_VALIDATORS_ENABLED", "true");
  vi.stubEnv("COACH_PERSPECTIVE", "1");
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
  mockGetAnalysisContext.mockImplementation(() => context());
});

afterEach(() => {
  vi.unstubAllEnvs();
  __resetMastermindEnvCacheForTests();
});

describe.each([
  ["validators on", "true"],
  ["validators off", "false"],
])("byte for byte as before (%s)", (_, validators) => {
  beforeEach(() => {
    vi.stubEnv("MASTERMIND_VALIDATORS_ENABLED", validators);
    __resetMastermindEnvCacheForTests();
  });

  it("flag off: a side named in the words or the field changes nothing", async () => {
    vi.stubEnv("COACH_PERSPECTIVE", "");
    const r = await pair(
      () => ask("why was move 8 bad?", { perspective: "b" }),
      () => ask("why was move 8 bad?")
    );
    expectSameInputs(r);
    expect(r.jsonA.gameAnalysis.perspective).toBeUndefined();
    const named = provider(DRAFT);
    const json = await (
      await ask("from Black's side, what went wrong?")
    ).json();
    expect(json.gameAnalysis.perspective).toBeUndefined();
    expect(String(named[0].systemSuffix)).not.toContain("BLACK'S");
    expect(named[0].messages.at(-1).content).not.toContain(
      "This turn is about"
    );
  });

  it("flag on with nothing named, or the player's own side in the field: as with the flag off", async () => {
    const on = provider(DRAFT);
    const jsonOn = await (
      await ask("why was move 8 bad?", { perspective: "white" })
    ).json();
    vi.stubEnv("COACH_PERSPECTIVE", "");
    const off = provider(DRAFT);
    const jsonOff = await (await ask("why was move 8 bad?")).json();
    expectSameInputs({ sentA: on, jsonA: jsonOn, sentB: off, jsonB: jsonOff });
    expect(jsonOn.gameAnalysis.perspective).toBeUndefined();
    expect(Object.keys(jsonOn.gameAnalysis).sort()).toEqual(
      Object.keys(jsonOff.gameAnalysis).sort()
    );
  });

  it("on the legacy prompt the subject is never read", async () => {
    vi.stubEnv("COACH_FOLLOWUP_PROMPT", "legacy");
    const on = provider(DRAFT);
    const jsonOn = await (
      await ask("from Black's side, why was move 8 bad?", { perspective: "b" })
    ).json();
    vi.stubEnv("COACH_PERSPECTIVE", "");
    const off = provider(DRAFT);
    const jsonOff = await (
      await ask("from Black's side, why was move 8 bad?", { perspective: "b" })
    ).json();
    expectSameInputs({ sentA: on, jsonA: jsonOn, sentB: off, jsonB: jsonOff });
    expect(jsonOn.gameAnalysis.perspective).toBeUndefined();
    expect(jsonOn.gameAnalysis.anchor.ply).toBe(15);
  });
});

describe("a turn about the other side (validators on)", () => {
  it("unanchored, about mistakes: Black's moments first, the clause, the softened tail and the reminder", async () => {
    const sent = provider(DRAFT);
    const json = await (
      await ask("from Black's side, what went wrong?")
    ).json();
    expect(json.gameAnalysis.perspective).toEqual({
      side: "b",
      source: "words",
      rule: "colour_view",
      version: "1",
    });
    expect(json.gameAnalysis.anchor).toBeUndefined();
    const suffix = String(sent[0].systemSuffix);
    // The tail still names the player, and says this turn is about Black.
    expect(suffix).toContain("- The user is playing as: White");
    expect(suffix).not.toContain(
      "- Always analyze the game from the perspective"
    );
    expect(suffix).not.toContain("- Focus your analysis on helping");
    expect(suffix).toContain(
      "- kapil played White and is still \"you\". At kapil's request, this turn is about Black's moves."
    );
    expect(suffix).toContain(
      "- This turn, help kapil learn from Black's moves to improve their own game"
    );
    // The clause comes after the tail, before the game.
    expect(suffix).toContain("THIS TURN IS ABOUT BLACK'S MOVES");
    expect(suffix.indexOf("THIS TURN IS ABOUT")).toBeGreaterThan(
      suffix.indexOf("USER CONTEXT")
    );
    expect(suffix.indexOf("THIS TURN IS ABOUT")).toBeLessThan(
      suffix.indexOf("## THIS GAME")
    );
    // Black's costliest moves in place of the player's, named as the opponent's.
    expect(suffix).toContain(
      "## BLACK'S COSTLIEST MOVES (the player's opponent, by the engine's winning chances, worst first, max 12)\n- Move 7 (Black): Qxc1 [BLUNDER] — eval -2.63 → +2.84 (lost 5.5 pawns); Stockfish preferred Kd8"
    );
    expect(suffix).not.toContain("## TOP MISTAKES");
    // Every line of the player's findings withheld, and said why.
    expect(suffix).toContain(
      "These findings are the player's. This turn is about Black's moves"
    );
    // The key moments, with the engine's line instead and the best reply.
    expect(suffix).toContain(
      "## BLACK'S KEY MOMENTS (the player's opponent, the moves this turn is about)"
    );
    expect(suffix).toContain(
      "- 7... Qxc1, a BLUNDER (Black lost 5.5 pawns). Eval -2.63 → +2.84. The engine preferred 7... Kd8."
    );
    expect(suffix).toContain(
      "  Engine line instead of it: 7... Kd8 8. Be2 Qxa2 9. O-O"
    );
    expect(suffix).toContain(
      "  White's best reply after it: 8. Qxc1 (the engine's line runs 8. Qxc1 Rb8)"
    );
    // The board on screen is kept, for reference only, below the moments.
    expect(suffix).not.toContain("## CURRENTLY VIEWED POSITION");
    expect(suffix.indexOf("## BOARD ON SCREEN")).toBeGreaterThan(
      suffix.indexOf("KEY MOMENTS")
    );
    // The player is still White.
    expect(suffix).toContain("Player: White ·");
    expect(sent[0].messages.at(-1).content).toBe(
      'from Black\'s side, what went wrong?\n\n[At most 100 words. Two or three sentences, then the token line if a line proves it, then the Lesson if there is one to teach. Only moves the facts give for the move asked about. This turn is about Black\'s moves. The player is still "you", and Black is "your opponent".]'
    );
    // The cached prompt is the same one every turn gets.
    const plain = provider(DRAFT);
    await ask("what went wrong?");
    expect(sent[0].system).toBe(plain[0].system);
  });

  it("about the side but not its mistakes: the clause without the moments", async () => {
    const sent = provider(DRAFT);
    const json = await (
      await ask("from Black's side, how does it look now?")
    ).json();
    expect(json.gameAnalysis.perspective.side).toBe("b");
    const suffix = String(sent[0].systemSuffix);
    expect(suffix).toContain("THIS TURN IS ABOUT BLACK'S MOVES");
    expect(suffix).not.toContain("KEY MOMENTS");
    expect(suffix).toContain("## CURRENTLY VIEWED POSITION");
  });

  it("the field alone turns the turn, and a bare move N is the subject's", async () => {
    const sent = provider(DRAFT);
    const json = await (
      await ask("why was move 8 bad?", { perspective: "b" })
    ).json();
    expect(json.gameAnalysis.perspective).toEqual({
      side: "b",
      source: "field",
      rule: "field",
      version: "1",
    });
    expect(json.gameAnalysis.anchor).toMatchObject({
      ply: 16,
      moveNumber: 8,
      color: "b",
      san: "Kd8",
    });
    const suffix = String(sent[0].systemSuffix);
    expect(suffix).toContain(
      "## MOVE UNDER DISCUSSION — 8... Kd8 (Black, the opponent's move, and this turn is about Black's moves). The board will show the position after it."
    );
    // An anchored turn has no key-moments block, and its focus is the move.
    expect(suffix).not.toContain("KEY MOMENTS");
    expect(suffix).not.toContain("These findings are the player's");
  });

  it("a standing field gives way to a question about the player's own play", async () => {
    const sent = provider(DRAFT);
    const json = await (
      await ask("why did I play move 8?", { perspective: "b" })
    ).json();
    expect(json.gameAnalysis.perspective).toEqual({
      side: "b",
      source: "field",
      rule: "field",
      version: "1",
      yielded: "words",
    });
    expect(json.gameAnalysis.anchor).toMatchObject({ ply: 15, san: "Nc7+" });
    const suffix = String(sent[0].systemSuffix);
    expect(suffix).not.toContain("THIS TURN IS ABOUT");
    expect(suffix).toContain("## TOP MISTAKES");
    expect(sent[0].messages.at(-1).content).not.toContain("This turn is about");
  });

  it("the words win over the field: my move is the player's", async () => {
    const sent = provider(DRAFT);
    const json = await (
      await ask("back to my side, why was my move 8 bad?", { perspective: "b" })
    ).json();
    expect(json.gameAnalysis.perspective).toEqual({
      side: "w",
      source: "words",
      rule: "player",
      version: "1",
    });
    expect(json.gameAnalysis.anchor).toMatchObject({ ply: 15, san: "Nc7+" });
    const suffix = String(sent[0].systemSuffix);
    expect(suffix).not.toContain("THIS TURN IS ABOUT");
    expect(suffix).toContain("(White, the player's move). The board");
    expect(suffix).toContain(
      "- Always analyze the game from the perspective of kapil playing as White"
    );
    expect(sent[0].messages.at(-1).content).toContain(
      "This turn is about White's moves, the player's own.]"
    );
  });

  it("with no field, the side the kept history named carries over, the move-N default left the player's", async () => {
    const history = [
      { role: "user", content: "from Black's side, what went wrong?" },
      { role: "assistant", content: "Black grabbed too much." },
    ];
    const sent = provider(DRAFT);
    const json = await (
      await ask("and how could that have been avoided?", {
        conversationHistory: history,
      })
    ).json();
    expect(json.gameAnalysis.perspective).toEqual({
      side: "b",
      source: "history",
      rule: "colour_view",
      version: "1",
    });
    expect(sent[0].messages.at(-1).content).toContain(
      "This turn is about Black's moves."
    );
    expect(String(sent[0].systemSuffix)).toContain("BLACK'S KEY MOMENTS");
    // A bare move N under a carried side is the player's, where the page's
    // own "go to move 8" lands, and the carried side yields to it.
    provider(DRAFT);
    const moved = await (
      await ask("and move 8?", { conversationHistory: history })
    ).json();
    expect(moved.gameAnalysis.anchor).toMatchObject({ ply: 15, san: "Nc7+" });
    expect(moved.gameAnalysis.perspective).toMatchObject({
      side: "b",
      source: "history",
      yielded: "anchor",
    });
  });

  it("a question about the board on screen is not carried, and the player's own question ends a carry", async () => {
    const sent = provider(DRAFT);
    const json = await (
      await ask("what should I play here?", {
        conversationHistory: [
          { role: "user", content: "what is Black's best move?" },
          { role: "assistant", content: "Kd8 is forced." },
        ],
      })
    ).json();
    expect(json.gameAnalysis.perspective).toBeUndefined();
    const suffix = String(sent[0].systemSuffix);
    expect(suffix).toContain("## TOP MISTAKES");
    expect(suffix).not.toContain("THIS TURN IS ABOUT");
    expect(suffix).not.toContain("These findings are the player's");
  });

  it("unconfirmed: back to my side ends the carry and move 8 is the player's", async () => {
    mockGetAnalysisContext.mockImplementation(() =>
      context({ systemPromptSuffix: unconfirmedTail })
    );
    provider(DRAFT);
    const json = await (
      await ask("back to my side, why was move 8 bad?", {
        conversationHistory: [
          { role: "user", content: "from Black's side, what went wrong?" },
          { role: "assistant", content: "Black grabbed too much." },
        ],
      })
    ).json();
    expect(json.gameAnalysis.perspective).toBeUndefined();
    expect(json.gameAnalysis.anchor).toMatchObject({ ply: 15, san: "Nc7+" });
  });

  it("a carried thinking question never anchors the move before the cursor", async () => {
    provider(DRAFT);
    const json = await (
      await ask("how did the game end?", {
        moveIndex: 14,
        conversationHistory: [
          { role: "user", content: "what was my opponent thinking?" },
          { role: "assistant", content: "Greed." },
        ],
      })
    ).json();
    expect(json.gameAnalysis.anchor).toBeUndefined();
  });

  it("a standing side yields to a what-if on the player's own move", async () => {
    vi.stubEnv("COACH_WHATIF_EVALS", "1");
    const fenBefore8 = (() => {
      const g = new Chess();
      for (const m of GAME.slice(0, 14)) g.move(m);
      return g.fen();
    })();
    const sent = provider(DRAFT);
    const json = await (
      await ask("why not Qxc1 instead?", {
        perspective: "b",
        clientEvals: {
          index: 14,
          fen: fenBefore8,
          depth: 12,
          moves: [
            {
              role: "asked",
              uci: "d1c1",
              cp: 251,
              depth: 12,
              pv: ["d1c1", "a8b8"],
            },
            {
              role: "played",
              uci: "b5c7",
              cp: -97,
              depth: 12,
              pv: ["b5c7", "e8d8"],
            },
          ],
        },
      })
    ).json();
    expect(json.gameAnalysis.clientEvals.status).toBe("verified");
    expect(json.gameAnalysis.perspective).toMatchObject({
      side: "b",
      source: "field",
      yielded: "anchor",
    });
    const suffix = String(sent[0].systemSuffix);
    expect(suffix).not.toContain("THIS TURN IS ABOUT");
    expect(suffix).toContain("(White, the player's move). The board");
    expect(sent[0].messages.at(-1).content).not.toContain("This turn is about");
  });

  it("what was Black thinking, asked on the game's board after a Black move: that move", async () => {
    provider(DRAFT);
    const json = await (
      await ask("what was Black thinking?", { moveIndex: 14, fen: fenAt(14) })
    ).json();
    expect(json.gameAnalysis.anchor).toMatchObject({
      ply: 14,
      moveNumber: 7,
      color: "b",
      san: "Qxc1",
    });
  });

  it("not on an exploration's board, with a move named, or with a scope", async () => {
    // Exploring 8. Qxc1 Rb8 from the board after 7... Qxc1.
    const explored = (() => {
      const g = new Chess(fenAt(14));
      g.move("Qxc1");
      g.move("Rb8");
      return g.fen();
    })();
    for (const [q, extra] of [
      ["what was Black thinking?", { moveIndex: 14, fen: explored }],
      [
        "what was Black thinking on move 20?",
        { moveIndex: 14, fen: fenAt(14) },
      ],
      ["what was Black thinking with Qxa2?", { moveIndex: 14, fen: fenAt(14) }],
      [
        "what was black thinking in the opening?",
        { moveIndex: 14, fen: fenAt(14) },
      ],
      [
        "what was my opponent thinking this whole game?",
        { moveIndex: 14, fen: fenAt(14) },
      ],
    ] as const) {
      const sent = provider(DRAFT);
      const json = await (await ask(q, extra)).json();
      expect(json.gameAnalysis.anchor, q).toBeUndefined();
      if (q.includes("move 20"))
        expect(String(sent[0].systemSuffix)).toContain(
          "Black played no move 20. The game ended after 8... Kd8."
        );
    }
  });

  it("a game that does not replay from the start gets no never-played line", async () => {
    mockGetAnalysisContext.mockImplementation(() =>
      context({ playedMoves: ["Kd7", "Kd2", "Kc6"], gameEval: undefined })
    );
    const sent = provider(DRAFT);
    await ask("why was Black's move 4 bad?", { moveIndex: 3 });
    expect(String(sent[0].systemSuffix)).not.toContain("played no move");
  });

  it("a move the side never played is said, not left to be invented", async () => {
    const sent = provider(DRAFT);
    const json = await (await ask("why was Black's move 12 bad?")).json();
    expect(json.gameAnalysis.anchor).toBeUndefined();
    expect(String(sent[0].systemSuffix)).toContain(
      "Black played no move 12. The game ended after 8... Kd8."
    );
  });

  it("with the side unconfirmed, my opponent names no side and a colour is said by colour", async () => {
    mockGetAnalysisContext.mockImplementation(() =>
      context({ systemPromptSuffix: unconfirmedTail })
    );
    provider(DRAFT);
    const opp = await (await ask("what was my opponent thinking?")).json();
    expect(opp.gameAnalysis.perspective).toBeUndefined();

    const sent = provider(DRAFT);
    const json = await (
      await ask("from Black's side, what went wrong?")
    ).json();
    expect(json.gameAnalysis.perspective.side).toBe("b");
    const suffix = String(sent[0].systemSuffix);
    expect(suffix).toContain('call neither side "you"');
    expect(suffix).toContain("Player: White (a guess, not confirmed) ·");
    expect(suffix).toContain(
      "## BLACK'S COSTLIEST MOVES (by the engine's winning chances"
    );
    expect(suffix).toContain(
      "## BLACK'S KEY MOMENTS (the moves this turn is about)"
    );
    // The unconfirmed tail has no perspective line to rewrite.
    for (const line of unconfirmedTail.trim().split("\n"))
      expect(suffix).toContain(line);
    expect(sent[0].messages.at(-1).content).toContain(
      "This turn is about Black's moves. Name both sides by colour.]"
    );
  });
});

describe("the referee licenses the subject's own lines (validators off)", () => {
  beforeEach(() => {
    vi.stubEnv("MASTERMIND_VALIDATORS_ENABLED", "false");
    __resetMastermindEnvCacheForTests();
  });

  it("Black's engine line, opened at its own move, is kept on a turn about Black and dropped on any other", async () => {
    const draft =
      "Black had a calmer way. Kd8 Be2 Qxa2 O-O kept the queen. 7... Kd8 was the move.";
    provider(draft);
    const kept = await (
      await ask("from Black's side, what went wrong?")
    ).json();
    expect(kept.gameAnalysis.analysis).toContain("Kd8 Be2 Qxa2 O-O");
    expect(kept.gameAnalysis.analysis).toContain("7... Kd8 was the move.");
    expect(dropReasons()).toEqual([]);

    mockLog.info.mockClear();
    provider(draft);
    const plain = await (await ask("what went wrong?")).json();
    expect(plain.gameAnalysis.analysis).not.toContain("Qxa2");
    expect(plain.gameAnalysis.analysis).toContain("7... Kd8 was the move.");
    expect(dropReasons()).toEqual(["san:Qxa2"]);
  });

  it("the line cited with its numbers, after the move it replaces, is kept too", async () => {
    const draft =
      "Instead of 7... Qxc1, 7... Kd8 8. Be2 Qxa2 kept the queen. Black was greedy.";
    provider(draft);
    const kept = await (
      await ask("from Black's side, what went wrong?")
    ).json();
    expect(kept.gameAnalysis.analysis).toContain("7... Kd8 8. Be2 Qxa2");
    expect(dropReasons()).toEqual([]);
    mockLog.info.mockClear();
    provider(draft);
    const plain = await (await ask("what went wrong?")).json();
    expect(plain.gameAnalysis.analysis).not.toContain("Qxa2");
  });

  it("a moment's line lends no move to another number", async () => {
    // 8... Qxa2 is the line's move at Black's 8th, but after the game's
    // 8. Nc7+ Black is in check and it is no move at all.
    provider(
      "After 8. Nc7+, Black should have answered 8... Qxa2. 7... Kd8 was better."
    );
    const json = await (
      await ask("from Black's side, what went wrong?")
    ).json();
    expect(json.gameAnalysis.analysis).not.toContain("Qxa2");
    expect(json.gameAnalysis.analysis).toContain("7... Kd8 was better.");
    expect(dropReasons()).toEqual(["san:Qxa2"]);
  });

  it("a piece claim on a moment's board is no inaccuracy", async () => {
    // The white bishop stood on c1 before 7... Qxc1; on the board at the
    // end of the game Black's queen is there.
    const draft =
      "Black's greed showed. The white bishop on c1 was the bait, and taking it cost the game.";
    provider(draft);
    const json = await (
      await ask("from Black's side, what went wrong?")
    ).json();
    expect(json.gameAnalysis.analysis).not.toContain("may be inaccurate");
    provider(draft);
    const plain = await (await ask("what went wrong?")).json();
    expect(plain.gameAnalysis.analysis).toContain("may be inaccurate");
  });
});
