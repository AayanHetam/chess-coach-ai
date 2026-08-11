import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * T4 (SILENT_SUBSTITUTION_HANDOFF §4) — the prompt-side grounding path emits
 * no telemetry.
 *
 * `buildCoachContract` fires every grounding fetch with `.catch(() => null)`.
 * That is correct fail-open behaviour, but it also means a source failing
 * 100% of the time is INDISTINGUISHABLE from a source that simply has no data
 * for these positions: the prompt quietly gets thinner and nothing in the logs
 * changes. The measured +70pp tactical-accuracy result rests on these fetches
 * landing, and until this line existed there was no way to confirm they still do.
 *
 * `stage9_async_grounding_fetched` does NOT cover this — that log line is on
 * the validator path, which is a different set of fetches.
 */

const { mockLog, mockQueryChessdb, mockQueryLc0, mockShouldCallLc0, mockShouldCallMaia } =
  vi.hoisted(() => ({
    mockLog: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    mockQueryChessdb: vi.fn(),
    mockQueryLc0: vi.fn(),
    mockShouldCallLc0: vi.fn(),
    mockShouldCallMaia: vi.fn(),
  }));

vi.mock("@/lib/logging", () => ({
  logger: { child: vi.fn(() => mockLog) },
}));
vi.mock("@/lib/grounding/chessdb", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/grounding/chessdb")>()),
  queryChessdb: mockQueryChessdb,
}));
vi.mock("@/lib/grounding/lc0", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/grounding/lc0")>()),
  queryLc0: mockQueryLc0,
  shouldCallLc0: mockShouldCallLc0,
}));
vi.mock("@/lib/grounding/maia", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/grounding/maia")>()),
  shouldCallMaia: mockShouldCallMaia,
}));

import { buildCoachContract } from "@/lib/contract/builder";

const line = (cp: number) => ({ pv: ["e2e4"], cp, depth: 16, multiPv: 1 });

/** A game with one real White blunder at ply 0, so an insight is selected. */
const ARGS = {
  moveHistory: ["e4", "e5", "Nf3", "Nc6"],
  gameEval: {
    positions: [
      { bestMove: "e2e4", lines: [line(620)] },
      { bestMove: "e2e4", lines: [line(-50)] },
      { bestMove: "e2e4", lines: [line(-60)] },
      { bestMove: "e2e4", lines: [line(-70)] },
      { bestMove: "e2e4", lines: [line(-80)] },
    ],
  },
  playerColor: "w",
  username: undefined,
  userRating: 1500,
  gameHeaders: undefined,
};

function telemetry() {
  return mockLog.info.mock.calls.find((c) => c[0] === "contract_grounding_fetched")?.[1];
}

beforeEach(() => {
  vi.clearAllMocks();
  mockShouldCallLc0.mockReturnValue(false);
  mockShouldCallMaia.mockReturnValue(false);
  mockQueryChessdb.mockResolvedValue(null);
  mockQueryLc0.mockResolvedValue(null);
});

describe("contract_grounding_fetched telemetry", () => {
  it("is emitted on every contract build", async () => {
    await buildCoachContract(ARGS);
    expect(telemetry()).toBeDefined();
  });

  it("reports a healthy source as ok", async () => {
    mockQueryChessdb.mockResolvedValue({
      fen: "x",
      best_move: "e4",
      score_cp: 30,
      outcome: "win",
      source: "live",
    });
    await buildCoachContract(ARGS);
    const t = telemetry();
    expect(t.chessdb.requested).toBeGreaterThan(0);
    expect(t.chessdb.ok).toBe(t.chessdb.requested);
  });

  it("makes a totally-failing source visible (the whole point)", async () => {
    // This is the scenario the finding is about: chessdb down, every call
    // swallowed by `.catch(() => null)`. Before this telemetry the logs looked
    // IDENTICAL to a healthy build.
    mockQueryChessdb.mockRejectedValue(new Error("chessdb.cn down"));
    await buildCoachContract(ARGS);
    const t = telemetry();
    expect(t.chessdb.requested).toBeGreaterThan(0);
    expect(t.chessdb.ok).toBe(0);
  });

  it("distinguishes a rejection from a clean no-data null only by count, not by crashing", async () => {
    mockQueryChessdb.mockResolvedValue(null);
    await buildCoachContract(ARGS);
    expect(telemetry().chessdb.ok).toBe(0);
  });

  it("reports zero requested for a gated-off source rather than omitting it", async () => {
    // An absent key would be ambiguous in a dashboard: "gated off" and "field
    // missing from the log line" look the same. Always emit the shape.
    await buildCoachContract(ARGS);
    const t = telemetry();
    expect(t.lc0).toEqual({ requested: 0, ok: 0 });
    expect(t.maia).toEqual({ requested: 0, ok: 0 });
  });

  it("carries the wall-clock the fetches cost", async () => {
    await buildCoachContract(ARGS);
    expect(typeof telemetry().fetchWaitMs).toBe("number");
    expect(telemetry().fetchWaitMs).toBeGreaterThanOrEqual(0);
  });

  it("still fails open — a dead source does not break the contract", async () => {
    mockQueryChessdb.mockRejectedValue(new Error("chessdb.cn down"));
    const contract = await buildCoachContract(ARGS);
    expect(contract.insights.length).toBeGreaterThan(0);
  });
});
