/**
 * buildAsyncSnapshotForMove — fetch orchestration tests (Stage 9 v2).
 *
 * The pure packaging logic (results → VoterSnapshot fields/confidences) is
 * covered by voterSnapshot.test.ts via buildAsyncVoterSnapshot. This suite
 * covers what the fetch-orchestrating wrapper adds:
 *   - per-source gating (shouldCallLc0 / shouldCallMaia / isTablebaseEligible)
 *   - bestMoveUci derivation from stockfishLines[0].pv[0]
 *   - per-source fail-open (.catch(() => null)) — the helper NEVER rejects
 *   - the stage9_async_grounding_fetched telemetry line (ok/fail/skipped)
 *
 * Client modules are partial-mocked: query functions + gates are stubbed,
 * everything else (lc0AgreesWithSf, probToVisibility, …) stays real so the
 * voter math inside the snapshot build keeps working.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const {
  mockLog,
  mockQueryChessdb,
  mockQueryLc0,
  mockShouldCallLc0,
  mockQueryMaia,
  mockShouldCallMaia,
  mockFetchTablebase,
  mockIsTablebaseEligible,
} = vi.hoisted(() => ({
  mockLog: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  mockQueryChessdb: vi.fn(),
  mockQueryLc0: vi.fn(),
  mockShouldCallLc0: vi.fn(),
  mockQueryMaia: vi.fn(),
  mockShouldCallMaia: vi.fn(),
  mockFetchTablebase: vi.fn(),
  mockIsTablebaseEligible: vi.fn(),
}));

vi.mock("@/lib/logging", () => ({
  logger: { child: vi.fn(() => mockLog) },
}));
vi.mock("@/lib/grounding/chessdb", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/grounding/chessdb")>();
  return { ...actual, queryChessdb: mockQueryChessdb };
});
vi.mock("@/lib/grounding/lc0", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/grounding/lc0")>();
  return { ...actual, queryLc0: mockQueryLc0, shouldCallLc0: mockShouldCallLc0 };
});
vi.mock("@/lib/grounding/maia", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/grounding/maia")>();
  return {
    ...actual,
    queryMaiaAtRating: mockQueryMaia,
    shouldCallMaia: mockShouldCallMaia,
  };
});
vi.mock("@/lib/mastermind/lichessTablebase", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/mastermind/lichessTablebase")>();
  return {
    ...actual,
    fetch_lichess_tablebase: mockFetchTablebase,
    isTablebaseEligible: mockIsTablebaseEligible,
  };
});

import { buildAsyncSnapshotForMove } from "@/lib/grounding/voterSnapshot";
import {
  __resetCircuitBreakers,
  BREAKER_THRESHOLD,
} from "@/lib/grounding/circuitBreaker";
import type { MaiaProbResult } from "@/lib/grounding/maia";
import type { Lc0Result } from "@/lib/grounding/lc0";
import type { ChessdbResult } from "@/lib/grounding/chessdb";
import type { TablebaseResult } from "@/lib/mastermind/lichessTablebase";

// Verified fixture (mirrors voterSnapshot.test.ts / tactics tests)
const FORK_FEN_BEFORE = "4k3/3q1r2/8/8/8/5N2/8/4K3 w - - 0 1";
const FORK_MOVE = "Ne5";

const LINES = [
  { cp: 60, pv: ["f3e5", "d7d5"] },
  { cp: 40, pv: ["e1d2"] },
];

const MAIA: MaiaProbResult = {
  fen: FORK_FEN_BEFORE,
  rating: 1500,
  best_move_uci: "f3e5",
  prob_plays_best: 0.42,
  likely_moves: [],
  model: "maia2",
  source: "live",
};
const LC0: Lc0Result = {
  fen: FORK_FEN_BEFORE,
  eval_cp: 80,
  best_move: "Ne5",
  nodes: 800,
  model: "lc0",
  source: "live",
};
const CDB: ChessdbResult = {
  fen: FORK_FEN_BEFORE,
  best_move: "Ne5",
  score_cp: 220,
  outcome: "win",
  source: "live",
};
const TB = { dtm: 12 } as unknown as TablebaseResult;

function baseInput(overrides: Partial<Parameters<typeof buildAsyncSnapshotForMove>[0]> = {}) {
  return {
    fenBefore: FORK_FEN_BEFORE,
    moveSan: FORK_MOVE,
    stockfishEvalCp: 60,
    stockfishBestMoveMate: null,
    stockfishLines: LINES,
    userRating: 1500,
    correlationId: "test-corr-id",
    branch: "unit-test",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetCircuitBreakers();
  mockQueryChessdb.mockResolvedValue(CDB);
  mockQueryLc0.mockResolvedValue(LC0);
  mockShouldCallLc0.mockReturnValue(true);
  mockQueryMaia.mockResolvedValue(MAIA);
  mockShouldCallMaia.mockReturnValue(true);
  mockFetchTablebase.mockResolvedValue(TB);
  mockIsTablebaseEligible.mockReturnValue(true);
});

describe("buildAsyncSnapshotForMove", () => {
  it("populates maiaProb / lc0Cp / syzygyDtm when all sources are gated in and succeed", async () => {
    const snap = await buildAsyncSnapshotForMove(baseInput());
    expect(snap.maiaProb).toBe(0.42);
    expect(snap.lc0Cp).toBe(80);
    // Raw Lichess dtm (12 plies) is normalized to full moves: ceil(12/2) = 6.
    expect(snap.syzygyDtm).toBe(6);
    expect(snap.sfCp).toBe(60);
    expect(snap.userRating).toBe(1500);
  });

  it("normalizes Syzygy dtm: positive plies → ceil(dtm/2) full moves", async () => {
    mockFetchTablebase.mockResolvedValue({ dtm: 5 } as unknown as TablebaseResult);
    const snap = await buildAsyncSnapshotForMove(baseInput());
    // A true mate-in-3 is ~5 plies; normalized lands on 3, matching the
    // validator's full-move contract (mateInN Fire B).
    expect(snap.syzygyDtm).toBe(3);
  });

  it("nulls Syzygy dtm for non-winning positions (sign guard: dtm <= 0)", async () => {
    // Negative dtm = side to move is being mated. Fire A (mate_in_n=NONE)
    // owns ungrounded-claim detection there; Fire B must not compare an
    // opponent/negative distance.
    mockFetchTablebase.mockResolvedValue({ dtm: -8 } as unknown as TablebaseResult);
    const snapLoss = await buildAsyncSnapshotForMove(baseInput());
    expect(snapLoss.syzygyDtm).toBeNull();

    mockFetchTablebase.mockResolvedValue({ dtm: 0 } as unknown as TablebaseResult);
    const snapZero = await buildAsyncSnapshotForMove(baseInput());
    expect(snapZero.syzygyDtm).toBeNull();
  });

  it("derives bestMoveUci from stockfishLines[0].pv[0] for the Maia gate and query", async () => {
    await buildAsyncSnapshotForMove(baseInput());
    expect(mockShouldCallMaia).toHaveBeenCalledWith(1500, "f3e5");
    expect(mockQueryMaia).toHaveBeenCalledWith(FORK_FEN_BEFORE, 1500, "f3e5");
  });

  it("passes sf eval + full lines to the Lc0 gate and queries on fenBefore", async () => {
    await buildAsyncSnapshotForMove(baseInput());
    expect(mockShouldCallLc0).toHaveBeenCalledWith(60, LINES);
    expect(mockQueryLc0).toHaveBeenCalledWith(FORK_FEN_BEFORE);
    expect(mockQueryChessdb).toHaveBeenCalledWith(FORK_FEN_BEFORE);
    expect(mockFetchTablebase).toHaveBeenCalledWith(FORK_FEN_BEFORE);
  });

  it("skips Lc0 when shouldCallLc0 is false (status skipped, no fetch)", async () => {
    mockShouldCallLc0.mockReturnValue(false);
    const snap = await buildAsyncSnapshotForMove(baseInput());
    expect(mockQueryLc0).not.toHaveBeenCalled();
    expect(snap.lc0Cp).toBeNull();
    expect(mockLog.info).toHaveBeenCalledWith(
      "stage9_async_grounding_fetched",
      expect.objectContaining({ lc0_status: "skipped" }),
    );
  });

  it("skips Maia when shouldCallMaia is false (e.g. no rating)", async () => {
    mockShouldCallMaia.mockReturnValue(false);
    const snap = await buildAsyncSnapshotForMove(baseInput({ userRating: null }));
    expect(mockQueryMaia).not.toHaveBeenCalled();
    expect(snap.maiaProb).toBeNull();
    expect(mockLog.info).toHaveBeenCalledWith(
      "stage9_async_grounding_fetched",
      expect.objectContaining({ maia_status: "skipped" }),
    );
  });

  it("skips the tablebase when the position is not eligible", async () => {
    mockIsTablebaseEligible.mockReturnValue(false);
    const snap = await buildAsyncSnapshotForMove(baseInput());
    expect(mockFetchTablebase).not.toHaveBeenCalled();
    expect(snap.syzygyDtm).toBeNull();
    expect(mockLog.info).toHaveBeenCalledWith(
      "stage9_async_grounding_fetched",
      expect.objectContaining({ tablebase_status: "skipped" }),
    );
  });

  it("a chessdb rejection degrades only chessdb (fail-open), other sources still populate", async () => {
    mockQueryChessdb.mockRejectedValue(new Error("chessdb.cn down"));
    const snap = await buildAsyncSnapshotForMove(baseInput());
    expect(snap.maiaProb).toBe(0.42);
    expect(snap.lc0Cp).toBe(80);
    expect(mockLog.info).toHaveBeenCalledWith(
      "stage9_async_grounding_fetched",
      expect.objectContaining({ chessdb_status: "fail", maia_status: "ok" }),
    );
  });

  it("a Maia timeout/rejection degrades maiaProb to null", async () => {
    mockQueryMaia.mockRejectedValue(new Error("timeout"));
    const snap = await buildAsyncSnapshotForMove(baseInput());
    expect(snap.maiaProb).toBeNull();
    expect(mockLog.info).toHaveBeenCalledWith(
      "stage9_async_grounding_fetched",
      expect.objectContaining({ maia_status: "fail" }),
    );
  });

  it("never rejects: full grounding outage resolves to a sync-equivalent snapshot", async () => {
    mockQueryChessdb.mockRejectedValue(new Error("down"));
    mockQueryLc0.mockRejectedValue(new Error("down"));
    mockQueryMaia.mockRejectedValue(new Error("down"));
    mockFetchTablebase.mockRejectedValue(new Error("down"));

    const snap = await buildAsyncSnapshotForMove(baseInput());
    expect(snap.maiaProb).toBeNull();
    expect(snap.lc0Cp).toBeNull();
    expect(snap.syzygyDtm).toBeNull();
    // sf fields survive — validators degrade to sync-snapshot behavior
    expect(snap.sfCp).toBe(60);
  });

  it("emits one telemetry line with statuses, branch, correlation id and a numeric total_fetch_ms", async () => {
    await buildAsyncSnapshotForMove(baseInput());
    expect(mockLog.info).toHaveBeenCalledTimes(1);
    expect(mockLog.info).toHaveBeenCalledWith(
      "stage9_async_grounding_fetched",
      expect.objectContaining({
        fen: FORK_FEN_BEFORE,
        move_san: FORK_MOVE,
        correlation_id: "test-corr-id",
        branch: "unit-test",
        chessdb_status: "ok",
        lc0_status: "ok",
        maia_status: "ok",
        tablebase_status: "ok",
        total_fetch_ms: expect.any(Number),
      }),
    );
  });

  it("a 'null' client result (service unconfigured) is reported as fail, not ok", async () => {
    // queryLc0 returns null (LC0_API_URL unset) even when the gate passed —
    // distinct from gated-out "skipped".
    mockQueryLc0.mockResolvedValue(null);
    const snap = await buildAsyncSnapshotForMove(baseInput());
    expect(snap.lc0Cp).toBeNull();
    expect(mockLog.info).toHaveBeenCalledWith(
      "stage9_async_grounding_fetched",
      expect.objectContaining({ lc0_status: "fail" }),
    );
  });

  it("logs per-source latency ms for each source", async () => {
    await buildAsyncSnapshotForMove(baseInput());
    expect(mockLog.info).toHaveBeenCalledWith(
      "stage9_async_grounding_fetched",
      expect.objectContaining({
        chessdb_ms: expect.any(Number),
        lc0_ms: expect.any(Number),
        maia_ms: expect.any(Number),
        tablebase_ms: expect.any(Number),
        total_fetch_ms: expect.any(Number),
      }),
    );
  });

  it("a resolved-null (no data) does NOT trip the circuit breaker", async () => {
    // Unconfigured/no-data sources resolve null cheaply — only thrown timeouts
    // should open the breaker. Many null results must keep chessdb being tried.
    mockQueryChessdb.mockResolvedValue(null);
    for (let i = 0; i < BREAKER_THRESHOLD + 2; i++) {
      await buildAsyncSnapshotForMove(baseInput());
    }
    expect(mockQueryChessdb).toHaveBeenCalledTimes(BREAKER_THRESHOLD + 2);
  });

  it("opens the breaker when the source TIMES OUT — the shape production actually produces", async () => {
    // T2 (SILENT_SUBSTITUTION_HANDOFF §4). This is the case the suite was
    // missing. The neighbouring test mocks a REJECTION, but no grounding
    // client can reject: each one wraps its aborting fetch in
    // `catch { return null }`. So in production a timeout arrives as a
    // resolved null, `recordSuccess` ran, the counter reset, and the breaker
    // could never open — every turn paid the full timeout for the whole
    // outage.
    //
    // Simulated by advancing the clock across the fetch rather than really
    // waiting 6s: the breaker classifies on ELAPSED TIME, so that is the only
    // thing the test needs to control. Other sources are gated off to keep
    // the Date.now() call sequence deterministic.
    mockShouldCallLc0.mockReturnValue(false);
    mockShouldCallMaia.mockReturnValue(false);
    mockIsTablebaseEligible.mockReturnValue(false);
    const CHESSDB_TIMEOUT_MS = 6000;

    // Model what actually happens: time passes DURING the fetch, and the
    // client hands back a null when its own AbortController fires. Advancing
    // a fake clock inside the mock keeps this independent of how many times
    // Date.now() happens to be called, and keeps the turn's `now` (read before
    // the fetch) well inside the breaker cooldown window.
    let clock = 1_000_000;
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => clock);
    mockQueryChessdb.mockImplementation(async () => {
      clock += CHESSDB_TIMEOUT_MS;
      return null;
    });

    try {
      for (let i = 0; i < BREAKER_THRESHOLD; i++) {
        await buildAsyncSnapshotForMove(baseInput());
      }
      expect(mockQueryChessdb).toHaveBeenCalledTimes(BREAKER_THRESHOLD);

      // Breaker must now be open: the next turn must not call chessdb at all.
      await buildAsyncSnapshotForMove(baseInput());
      expect(mockQueryChessdb).toHaveBeenCalledTimes(BREAKER_THRESHOLD);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("opens the breaker after repeated throws and skips the source (circuit_open)", async () => {
    mockQueryChessdb.mockRejectedValue(new Error("chessdb.cn down"));
    for (let i = 0; i < BREAKER_THRESHOLD; i++) {
      await buildAsyncSnapshotForMove(baseInput());
    }
    expect(mockQueryChessdb).toHaveBeenCalledTimes(BREAKER_THRESHOLD);

    // Breaker is now open: the next turn must NOT call chessdb at all.
    mockLog.info.mockClear();
    const snap = await buildAsyncSnapshotForMove(baseInput());
    expect(mockQueryChessdb).toHaveBeenCalledTimes(BREAKER_THRESHOLD); // unchanged
    expect(snap).toBeTruthy(); // still fail-open: snapshot built from the rest
    expect(mockLog.info).toHaveBeenCalledWith(
      "stage9_async_grounding_fetched",
      expect.objectContaining({ chessdb_status: "circuit_open", chessdb_ms: 0 }),
    );
  });
});
