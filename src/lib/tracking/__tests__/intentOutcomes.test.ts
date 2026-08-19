import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/env", () => ({ getTrackingEnv: vi.fn() }));
vi.mock("../supabase", () => ({ getTrackingSupabase: vi.fn() }));

import { getTrackingEnv } from "@/env";
import { getTrackingSupabase } from "../supabase";
import {
  intentFingerprint,
  recordIntentOutcome,
  __resetIntentFingerprintForTests,
  type IntentOutcomeContext,
} from "../intentOutcomes";
import type { IntentSummary } from "@/lib/contract/types";
import type { IntentFacts } from "@/lib/intent/types";

const mockEnv = vi.mocked(getTrackingEnv);
const mockGetClient = vi.mocked(getTrackingSupabase);

function fakeClient(insertResult: { error: { message: string } | null }) {
  const insert = vi.fn().mockResolvedValue(insertResult);
  const from = vi.fn().mockReturnValue({ insert });
  return { client: { from } as never, from, insert };
}

const EMPTY = {
  mate: null,
  material: null,
  trap: null,
  escape: null,
  prophylaxis: null,
  unaddressedThreat: null,
  cost: null,
  purpose: "none",
  sharpness: null,
  quiet: false,
} as unknown as IntentFacts;

function row(ply: number, mover: "w" | "b", facts: Partial<IntentFacts>): IntentSummary {
  return {
    ply,
    mover,
    playedSan: "Nh7",
    tier: "tier0",
    facts: { ...EMPTY, ...facts } as IntentFacts,
  };
}

// Same mover repeats the same unanswered threat on two turns (one episode),
// the other mover has a one-shot escape. Episode vs ply counts must differ.
const INTENT: IntentSummary[] = [
  row(40, "w", {
    unaddressedThreat: { threatSan: "Qh4" } as unknown as IntentFacts["unaddressedThreat"],
  }),
  row(41, "b", {
    escape: { piece: "n", valueCp: 320 } as unknown as IntentFacts["escape"],
    purpose: "escape" as IntentFacts["purpose"],
  }),
  row(42, "w", {
    unaddressedThreat: { threatSan: "Qh4" } as unknown as IntentFacts["unaddressedThreat"],
  }),
];

const ctx: IntentOutcomeContext = {
  consent: true,
  isIntern: false,
  requestId: "req1",
  contractVersion: "c1",
  appVersion: "sha",
};

const input = {
  intent: INTENT,
  contractId: "ct_abc",
  correlationId: "corr1",
  buildMs: 321,
  ctx,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.mockReturnValue({ enabled: true } as never);
});

describe("recordIntentOutcome", () => {
  it("writes one content-free aggregate row", async () => {
    const { client, from, insert } = fakeClient({ error: null });
    mockGetClient.mockResolvedValue(client);

    await recordIntentOutcome(input);

    expect(from).toHaveBeenCalledWith("intent_outcomes");
    const rowSent = insert.mock.calls[0][0];
    expect(rowSent).toMatchObject({
      contract_id: "ct_abc",
      correlation_id: "corr1",
      plies_analysed: 3,
      mover_counts: { w: 2, b: 1 },
      tier_counts: { tier0: 3, tier1: 0 },
      // Raw per-ply presence…
      ply_counts: { unaddressedThreat: 2, escape: 1 },
      // …and the honest number: the repeated threat is ONE episode.
      episode_counts: { unaddressedThreat: 1, escape: 1 },
      purpose_counts: { none: 2, escape: 1 },
      quiet_plies: 0,
      build_ms: 321,
    });
  });

  it("NEVER persists game content — no SAN, FEN, or score reaches the row", async () => {
    const { client, insert } = fakeClient({ error: null });
    mockGetClient.mockResolvedValue(client);

    await recordIntentOutcome(input);

    const serialized = JSON.stringify(insert.mock.calls[0][0]);
    // The fixture's identifying game content must be absent.
    expect(serialized).not.toContain("Qh4");
    expect(serialized).not.toContain("Nh7");
    expect(serialized).not.toContain("320");
  });

  it("fails closed without consent", async () => {
    const { client, from } = fakeClient({ error: null });
    mockGetClient.mockResolvedValue(client);

    await recordIntentOutcome({ ...input, ctx: { ...ctx, consent: false } });

    expect(from).not.toHaveBeenCalled();
  });

  it("no-ops when tracking is disabled", async () => {
    mockEnv.mockReturnValue({ enabled: false } as never);
    const { client, from } = fakeClient({ error: null });
    mockGetClient.mockResolvedValue(client);

    await recordIntentOutcome(input);

    expect(from).not.toHaveBeenCalled();
    expect(mockGetClient).not.toHaveBeenCalled();
  });

  it("swallows a DB outage — telemetry must not break the stream", async () => {
    mockGetClient.mockRejectedValue(new Error("supabase down"));
    await expect(recordIntentOutcome(input)).resolves.toBeUndefined();
  });

  it("swallows an insert error", async () => {
    const { client } = fakeClient({ error: { message: "nope" } });
    mockGetClient.mockResolvedValue(client);
    await expect(recordIntentOutcome(input)).resolves.toBeUndefined();
  });
});

describe("intentFingerprint", () => {
  it("is a stable 12-hex digest of the calibration table", () => {
    __resetIntentFingerprintForTests();
    const a = intentFingerprint();
    expect(a).toMatch(/^[0-9a-f]{12}$/);
    expect(intentFingerprint()).toBe(a);
  });

  it("stamps the row with the fingerprint", async () => {
    const { client, insert } = fakeClient({ error: null });
    mockGetClient.mockResolvedValue(client);
    await recordIntentOutcome(input);
    expect(insert.mock.calls[0][0].intent_fingerprint).toBe(intentFingerprint());
  });
});
