/**
 * COACH_CLAIM_VERIFIER on the served path: a card whose prose states a false
 * board fact is fixed by code (rewritten to the verified fact, or dropped),
 * never by asking a model to correct itself; prose that cannot be checked
 * never ships. Game B's real contract, built offline; every LLM seam throws.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.hoisted(() => {
  delete process.env.LC0_API_URL;
  delete process.env.MAIA_API_URL;
});

import { buildCoachContract } from "@/lib/contract/builder";
import {
  createEnforcedContractStream,
  UNCHECKABLE_CARD_NOTE,
} from "@/lib/contract/enforcedStream";
import {
  DEFAULT_LADDER_BUDGETS,
  runInsightLadder,
  type LadderCardOpts,
} from "@/lib/contract/ladder";
import { renderInsightHeader } from "@/lib/contract/insightGrammar";
import { selectCardInsights } from "@/lib/prompts/verbalizerPrompt";
import type { CoachContract, InsightContract } from "@/lib/contract/types";
import {
  __resetFetchForTesting,
  __setFetchForTesting,
} from "@/lib/grounding/chessdb";
import {
  loadGame,
  positionEvals,
} from "@/lib/coach/__tests__/coachAccuracyFixtures";

let contract: CoachContract;
const card = (san: string, moveNumber: number): InsightContract =>
  contract.insights.find(
    (i) => i.playedSan === san && i.moveNumber === moveNumber
  )!;

const noModel = {
  correctImpl: async () => {
    throw new Error("the claim gate must not call a model");
  },
  callLLMImpl: async () => {
    throw new Error("the claim gate must not call a model");
  },
  relationalParseCall: async () => {
    throw new Error("the claim gate must not call a model");
  },
};

function opts(
  insight: InsightContract,
  over: Partial<LadderCardOpts> = {}
): LadderCardOpts {
  return {
    insight,
    contract,
    refereeOpts: {
      userRating: 1800,
      correlationId: "t",
      playerPerspective: "white",
    },
    refereeMode: "deterministic",
    citationGranularity: "sentence",
    deadlineAtMs: Date.now() + 60_000,
    budgets: DEFAULT_LADDER_BUDGETS(),
    regenSystem: { stable: "SYS", perUser: "USER" },
    deps: noModel,
    ...over,
  };
}

beforeAll(async () => {
  __setFetchForTesting(async () => {
    throw new Error("network disabled");
  });
  const g = loadGame("gameB");
  contract = await buildCoachContract({
    moveHistory: g.sans,
    gameEval: {
      positions: positionEvals("gameB", 16),
      settings: { engine: "stockfish_17_lite", depth: 16, multiPv: 3 },
    } as never,
    playerColor: "w",
  });
}, 120_000);

afterAll(() => {
  __resetFetchForTesting();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const INTENT =
  "You went after the rook, and grabbing material is a fair instinct when the king is safe.";
const FALSE_LEDGER = "After 19. Qh6+ you come out a pawn up [F:M2.pv0].";
const ENGINE = "The engine preferred 19. Qh6+ here [F:M2].";
const TAKEAWAY =
  "Next time the enemy king is out in the open, count the checks before you count the loot.";

describe("the ladder with the claim gate", () => {
  it("rewrites a false material claim to the verified fact, without calling a model", async () => {
    const body = [INTENT, `${ENGINE} ${FALSE_LEDGER}`, TAKEAWAY].join("\n");
    const result = await runInsightLadder(body, opts(card("Nxa8", 19)));
    expect(result.stage).toBe("sentence_drop");
    expect(result.finalText).not.toMatch(/come out a pawn up/);
    expect(result.finalText).toMatch(
      /After 22\.\.\.Be7, Black is 1 point up\./
    );
    expect(result.editsUsed + result.regensUsed).toBe(0);
    expect(result.claimVerifier?.blocked).toEqual([
      expect.objectContaining({ kind: "ahead", status: "false" }),
    ]);
    const sources = Object.fromEntries(
      result.claimVerifier!.sentences.map((s) => [s.text, s.source])
    );
    expect(sources["After 22...Be7, Black is 1 point up."]).toBe(
      "verified-fact"
    );
    expect(sources["The engine preferred 19. Qh6+ here."]).toBe("engine");
    expect(sources[INTENT]).toBe("judgment");
  });

  it("drops '12.Ng5 leaves the knight hanging' and keeps the rest", async () => {
    const body = [
      INTENT,
      "12. Ng5 leaves the knight hanging [F:M5]. The engine preferred 12. Bd3 here [F:M5].",
      TAKEAWAY,
    ].join("\n");
    const result = await runInsightLadder(body, opts(card("Ng5", 12)));
    expect(result.stage).toBe("sentence_drop");
    expect(result.finalText).not.toMatch(/hanging/);
    expect(result.finalText).toMatch(/The engine preferred 12\. Bd3 here\./);
  });

  it("a card that is nothing but a false claim becomes the template card", async () => {
    const result = await runInsightLadder(
      "12. Ng5 leaves the knight hanging [F:M5].",
      opts(card("Ng5", 12))
    );
    expect(result.stage).toBe("templated");
    expect(result.finalText).not.toMatch(/knight hanging/);
  });

  it("fails closed: when the claim check itself breaks, the template ships, not the unchecked prose", async () => {
    // The cited line's story is what the claim gate replays to anchor the claim.
    const good = card("Nxa8", 19);
    const broken = {
      ...good,
      lines: good.lines.map((l, k) =>
        k === 0 ? { ...l, story: { ...l.story!, plies: null } } : l
      ),
    } as unknown as InsightContract;
    const result = await runInsightLadder(
      `${INTENT}\n${FALSE_LEDGER}`,
      opts(broken)
    );
    expect(result.stage).toBe("templated");
    expect(result.finalText).not.toMatch(/come out a pawn up/);
  });

  it("with the flag off, the ladder does not read board claims (behaviour unchanged)", async () => {
    vi.stubEnv("COACH_CLAIM_VERIFIER", "0");
    const body = [INTENT, FALSE_LEDGER, TAKEAWAY].join("\n");
    const result = await runInsightLadder(body, opts(card("Nxa8", 19)));
    expect(result.stage).toBe("pass");
    expect(result.finalText).toMatch(/come out a pawn up/);
    expect(result.claimVerifier).toBeUndefined();
  });
});

describe("the enforced stream with the claim gate", () => {
  it("labels each card's sentences in the summary, and leaves out a card it cannot check", async () => {
    const emitted: string[] = [];
    const stream = createEnforcedContractStream({
      contract,
      emit: (t) => emitted.push(t),
      correlationId: "t",
      refereeMode: "deterministic",
      citationGranularity: "sentence",
      deadlineAtMs: Date.now() + 60_000,
      regenSystem: { stable: "SYS", perUser: "USER" },
      deps: noModel,
    });
    stream.push("A wild one.\n");
    for (const planned of selectCardInsights(contract)) {
      const extra = planned.factIdPrefix === "M2" ? `${FALSE_LEDGER}\n` : "";
      stream.push(
        `${renderInsightHeader(planned)}\n${INTENT}\n${extra}${TAKEAWAY}\n[/INSIGHT]\n`
      );
    }
    // Every planned card is spoken for, so this one matches nothing to check it against.
    stream.push(
      "[INSIGHT:3:b:mistake:+0.30:+0.90:Nf6:e5]\nBlack drops a rook here and is lost.\n[/INSIGHT]\n"
    );
    const summary = await stream.end();
    const text = emitted.join("");
    expect(text).not.toMatch(/come out a pawn up/);
    expect(text).not.toMatch(/drops a rook/);
    expect(text).toContain(UNCHECKABLE_CARD_NOTE.trim());
    expect(summary.unanchoredBlocks).toBe(1);
    expect(summary.claimVerifier?.blockedTotal).toBe(1);
    expect(
      summary.claimVerifier?.cards.find((c) => c.blocked.length > 0)
        ?.factIdPrefix
    ).toBe("M2");
  });
});
