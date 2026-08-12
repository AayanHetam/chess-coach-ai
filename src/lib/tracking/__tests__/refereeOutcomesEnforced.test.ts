/**
 * CI-6 — enforced-path referee outcomes.
 *
 * The bug these guard against is not a wrong number, it is an ABSENT one.
 * `referee_outcomes` had exactly one writer, hung off the shadow gate. Arming
 * CONTRACT_CATEGORIES for everyone routed real traffic down a branch that
 * closes the stream before that gate is constructed — so enforcement switched
 * off its own measurement, and the empty table read as "no traffic yet".
 *
 * The last test in this file is the structural guard: it fails if the write is
 * ever removed from, or moved out of, the enforced branch.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/env", () => ({ getTrackingEnv: vi.fn() }));
vi.mock("../supabase", () => ({ getTrackingSupabase: vi.fn() }));

import { readFileSync } from "node:fs";
import { getTrackingEnv } from "@/env";
import { getTrackingSupabase } from "../supabase";
import {
  recordEnforcedRefereeOutcome,
  type EnforcedRefereeSummaryLike,
  type RefereeOutcomeContext,
} from "../refereeOutcomes";

const mockEnv = vi.mocked(getTrackingEnv);
const mockGetClient = vi.mocked(getTrackingSupabase);

function fakeClient(insertResult: { error: { message: string } | null } = { error: null }) {
  const insert = vi.fn().mockResolvedValue(insertResult);
  const from = vi.fn().mockReturnValue({ insert });
  return { client: { from } as never, from, insert };
}

function card(over: Partial<EnforcedRefereeSummaryLike["cards"][number]> = {}) {
  return {
    factIdPrefix: "M1",
    stage: "sentence_drop",
    errorsInitial: 1,
    warnsInitial: 0,
    findings: [
      {
        check: "tactical_keyword",
        category: "fork",
        span: "forking the bishop on e7",
      },
    ],
    relationalParsesUsed: 1,
    ...over,
  };
}

const summary: EnforcedRefereeSummaryLike = {
  cards: [card(), card({ factIdPrefix: "M2", stage: "pass", errorsInitial: 0, findings: [] })],
  errorsInitialTotal: 1,
  warnsInitialTotal: 2,
  unanchoredBlocks: 1,
  sentinelCardsRefused: 0,
};

const ctx: RefereeOutcomeContext = {
  consent: true,
  uid: "u1",
  anonId: "a1",
  isIntern: false,
  requestId: "req1",
  category: "game_review",
  model: "claude-sonnet-4-6",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.mockReturnValue({ enabled: true } as never);
});

describe("recordEnforcedRefereeOutcome", () => {
  it("writes a row the enforced path can be measured from", async () => {
    const { client, from, insert } = fakeClient();
    mockGetClient.mockResolvedValue(client);

    await recordEnforcedRefereeOutcome({
      summary,
      contractId: "ct_abc",
      correlationId: "corr1",
      ctx,
    });

    expect(from).toHaveBeenCalledWith("referee_outcomes");
    const row = insert.mock.calls[0][0];
    // The discriminator. Without it, an enforced row and a shadow row get
    // averaged as if they measured the same thing.
    expect(row.branch).toBe("contract-enforced");
    expect(row.contract_id).toBe("ct_abc");
    expect(row.matched).toBe(2);
    expect(row.unmatched).toBe(1);
    expect(row.blocks_seen).toBe(3);
    expect(row.arming_fingerprint).toEqual(expect.any(String));
  });

  it("counts armed fires equal to referee fires (documented path invariant)", async () => {
    const { client, insert } = fakeClient();
    mockGetClient.mockResolvedValue(client);
    await recordEnforcedRefereeOutcome({ summary, contractId: "c", correlationId: "x", ctx });
    const row = insert.mock.calls[0][0];
    // On this path the referee already ran WITH the arming table applied, so
    // the fires counted ARE the enforced ones.
    expect(row.referee_errors).toBe(row.armed_errors);
    expect(row.referee_warns).toBe(row.armed_warns);
    expect(row.armed_errors).toBe(1);
  });

  it("aggregates per-check and per-category fire counts", async () => {
    const { client, insert } = fakeClient();
    mockGetClient.mockResolvedValue(client);
    await recordEnforcedRefereeOutcome({
      summary: {
        ...summary,
        cards: [
          card(),
          card({ factIdPrefix: "M2" }),
          card({
            factIdPrefix: "M3",
            findings: [{ check: "san_whitelist", category: "square_unknown", span: "on h9" }],
          }),
        ],
      },
      contractId: "c",
      correlationId: "x",
      ctx,
    });
    const row = insert.mock.calls[0][0];
    expect(row.check_counts).toEqual({ tactical_keyword: 2, san_whitelist: 1 });
    expect(row.category_counts).toEqual({ fork: 2, square_unknown: 1 });
    expect(row.relational_launched).toBe(3);
  });

  it("records what the LADDER did, not just what the referee caught", async () => {
    const { client, insert } = fakeClient();
    mockGetClient.mockResolvedValue(client);
    await recordEnforcedRefereeOutcome({ summary, contractId: "c", correlationId: "x", ctx });
    const row = insert.mock.calls[0][0];
    // This is the enforced signal the shadow population cannot carry: the
    // fabrication was caught AND the user never saw it, because the ladder
    // dropped the sentence.
    expect(row.spans[0]).toMatchObject({
      check: "tactical_keyword",
      factIdPrefix: "M1",
      stage: "sentence_drop",
    });
  });

  it("caps spans so one review cannot write an unbounded row", async () => {
    const { client, insert } = fakeClient();
    mockGetClient.mockResolvedValue(client);
    const many = Array.from({ length: 60 }, (_, i) => card({ factIdPrefix: `M${i}` }));
    await recordEnforcedRefereeOutcome({
      summary: { ...summary, cards: many },
      contractId: "c",
      correlationId: "x",
      ctx,
    });
    expect(insert.mock.calls[0][0].spans).toHaveLength(40);
  });

  it("fails closed without consent — these spans are conversation content", async () => {
    const { client, insert } = fakeClient();
    mockGetClient.mockResolvedValue(client);
    await recordEnforcedRefereeOutcome({
      summary,
      contractId: "c",
      correlationId: "x",
      ctx: { ...ctx, consent: false },
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it("no-ops when tracking is disabled", async () => {
    mockEnv.mockReturnValue({ enabled: false } as never);
    const { client, insert } = fakeClient();
    mockGetClient.mockResolvedValue(client);
    await recordEnforcedRefereeOutcome({ summary, contractId: "c", correlationId: "x", ctx });
    expect(insert).not.toHaveBeenCalled();
  });

  it("never throws into the stream when the insert fails", async () => {
    mockGetClient.mockRejectedValue(new Error("supabase down"));
    await expect(
      recordEnforcedRefereeOutcome({ summary, contractId: "c", correlationId: "x", ctx }),
    ).resolves.toBeUndefined();
  });
});

describe("zero-card reviews — the overview referee must be visible", () => {
  // Found by the CI-6 consolidation battery: 08_quiet_positional produced no
  // cards, its overview WAS refereed, and a sentence was DELETED — yet the row
  // read armed_errors=0, spans=0, matched=0. Byte-identical to a clean review,
  // and `matched > 0` then dropped it from the headline denominator. The
  // metric we intend to retire the legacy path on was undercounting.
  const zeroCard: EnforcedRefereeSummaryLike = {
    cards: [],
    errorsInitialTotal: 0,
    warnsInitialTotal: 0,
    unanchoredBlocks: 0,
    sentinelCardsRefused: 0,
    overviewOutcome: "sentence_drop",
    overviewViolations: 2,
  };

  it("counts a refereed overview as graded, so the headline cannot drop it", async () => {
    const { client, insert } = fakeClient();
    mockGetClient.mockResolvedValue(client);
    await recordEnforcedRefereeOutcome({
      summary: zeroCard,
      contractId: "c",
      correlationId: "x",
      ctx,
    });
    const row = insert.mock.calls[0][0];
    // The headline filters `matched > 0`. Without this the review vanishes.
    expect(row.matched).toBe(1);
    expect(row.armed_errors).toBe(2);
    expect(row.referee_errors).toBe(2);
  });

  it("records the overview's ladder stage as its own span", async () => {
    const { client, insert } = fakeClient();
    mockGetClient.mockResolvedValue(client);
    await recordEnforcedRefereeOutcome({
      summary: zeroCard,
      contractId: "c",
      correlationId: "x",
      ctx,
    });
    expect(insert.mock.calls[0][0].spans).toContainEqual(
      expect.objectContaining({ factIdPrefix: "overview", stage: "sentence_drop", armed: true }),
    );
  });

  it("a CLEAN overview is graded but contributes no errors", async () => {
    const { client, insert } = fakeClient();
    mockGetClient.mockResolvedValue(client);
    await recordEnforcedRefereeOutcome({
      summary: { ...zeroCard, overviewOutcome: "pass", overviewViolations: 0 },
      contractId: "c",
      correlationId: "x",
      ctx,
    });
    const row = insert.mock.calls[0][0];
    expect(row.matched).toBe(1);
    expect(row.armed_errors).toBe(0);
    expect(row.spans).toContainEqual(
      expect.objectContaining({ factIdPrefix: "overview", armed: false }),
    );
  });

  it("a carded review is unaffected — overviewOutcome is null there", async () => {
    const { client, insert } = fakeClient();
    mockGetClient.mockResolvedValue(client);
    await recordEnforcedRefereeOutcome({ summary, contractId: "c", correlationId: "x", ctx });
    const row = insert.mock.calls[0][0];
    expect(row.matched).toBe(2);
    expect(row.armed_errors).toBe(1);
    expect(row.spans.some((s: { factIdPrefix: string }) => s.factIdPrefix === "overview")).toBe(
      false,
    );
  });
});

describe("STRUCTURAL GUARD — the write lives inside the enforced branch", () => {
  it("route.ts records an outcome between arming the gate and closing the stream", () => {
    const src = readFileSync("src/app/api/enhanced-analysis/route.ts", "utf8");

    const branchStart = src.indexOf("servingGate.armed");
    const capture = src.indexOf("captureEnforcedRefereeOutcome({");
    const shadowGate = src.indexOf("maybeCreateShadowRefereeGate({");

    expect(branchStart).toBeGreaterThan(-1);
    // The regression: no call at all, which is the state that shipped.
    expect(capture).toBeGreaterThan(-1);
    // Inside the enforced branch — which returns before the shadow gate that
    // was previously the only writer.
    expect(capture).toBeGreaterThan(branchStart);
    expect(capture).toBeLessThan(shadowGate);
  });
});
