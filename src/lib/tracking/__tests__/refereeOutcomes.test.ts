import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/env", () => ({ getTrackingEnv: vi.fn() }));
vi.mock("../supabase", () => ({ getTrackingSupabase: vi.fn() }));

import { getTrackingEnv } from "@/env";
import { getTrackingSupabase } from "../supabase";
import {
  armingFingerprint,
  recordRefereeOutcome,
  type RefereeOutcomeContext,
} from "../refereeOutcomes";
import type { ShadowRefereeReview } from "@/lib/contract/shadowReferee";

const mockEnv = vi.mocked(getTrackingEnv);
const mockGetClient = vi.mocked(getTrackingSupabase);

function fakeClient(insertResult: { error: { message: string } | null }) {
  const insert = vi.fn().mockResolvedValue(insertResult);
  const from = vi.fn().mockReturnValue({ insert });
  return { client: { from } as never, from, insert };
}

const review: ShadowRefereeReview = {
  contractId: "ct_abc",
  correlationId: "corr1",
  branch: "stream-flagon-fallback",
  blocksSeen: 4,
  matched: 4,
  unmatched: 0,
  malformedHeaders: 0,
  refereeErrors: 3,
  refereeWarns: 5,
  armedErrors: 2,
  armedWarns: 6,
  checkCounts: { tactical_keyword: 2, san_whitelist: 6 },
  categoryCounts: { square_unknown: 6, fork: 2 },
  maxHoldMs: 4,
  p95HoldMs: 3,
  relationalLaunched: 4,
  spans: [
    {
      check: "tactical_keyword",
      category: "fork",
      severity: "error",
      armed: "error",
      span: "forking the bishop on e7",
      sentence: "The knight lands on e6, forking the bishop on e7.",
      factIdPrefix: "M1",
    },
  ],
};

const ctx: RefereeOutcomeContext = {
  consent: true,
  isIntern: false,
  requestId: "req1",
  category: "game_review",
  model: "claude-sonnet-4-6",
  promptVersion: "3.6",
  verbalizerPromptVersion: "4.0",
  contractVersion: "1.0",
  appVersion: "sha123",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.mockReturnValue({ enabled: true } as never);
});

describe("recordRefereeOutcome: gating", () => {
  it("no-ops when TRACKING_ENABLED is off — no client, no throw", async () => {
    mockEnv.mockReturnValue({ enabled: false } as never);
    await expect(
      recordRefereeOutcome({ review, ctx })
    ).resolves.toBeUndefined();
    expect(mockGetClient).not.toHaveBeenCalled();
  });

  it("no-ops without consent, even with tracking on", async () => {
    await expect(
      recordRefereeOutcome({ review, ctx: { ...ctx, consent: false } })
    ).resolves.toBeUndefined();
    expect(mockGetClient).not.toHaveBeenCalled();
  });

  it("writes when tracking is on AND consent is given", async () => {
    const fk = fakeClient({ error: null });
    mockGetClient.mockResolvedValue(fk.client);
    await recordRefereeOutcome({ review, ctx });
    expect(fk.from).toHaveBeenCalledWith("referee_outcomes");
    expect(fk.insert).toHaveBeenCalledTimes(1);
  });
});

describe("recordRefereeOutcome: row shape", () => {
  it("maps aggregate summary data without conversation content or identifiers", async () => {
    const fk = fakeClient({ error: null });
    mockGetClient.mockResolvedValue(fk.client);
    await recordRefereeOutcome({ review, ctx });

    const row = fk.insert.mock.calls[0][0];
    expect(row).toMatchObject({
      is_intern: false,
      request_id: "req1",
      contract_id: "ct_abc",
      correlation_id: "corr1",
      branch: "stream-flagon-fallback",
      category: "game_review",
      model: "claude-sonnet-4-6",
      prompt_version: "3.6",
      verbalizer_version: "4.0",
      contract_version: "1.0",
      app_version: "sha123",
      blocks_seen: 4,
      matched: 4,
      unmatched: 0,
      malformed_headers: 0,
      // referee severity vs. what the CURRENT arming table would enforce
      referee_errors: 3,
      referee_warns: 5,
      armed_errors: 2,
      armed_warns: 6,
      check_counts: { tactical_keyword: 2, san_whitelist: 6 },
      category_counts: { square_unknown: 6, fork: 2 },
      max_hold_ms: 4,
      p95_hold_ms: 3,
      relational_launched: 4,
    });
    expect(row.spans).toEqual([]);
    expect(row).not.toHaveProperty("uid");
    expect(row).not.toHaveProperty("anon_id");
    expect(JSON.stringify(row)).not.toContain("forking the bishop");
    // Stamped so a re-arming can't silently mix two populations.
    expect(row.arming_fingerprint).toBe(armingFingerprint());
    expect(row.arming_fingerprint).toMatch(/^[0-9a-f]{12}$/);
  });

  it("defaults optional operational fields to null / false", async () => {
    const fk = fakeClient({ error: null });
    mockGetClient.mockResolvedValue(fk.client);
    await recordRefereeOutcome({ review, ctx: { consent: true } });
    const row = fk.insert.mock.calls[0][0];
    expect(row).toMatchObject({
      is_intern: false,
      request_id: null,
      category: null,
      model: null,
    });
  });

  it("stores no user, anonymous, network, or session identifiers", async () => {
    const fk = fakeClient({ error: null });
    mockGetClient.mockResolvedValue(fk.client);
    await recordRefereeOutcome({ review, ctx });
    const keys = Object.keys(fk.insert.mock.calls[0][0]);
    for (const forbidden of [
      "uid",
      "anon_id",
      "ip_hash",
      "ip",
      "user_agent",
      "referrer",
      "session_id",
      "email",
    ]) {
      expect(keys).not.toContain(forbidden);
    }
  });
});

describe("recordRefereeOutcome: never breaks the stream", () => {
  it("swallows an insert error", async () => {
    mockGetClient.mockResolvedValue(
      fakeClient({ error: { message: "db boom" } }).client
    );
    await expect(
      recordRefereeOutcome({ review, ctx })
    ).resolves.toBeUndefined();
  });

  it("swallows a thrown client", async () => {
    mockGetClient.mockRejectedValue(new Error("supabase down"));
    await expect(
      recordRefereeOutcome({ review, ctx })
    ).resolves.toBeUndefined();
  });
});

describe("armingFingerprint", () => {
  it("is stable across calls", () => {
    expect(armingFingerprint()).toBe(armingFingerprint());
  });
});
