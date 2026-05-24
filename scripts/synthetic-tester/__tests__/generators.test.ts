import { describe, it, expect } from "vitest";
import {
  type GeneratorContextBase,
  type GeneratorFixtures,
  type LlmCall,
  mulberry32,
} from "../generators";
import { opponentPrepGenerator } from "../generators/opponentPrep";
import { improvementStrategyGenerator } from "../generators/improvementStrategy";
import { metaMotivationalGenerator } from "../generators/metaMotivational";
import { conceptExplanationGenerator } from "../generators/conceptExplanation";
import { positionAnchoredGenerator } from "../generators/positionAnchored";

// ─────────────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────────────

const minimalPersonas: Record<string, string> = {
  opponent_prep_seeker: "You are an opponent_prep_seeker. Ask a prep question.",
  improvement_seeker: "You are an improvement_seeker. Ask an improvement question.",
  reflective_learner: "You are a reflective_learner. Ask a reflective question.",
  concept_curious: "You are a concept_curious. Ask a concept question.",
  confused_beginner: "You are a confused_beginner. Ask a beginner question.",
  curious_advanced: "You are a curious_advanced. Ask an advanced question.",
  tilted_intermediate: "You are a tilted_intermediate. Push back.",
  hinglish_learner: "You are a hinglish_learner. Ask in Hinglish.",
  trick_questioner: "You are a trick_questioner. Insert one believable error.",
};

const minimalFixtures: GeneratorFixtures = {
  opponents: [
    {
      fixture_id: "test_real_a",
      handle_kind: "real",
      username: "TestOppA",
      platform: "chess.com",
      profile_summary: "Test opponent A — aggressive d4 player.",
      expected_scout: "has_data",
    },
    {
      fixture_id: "test_stub_b",
      handle_kind: "stub",
      username: "stub_test_b",
      platform: "lichess",
      profile_summary: "Synthetic stub — London System grinder.",
      expected_scout: "no_data",
    },
  ],
  concepts: [
    {
      concept_id: "minority-attack",
      name: "Minority attack",
      source: "silman_reassess_4e",
      level: "intermediate",
      category: "positional",
      notes: "Test note for minority attack.",
    },
    {
      concept_id: "double-attack",
      name: "Double Attack",
      source: "yusupov_byc_orange_book_1",
      level: "beginner",
      category: "tactics",
      notes: "Test note for double attack.",
    },
  ],
  lossSummaries: [
    { snippet_id: "test_loss_a", text: "Lost a blitz game in the endgame to a piece blunder." },
    { snippet_id: "test_loss_b", text: "Drew a winning rook endgame by repetition." },
  ],
  userHistories: {
    TestUserA: {
      username: "TestUserA",
      platform: "chess.com",
      loadedAt: "2026-05-23T00:00:00Z",
      gamesCached: 5,
      totalFetchedFromApi: 100,
      monthsRequested: 12,
      games: [
        { pgn: "[White \"TestUserA\"]", white: { name: "TestUserA" }, black: { name: "OppX" }, result: "1-0", timeControl: "180" },
        { pgn: "[White \"OppY\"]", white: { name: "OppY" }, black: { name: "TestUserA" }, result: "0-1", timeControl: "180" },
        { pgn: "[White \"TestUserA\"]", white: { name: "TestUserA" }, black: { name: "OppZ" }, result: "0-1", timeControl: "600" },
        { pgn: "[White \"OppZ\"]", white: { name: "OppZ" }, black: { name: "TestUserA" }, result: "1/2-1/2", timeControl: "60" },
        { pgn: "[White \"TestUserA\"]", white: { name: "TestUserA" }, black: { name: "OppQ" }, result: "1-0", timeControl: "180" },
      ],
    },
  },
};

const mockLlmCall: LlmCall = async ({ generatorTag, userPrompt }) => ({
  ok: true,
  text: `[mock ${generatorTag}] question for context: ${userPrompt.slice(0, 40).replace(/\n/g, " ")}`,
});

function baseCtx(category: GeneratorContextBase["category"], seed = 1): GeneratorContextBase {
  return {
    category,
    rng: mulberry32(seed),
    llmCall: mockLlmCall,
    // Fresh copies each call so tests can mutate without leaking.
    personas: { ...minimalPersonas },
    fixtures: { ...minimalFixtures },
  };
}

// ─────────────────────────────────────────────────────────────────────
// opponentPrepGenerator
// ─────────────────────────────────────────────────────────────────────

describe("opponentPrepGenerator", () => {
  it("returns question + opponentUsername + opponentPlatform body extensions", async () => {
    const result = await opponentPrepGenerator(baseCtx("opponent_prep"));
    expect(result.question).toContain("[mock opponentPrep]");
    expect(result.personaUsed).toBe("opponent_prep_seeker");
    expect(result.bodyExtensions.opponentUsername).toBeDefined();
    expect(result.bodyExtensions.opponentPlatform).toBeDefined();
    expect(["chess.com", "lichess"]).toContain(result.bodyExtensions.opponentPlatform);
  });

  it("picks deterministically given a fixed seed", async () => {
    const a = await opponentPrepGenerator(baseCtx("opponent_prep", 42));
    const b = await opponentPrepGenerator(baseCtx("opponent_prep", 42));
    expect(a.bodyExtensions.opponentUsername).toBe(b.bodyExtensions.opponentUsername);
  });

  it("can pick both real and stub fixtures across seeds", async () => {
    const handleKinds = new Set<string>();
    for (let seed = 1; seed < 20; seed++) {
      const r = await opponentPrepGenerator(baseCtx("opponent_prep", seed));
      handleKinds.add(r.metadata.handle_kind as string);
      if (handleKinds.has("real") && handleKinds.has("stub")) break;
    }
    expect(handleKinds.has("real")).toBe(true);
    expect(handleKinds.has("stub")).toBe(true);
  });

  it("throws if persona is missing", async () => {
    const ctx = baseCtx("opponent_prep");
    delete ctx.personas.opponent_prep_seeker;
    await expect(opponentPrepGenerator(ctx)).rejects.toThrow(/opponent_prep_seeker.*not loaded/);
  });

  it("throws if opponents fixture is empty", async () => {
    const ctx = baseCtx("opponent_prep");
    ctx.fixtures = { ...ctx.fixtures, opponents: [] };
    await expect(opponentPrepGenerator(ctx)).rejects.toThrow(/empty/);
  });
});

// ─────────────────────────────────────────────────────────────────────
// improvementStrategyGenerator
// ─────────────────────────────────────────────────────────────────────

describe("improvementStrategyGenerator", () => {
  it("returns question + username body extension", async () => {
    const result = await improvementStrategyGenerator(baseCtx("improvement_strategy"));
    expect(result.question).toContain("[mock improvementStrategy]");
    expect(result.personaUsed).toBe("improvement_seeker");
    expect(result.bodyExtensions.username).toBe("TestUserA");
  });

  it("summary block reaches the LLM with time-control + win-rate stats", async () => {
    const captured: string[] = [];
    const captureCtx = { ...baseCtx("improvement_strategy"), llmCall: async (args: Parameters<LlmCall>[0]) => {
      captured.push(args.userPrompt);
      return { ok: true, text: "mock" };
    }};
    await improvementStrategyGenerator(captureCtx);
    expect(captured.length).toBe(1);
    expect(captured[0]).toContain("TestUserA");
    expect(captured[0]).toContain("Total recent games");
    expect(captured[0]).toContain("Win rates by time control");
  });

  it("throws when no user_history fixtures are loaded", async () => {
    const ctx = baseCtx("improvement_strategy");
    ctx.fixtures = { ...ctx.fixtures, userHistories: {} };
    await expect(improvementStrategyGenerator(ctx)).rejects.toThrow(/no user_history fixtures/);
  });

  it("skips users with loadFailed: true", async () => {
    const ctx = baseCtx("improvement_strategy");
    ctx.fixtures = {
      ...ctx.fixtures,
      userHistories: {
        FailedUser: {
          username: "FailedUser",
          platform: "chess.com",
          loadedAt: "2026-05-23T00:00:00Z",
          games: [],
          loadFailed: true,
          error: "test",
        },
        TestUserA: ctx.fixtures.userHistories.TestUserA,
      },
    };
    const result = await improvementStrategyGenerator(ctx);
    expect(result.bodyExtensions.username).toBe("TestUserA");
  });
});

// ─────────────────────────────────────────────────────────────────────
// metaMotivationalGenerator
// ─────────────────────────────────────────────────────────────────────

describe("metaMotivationalGenerator", () => {
  it("returns question + register metadata", async () => {
    const result = await metaMotivationalGenerator(baseCtx("meta_motivational"));
    expect(result.question).toContain("[mock metaMotivational");
    expect(result.personaUsed).toBe("reflective_learner");
    expect(["trajectory", "loss", "existential"]).toContain(result.metadata.register);
  });

  it("produces all three registers across seeds", async () => {
    const registers = new Set<string>();
    for (let seed = 1; seed < 50; seed++) {
      const r = await metaMotivationalGenerator(baseCtx("meta_motivational", seed));
      registers.add(r.metadata.register as string);
      if (registers.size === 3) break;
    }
    expect(registers).toEqual(new Set(["trajectory", "loss", "existential"]));
  });

  it("loss register attaches a loss_snippet_id", async () => {
    for (let seed = 1; seed < 100; seed++) {
      const r = await metaMotivationalGenerator(baseCtx("meta_motivational", seed));
      if (r.metadata.register === "loss") {
        expect(r.metadata.loss_snippet_id).toBeDefined();
        expect(["test_loss_a", "test_loss_b"]).toContain(r.metadata.loss_snippet_id);
        return;
      }
    }
    throw new Error("Never picked loss register in 100 attempts — RNG bias suspected");
  });

  it("existential register omits bodyExtensions.username", async () => {
    for (let seed = 1; seed < 100; seed++) {
      const r = await metaMotivationalGenerator(baseCtx("meta_motivational", seed));
      if (r.metadata.register === "existential") {
        expect(r.bodyExtensions.username).toBeUndefined();
        return;
      }
    }
    throw new Error("Never picked existential register in 100 attempts");
  });

  it("trajectory / loss registers attach bodyExtensions.username when user_history fixtures exist", async () => {
    for (let seed = 1; seed < 100; seed++) {
      const r = await metaMotivationalGenerator(baseCtx("meta_motivational", seed));
      if (r.metadata.register !== "existential") {
        expect(r.bodyExtensions.username).toBe("TestUserA");
        return;
      }
    }
    throw new Error("Never picked trajectory or loss in 100 attempts");
  });
});

// ─────────────────────────────────────────────────────────────────────
// conceptExplanationGenerator
// ─────────────────────────────────────────────────────────────────────

describe("conceptExplanationGenerator", () => {
  it("returns question + concept metadata, no body extensions", async () => {
    const result = await conceptExplanationGenerator(baseCtx("concept_explanation"));
    expect(result.question).toContain("[mock conceptExplanation]");
    expect(result.personaUsed).toBe("concept_curious");
    expect(result.bodyExtensions).toEqual({});
    expect(["minority-attack", "double-attack"]).toContain(result.metadata.concept_id);
    expect(["Minority attack", "Double Attack"]).toContain(result.metadata.concept_name);
  });

  it("picks from concepts fixture across the full pool", async () => {
    const conceptIds = new Set<string>();
    for (let seed = 1; seed < 30; seed++) {
      const r = await conceptExplanationGenerator(baseCtx("concept_explanation", seed));
      conceptIds.add(r.metadata.concept_id as string);
      if (conceptIds.size >= 2) break;
    }
    expect(conceptIds.size).toBe(2);
  });

  it("includes source attribution in metadata", async () => {
    const r = await conceptExplanationGenerator(baseCtx("concept_explanation"));
    expect(typeof r.metadata.source).toBe("string");
    expect((r.metadata.source as string).length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// positionAnchoredGenerator
// ─────────────────────────────────────────────────────────────────────

describe("positionAnchoredGenerator", () => {
  const positionCtx = {
    persona: "confused_beginner",
    fenAfter: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2",
    fenBefore: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
    moveHistory: ["e4", "e5"],
    gameEval: { positions: [] } as any,
    playerColor: "w" as const,
    recentSan: "1.e4 e5",
    classification: "book",
    initialAnalysis: "Opening play looks reasonable so far.",
    gameId: "test-game-1",
  };

  it("returns question + persona; no body extensions", async () => {
    const ctx = { ...baseCtx("game_review"), ...positionCtx, subcategory: "game_review" as const };
    const result = await positionAnchoredGenerator(ctx);
    expect(result.question).toContain("[mock positionAnchored:game_review]");
    expect(result.personaUsed).toBe("confused_beginner");
    expect(result.bodyExtensions).toEqual({});
    expect(result.metadata.subcategory).toBe("game_review");
  });

  it("uses game_review template when subcategory=game_review", async () => {
    const captured: string[] = [];
    const ctx = {
      ...baseCtx("game_review"),
      ...positionCtx,
      subcategory: "game_review" as const,
      llmCall: async (args: Parameters<LlmCall>[0]) => {
        captured.push(args.userPrompt);
        return { ok: true, text: "mock" };
      },
    };
    await positionAnchoredGenerator(ctx);
    expect(captured[0]).toContain("# Framing: game_review");
    expect(captured[0]).toContain("Anchor your question on a SPECIFIC move number");
  });

  it("uses position_analysis template when subcategory=position_analysis", async () => {
    const captured: string[] = [];
    const ctx = {
      ...baseCtx("position_analysis"),
      ...positionCtx,
      subcategory: "position_analysis" as const,
      llmCall: async (args: Parameters<LlmCall>[0]) => {
        captured.push(args.userPrompt);
        return { ok: true, text: "mock" };
      },
    };
    await positionAnchoredGenerator(ctx);
    expect(captured[0]).toContain("# Framing: position_analysis");
    expect(captured[0]).toContain("Ask about the PRESENT position");
  });

  it("throws when persona / fenAfter / initialAnalysis missing", async () => {
    const ctx = baseCtx("game_review");
    await expect(positionAnchoredGenerator(ctx as any)).rejects.toThrow(/missing/);
  });
});
