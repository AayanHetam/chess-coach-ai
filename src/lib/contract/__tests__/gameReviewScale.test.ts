/**
 * PR-CI-5 — game_review at CARD SCALE.
 *
 * position_analysis reviews carry 1–3 cards; a game review draws from up to 13
 * candidate insights (selectInsights: ≤10 top mistakes + ≤3 intel-only) and
 * ships at most MAX_GAME_REVIEW_CARDS of them (founder cap, 2026-08-11 — see
 * cardWorthiness.ts). They share ONE set of per-review ladder budgets and ONE
 * wall-clock deadline. Everything here is a property that only fails at scale.
 *
 * The load-bearing one is the deadline. Before CI-5 it was ADVISORY: a stage
 * checked `now() + ESTIMATE < deadline` before starting, but `callLLM` has no
 * default timeout, so an admitted regen could run long and carry the route
 * past `maxDuration: 60s` — Vercel kills the function mid-stream and the user
 * gets a truncated review instead of the promised template card. These tests
 * pin the bound as REAL.
 *
 * Hermetic: deterministic referee mode, injected LLM seams, fake clock.
 */
import { describe, expect, it, vi } from "vitest";
import { createEnforcedContractStream } from "@/lib/contract/enforcedStream";
import { renderInsightHeader } from "@/lib/contract/insightGrammar";
import { DEFAULT_LADDER_BUDGETS, runInsightLadder } from "@/lib/contract/ladder";
import type { LadderCardOpts } from "@/lib/contract/ladder";
import type { ArmingTable } from "@/lib/contract/armingConfig";
import type { LLMResult } from "@/lib/llmProvider";
import {
  maxTokensForInsights,
  selectCardInsights,
  selectCardInsightsDetailed,
} from "@/lib/prompts/verbalizerPrompt";
import { MAX_GAME_REVIEW_CARDS } from "@/lib/contract/cardWorthiness";
import type { InsightContract } from "@/lib/contract/types";
import { makeContract, makeInsight } from "./insightFactory";

vi.mock("@/lib/logging", () => ({
  logger: { child: () => ({ info: () => {}, warn: () => {}, error: () => {} }) },
}));

const ENFORCE_TABLE: ArmingTable = { eval_display: "error" };

/**
 * A card body that is NOTHING BUT a fabricated eval, so stage (a) — the free
 * deterministic sentence-drop — cannot rescue it (dropping leaves no
 * substantive prose and returns null). That forces the ladder down to the
 * BUDGETED stages, which is the point of every test here.
 */
const BAD_BODY = "The eval crashed to -9.50 after this.";

/** Route reality: maxDuration 60s, ladder budget 55s (5s margin). */
const MAX_DURATION_MS = 60_000;
const LADDER_BUDGET_MS = 55_000;

function bigGameReviewContract(cards: number) {
  const insights: InsightContract[] = [];
  for (let n = 0; n < cards; n++) {
    insights.push(
      makeInsight({
        factIdPrefix: `M${n + 1}`,
        // Distinct move numbers so header anchoring is unambiguous.
        moveNumber: 11 + n,
        topMistakeRank: n + 1,
        intelligenceRank: null,
      }),
    );
  }
  return makeContract(insights);
}

describe("card plan scales to game_review size", () => {
  it("a 13-candidate review is CAPPED at MAX_GAME_REVIEW_CARDS, keeping pedagogical order", () => {
    const insights: InsightContract[] = [];
    for (let n = 0; n < 10; n++) {
      insights.push(
        makeInsight({ factIdPrefix: `M${n + 1}`, moveNumber: 5 + n, topMistakeRank: n + 1 }),
      );
    }
    for (let n = 0; n < 3; n++) {
      insights.push(
        makeInsight({
          factIdPrefix: `I${n + 1}`,
          moveNumber: 30 + n,
          topMistakeRank: null,
          intelligenceRank: n + 1,
        }),
      );
    }
    const contract = makeContract(insights);
    const plan = selectCardInsights(contract);
    expect(plan).toHaveLength(MAX_GAME_REVIEW_CARDS);
    // All 13 candidates carry the factory's identical severity (350cp, a
    // BETTER→WORSE band drop), so every one clears the floor and the CAP is
    // what binds; ties resolve by ply, which is legacy rank order.
    expect(plan.map((i) => i.factIdPrefix)).toEqual(
      Array.from({ length: MAX_GAME_REVIEW_CARDS }, (_, i) => `M${i + 1}`),
    );
    const detailed = selectCardInsightsDetailed(contract);
    expect(detailed.droppedBelowFloor).toEqual([]);
    expect(detailed.droppedOverCap).toHaveLength(13 - MAX_GAME_REVIEW_CARDS);
    expect(detailed.headlineRestored).toBe(false);
  });

  it("the token budget grows with cards and never exceeds its ceiling", () => {
    // 1-3 cards (position_analysis) sit on the legacy 3000 floor, and at the
    // 4-card cap the game_review worst case is still on that floor.
    expect(maxTokensForInsights(1)).toBe(3000);
    expect(maxTokensForInsights(3)).toBe(3000);
    expect(maxTokensForInsights(MAX_GAME_REVIEW_CARDS)).toBe(3000);
    // The 5th card is where the budget starts growing.
    expect(maxTokensForInsights(5)).toBe(3600);
    // The function itself still scales past the cap (it is not the cap's
    // enforcement point) and stays bounded.
    expect(maxTokensForInsights(7)).toBe(4800);
    expect(maxTokensForInsights(10)).toBe(6600);
    expect(maxTokensForInsights(13)).toBe(8000);
    expect(maxTokensForInsights(50)).toBe(8000);
    // Monotone — more cards never budgets fewer tokens.
    for (let n = 1; n < 20; n++) {
      expect(maxTokensForInsights(n + 1)).toBeGreaterThanOrEqual(maxTokensForInsights(n));
    }
  });
});

describe("per-review ladder budgets hold across a full-size review", () => {
  it("≤2 Haiku edits and ≤3 Sonnet regens total, however many cards violate", async () => {
    const contract = bigGameReviewContract(13);
    const planned = selectCardInsights(contract);
    expect(planned).toHaveLength(MAX_GAME_REVIEW_CARDS);
    const budgets = DEFAULT_LADDER_BUDGETS();
    expect(budgets.editsRemaining).toBe(2);
    expect(budgets.regensRemaining).toBe(3);

    let editCalls = 0;
    let regenCalls = 0;
    const results = [];
    for (const insight of selectCardInsights(contract)) {
      const opts: LadderCardOpts = {
        insight,
        contract,
        refereeOpts: { userRating: 1500, correlationId: "scale", playerPerspective: "white" },
        refereeMode: "deterministic",
        citationGranularity: "sentence",
        // Plenty of wall clock — the CAPS must be what binds, not the clock.
        deadlineAtMs: Date.now() + 10 * 60_000,
        budgets,
        regenSystem: { stable: "", perUser: "" },
        deps: {
          correctImpl: async () => {
            editCalls++;
            // Edit never clears the violation ⇒ ladder continues.
            return { mode: "edited", correctedText: BAD_BODY, costUsd: 0.001 } as never;
          },
          callLLMImpl: async () => {
            regenCalls++;
            return {
              content: BAD_BODY,
              provider: "anthropic",
              model: "claude-sonnet-4-6",
              inputTokens: 10,
              outputTokens: 10,
              elapsedMs: 1,
            } as LLMResult;
          },
        },
      };
      results.push(await runInsightLadder(BAD_BODY, opts, ENFORCE_TABLE));
    }

    expect(editCalls).toBeLessThanOrEqual(2);
    expect(regenCalls).toBeLessThanOrEqual(3);
    expect(budgets.editsRemaining).toBe(0);
    expect(budgets.regensRemaining).toBe(0);
    // Every card still SHIPPED something — the template floor is unbudgeted.
    expect(results).toHaveLength(planned.length);
    for (const r of results) expect(r.finalText).toContain("[INSIGHT:");
    // Once the caps are spent the remaining cards resolve deterministically.
    expect(results.filter((r) => r.stage === "templated").length).toBeGreaterThan(0);
  });
});

describe("the wall-clock deadline is ENFORCED, not advisory", () => {
  it("a slow regen is aborted at the deadline instead of overrunning maxDuration", async () => {
    const contract = bigGameReviewContract(1);
    const insight = contract.insights[0];
    const requestStartMs = 0;
    // Worst LEGAL admission: the gate gives the stage the floor it demands
    // (55_000 − 15_001 = 39_999 elapsed), so the bound must be exactly the
    // 15s estimate — before CI-5 the provider was free to ignore it.
    const now = () => LADDER_BUDGET_MS - 15_001;

    let sawSignal = false;
    let aborted = false;
    const opts: LadderCardOpts = {
      insight,
      contract,
      refereeOpts: { userRating: 1500, correlationId: "deadline", playerPerspective: "white" },
      refereeMode: "deterministic",
      citationGranularity: "sentence",
      deadlineAtMs: requestStartMs + LADDER_BUDGET_MS,
      // No edit budget, so the ladder reaches the regen rung directly.
      budgets: { editsRemaining: 0, regensRemaining: 3, relationalRemaining: 0 },
      regenSystem: { stable: "", perUser: "" },
      deps: {
        now,
        // A provider that would run forever — i.e. well past maxDuration.
        callLLMImpl: (o) =>
          new Promise((_resolve, reject) => {
            const signal = (o as { signal?: AbortSignal }).signal;
            sawSignal = signal !== undefined;
            signal?.addEventListener("abort", () => {
              aborted = true;
              reject(new Error("aborted"));
            });
          }),
      },
    };

    vi.useFakeTimers();
    try {
      const pending = runInsightLadder(BAD_BODY, opts, ENFORCE_TABLE);
      // Nothing fires early...
      await vi.advanceTimersByTimeAsync(14_000);
      expect(aborted).toBe(false);
      // ...and the bound lands at the estimate, not "whenever the provider
      // feels like it".
      await vi.advanceTimersByTimeAsync(1_100);
      const result = await pending;

      expect(sawSignal).toBe(true);
      expect(aborted).toBe(true);
      // Aborted regen ⇒ fall through to the deterministic floor, which needs
      // no LLM and always exists.
      expect(result.stage).toBe("templated");
      expect(result.finalText).toContain(renderInsightHeader(insight));
      expect(result.finalText).not.toContain("-9.50");
    } finally {
      vi.useRealTimers();
    }
  });

  it("past the deadline, every violating card resolves to a template card with ZERO LLM calls", async () => {
    const contract = bigGameReviewContract(10);
    const budgets = DEFAULT_LADDER_BUDGETS();
    let llmCalls = 0;
    const results = [];
    for (const insight of selectCardInsights(contract)) {
      results.push(
        await runInsightLadder(
          BAD_BODY,
          {
            insight,
            contract,
            refereeOpts: { userRating: 1500, correlationId: "breach", playerPerspective: "white" },
            refereeMode: "full", // even full mode must not call Haiku past the deadline
            citationGranularity: "sentence",
            deadlineAtMs: Date.now() - 1, // already breached
            budgets,
            regenSystem: { stable: "", perUser: "" },
            deps: {
              correctImpl: async () => {
                llmCalls++;
                return { mode: "edited", correctedText: BAD_BODY, costUsd: 0 } as never;
              },
              callLLMImpl: async () => {
                llmCalls++;
                return {} as LLMResult;
              },
              relationalParseCall: async () => {
                llmCalls++;
                return {} as never;
              },
            },
          },
          ENFORCE_TABLE,
        ),
      );
    }
    expect(llmCalls).toBe(0);
    expect(results.every((r) => r.stage === "templated")).toBe(true);
    expect(results.every((r) => r.deadlineBreached)).toBe(true);
    // Budgets untouched — a breached deadline spends nothing.
    expect(budgets.editsRemaining).toBe(2);
    expect(budgets.regensRemaining).toBe(3);
  });

  it("a full-size review whose deadline is already spent still emits every card, in order", async () => {
    const contract = bigGameReviewContract(10);
    const plan = selectCardInsights(contract);
    const emitted: string[] = [];
    const t0 = Date.now();
    const stream = createEnforcedContractStream({
      contract,
      emit: (t) => emitted.push(t),
      correlationId: "scale-stream",
      refereeMode: "full",
      citationGranularity: "sentence",
      deadlineAtMs: t0 - 1, // breached before the first card
      regenSystem: { stable: "", perUser: "" },
      armingTable: ENFORCE_TABLE,
    });
    let msg = "Here are the moments that mattered.\n\n";
    for (const i of plan) {
      msg += `${renderInsightHeader(i)}\nThe eval crashed to -9.50 after this.\n[/INSIGHT]\n\n`;
    }
    for (let i = 0; i < msg.length; i += 29) stream.push(msg.slice(i, i + 29));
    const summary = await stream.end();
    const shipped = emitted.join("");
    const elapsed = Date.now() - t0;

    // Every planned card shipped, none dropped, pedagogical order preserved.
    expect(plan).toHaveLength(MAX_GAME_REVIEW_CARDS);
    expect(summary.cards).toHaveLength(plan.length);
    expect(summary.cards.map((c) => c.factIdPrefix)).toEqual(plan.map((i) => i.factIdPrefix));
    expect(summary.ladderDistribution.templated).toBe(plan.length);
    // The fabricated eval never reaches the client.
    expect(shipped).not.toContain("-9.50");
    // Headers appear in plan order.
    const positions = plan.map((i) => shipped.indexOf(renderInsightHeader(i)));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    // And the whole degraded path is instant — nowhere near maxDuration.
    expect(elapsed).toBeLessThan(MAX_DURATION_MS / 2);
  });
});
