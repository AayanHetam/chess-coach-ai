/**
 * The contract build split around its grounding fetches (pathway 4.8a,
 * COACH_TURN1_EARLY_STREAM).
 *
 * `beginCoachContract` launches the fetches, `prepare` runs the
 * grounding-free half while they are in flight, and `ground` turns any
 * snapshot of them into a contract. These tests pin what makes that safe
 * (builderEarlyGrounding.parity.test.ts adds the byte parity with
 * `buildCoachContract` on all ten real fixtures). A source still in flight
 * reads exactly as its outage reads.
 * The early and the full contract differ only in the seven grounded keys,
 * and `ground` never mutates or reuses a contract or insight object (the
 * referee's pool caches are keyed by them). The half runs once. The breaker
 * counts one event per source per review, and only with the flag. A fetch
 * that never answers gives up its place at the settle cap.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockLog,
  mockQueryChessdb,
  mockQueryLc0,
  mockShouldCallLc0,
  mockQueryMaia,
  mockShouldCallMaia,
  lineStoryCalls,
} = vi.hoisted(() => ({
  mockLog: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  mockQueryChessdb: vi.fn(),
  mockQueryLc0: vi.fn(),
  mockShouldCallLc0: vi.fn(),
  mockQueryMaia: vi.fn(),
  mockShouldCallMaia: vi.fn(),
  lineStoryCalls: { count: 0 },
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
  queryMaiaAtRating: mockQueryMaia,
  shouldCallMaia: mockShouldCallMaia,
}));
// The real story builder, counted: the CPU half must run once per build.
vi.mock("@/lib/contract/lineStory", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/contract/lineStory")>();
  return {
    ...actual,
    buildLineStory: (...args: Parameters<typeof actual.buildLineStory>) => {
      lineStoryCalls.count += 1;
      return actual.buildLineStory(...args);
    },
  };
});

import {
  beginCoachContract,
  buildCoachContract,
  EMPTY_GROUNDING,
  TURN1_GROUNDING_SETTLE_CAP_MS,
} from "@/lib/contract/builder";
import { buildGameContextWithContract } from "@/lib/contract/legacyGameContext";
import {
  renderLegacyPrompt,
  serializeForVerbalizer,
} from "@/lib/contract/serialize";
import type { InsightContract } from "@/lib/contract/types";
import type { ChessdbResult } from "@/lib/grounding/chessdb";
import {
  __resetCircuitBreakers,
  BREAKER_THRESHOLD,
} from "@/lib/grounding/circuitBreaker";
import {
  argsFor,
  chessdbOk,
  lc0Ok,
  maiaOk,
  SMALL,
  withoutTimes,
} from "./earlyGroundingFixtures";

function answerEverything(): void {
  mockShouldCallLc0.mockReturnValue(true);
  mockShouldCallMaia.mockReturnValue(true);
  mockQueryChessdb.mockImplementation(async (fen: string) => chessdbOk(fen));
  mockQueryLc0.mockImplementation(async (fen: string) => lc0Ok(fen));
  mockQueryMaia.mockImplementation(
    async (fen: string, rating: number, best: string) =>
      maiaOk(fen, rating, best)
  );
}

/** A promise per call that resolves only when released. */
function deferredChessdb() {
  const waiting: Array<{ fen: string; resolve: (v: ChessdbResult) => void }> =
    [];
  mockQueryChessdb.mockImplementation(
    (fen: string) =>
      new Promise<ChessdbResult>((resolve) => waiting.push({ fen, resolve }))
  );
  return {
    waiting,
    release(filter: (fen: string) => boolean = () => true) {
      for (const w of waiting.filter((x) => filter(x.fen))) {
        w.resolve(chessdbOk(w.fen));
      }
    },
  };
}

const GROUNDED_KEYS = [
  "allowedTacticalKeywords",
  "voterConfidence",
  "positionConfidence",
  "groundingContext",
  "chessdb",
  "lc0",
  "visibility",
] as const;

function withoutGrounded(i: InsightContract): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...i };
  for (const k of GROUNDED_KEYS) delete copy[k];
  return copy;
}

function fetchedLog(): Record<string, unknown> | undefined {
  const calls = mockLog.info.mock.calls.filter(
    (c) => c[0] === "contract_grounding_fetched"
  );
  return calls[calls.length - 1]?.[1] as Record<string, unknown> | undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetCircuitBreakers();
  lineStoryCalls.count = 0;
  mockShouldCallLc0.mockReturnValue(false);
  mockShouldCallMaia.mockReturnValue(false);
  mockQueryChessdb.mockResolvedValue(null);
  mockQueryLc0.mockResolvedValue(null);
  mockQueryMaia.mockResolvedValue(null);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Each of these builds a real fixture's contract at least once, about a second each under load. */
const BUILD_TIMEOUT_MS = 120_000;

const TEN = "10_queenless_endgame.json";

describe("a source still in flight reads as its outage", () => {
  it(
    "within the wait it is incomplete, unavailable with service_error, and the prompt is the outage's",
    async () => {
      const args = argsFor(TEN);
      const chessdb = deferredChessdb();
      const pending = beginCoachContract(args, { breaker: true });
      await pending.prepare();
      const early = await pending.within(25);
      expect(early.complete).toBe(false);
      expect(early.chessdb.size).toBe(0);
      expect(pending.launched.chessdb).toBeGreaterThan(1);

      const earlyContract = pending.ground(early);
      expect(earlyContract.insights.length).toBeGreaterThan(0);
      for (const i of earlyContract.insights) {
        expect(i.chessdb).toMatchObject({
          status: "unavailable",
          reason: "service_error",
        });
        expect(i.groundingContext).not.toContain("ChessDB cloud-eval");
      }

      // The same game with chessdb down: byte for byte the same prompt.
      mockQueryChessdb.mockRejectedValue(new Error("chessdb down"));
      const outage = await buildCoachContract(args);
      expect(serializeForVerbalizer(earlyContract)).toBe(
        serializeForVerbalizer(outage)
      );
      expect(renderLegacyPrompt(earlyContract)).toBe(
        renderLegacyPrompt(outage)
      );

      chessdb.release();
      const full = await pending.within(Infinity);
      expect(full.complete).toBe(true);
      expect(full.chessdb.size).toBe(pending.launched.chessdb);
    },
    BUILD_TIMEOUT_MS
  );

  it(
    "the early and the full contract differ only in the grounded keys, and the snapshot only grows",
    async () => {
      const args = argsFor(TEN);
      const chessdb = deferredChessdb();
      const pending = beginCoachContract(args, { breaker: true });
      await pending.prepare();
      // One position answers before the wait, the rest after it.
      const firstFen = chessdb.waiting[0].fen;
      chessdb.release((fen) => fen === firstFen);
      const early = await pending.within(25);
      expect(early.complete).toBe(false);
      expect(Array.from(early.chessdb.keys())).toEqual([firstFen]);

      chessdb.release((fen) => fen !== firstFen);
      const full = await pending.within(Infinity);
      expect(full.complete).toBe(true);
      // Monotone: whatever the early snapshot held, the full one holds the same.
      for (const [fen, value] of Array.from(early.chessdb.entries())) {
        expect(full.chessdb.get(fen)).toEqual(value);
      }
      expect(full.chessdb.size).toBeGreaterThan(early.chessdb.size);

      const a = pending.ground(early);
      const b = pending.ground(full);
      const { insights: ia, ...restA } = withoutTimes(a);
      const { insights: ib, ...restB } = withoutTimes(b);
      expect(restA).toEqual(restB);
      expect(ia.map(withoutGrounded)).toEqual(ib.map(withoutGrounded));
      expect(ia.some((i, n) => i.chessdb.status !== ib[n].chessdb.status)).toBe(
        true
      );
      // The position that answered in time is grounded in both.
      ia.forEach((i, n) => {
        if (i.fenBefore === firstFen) expect(i.chessdb).toEqual(ib[n].chessdb);
      });
    },
    BUILD_TIMEOUT_MS
  );
});

describe("ground", () => {
  it(
    "returns fresh contract and insight objects and never mutates an earlier one",
    async () => {
      answerEverything();
      const pending = beginCoachContract(argsFor(TEN), { breaker: false });
      const g = await pending.within(Infinity);
      const first = pending.ground(g);
      const frozen = JSON.stringify(first);
      const empty = pending.ground(EMPTY_GROUNDING);
      const again = pending.ground(g);

      expect(JSON.stringify(first)).toBe(frozen);
      for (const c of [empty, again]) {
        expect(c).not.toBe(first);
        expect(c.insights).not.toBe(first.insights);
        expect(c.moveTable).not.toBe(first.moveTable);
        expect(c.game).not.toBe(first.game);
        c.insights.forEach((i, n) => expect(i).not.toBe(first.insights[n]));
      }
      expect(withoutTimes(again)).toEqual(withoutTimes(first));
      expect(
        empty.insights.every((i) => i.chessdb.status === "unavailable")
      ).toBe(true);
      expect(first.insights.some((i) => i.chessdb.status === "ok")).toBe(true);
    },
    BUILD_TIMEOUT_MS
  );

  it(
    "runs the CPU half once, whether prepare ran or not",
    async () => {
      const prepared = beginCoachContract(argsFor(TEN), { breaker: false });
      await prepared.prepare();
      await prepared.prepare();
      const afterPrepare = lineStoryCalls.count;
      expect(afterPrepare).toBeGreaterThan(0);
      const g = await prepared.within(Infinity);
      prepared.ground(g);
      prepared.ground(EMPTY_GROUNDING);
      expect(lineStoryCalls.count).toBe(afterPrepare);

      lineStoryCalls.count = 0;
      const cold = beginCoachContract(argsFor(TEN), { breaker: false });
      expect(lineStoryCalls.count).toBe(0);
      cold.ground(await cold.within(Infinity));
      cold.ground(EMPTY_GROUNDING);
      expect(lineStoryCalls.count).toBe(afterPrepare);
    },
    BUILD_TIMEOUT_MS
  );

  it(
    "a ground called while prepare is yielding finishes the half itself, once",
    async () => {
      const pending = beginCoachContract(argsFor(TEN), { breaker: false });
      const preparing = pending.prepare();
      const g = await pending.within(Infinity);
      const c = pending.ground(g);
      await preparing;
      expect(c.insights.length).toBeGreaterThan(0);
      const calls = lineStoryCalls.count;
      pending.ground(g);
      expect(lineStoryCalls.count).toBe(calls);
    },
    BUILD_TIMEOUT_MS
  );
});

describe("the breaker, with the flag only", () => {
  const CHESSDB_TIMEOUT_MS = 6000;

  /** Time passes during each fetch, the way a client that times out returns null. */
  function timingOutChessdb(answerFirst = false) {
    let clock = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    let call = 0;
    mockQueryChessdb.mockImplementation(async (fen: string) => {
      call += 1;
      clock += CHESSDB_TIMEOUT_MS;
      return answerFirst && call % 2 === 1 ? chessdbOk(fen) : null;
    });
  }

  it("after three all-timeout reviews, a fourth sends no chessdb fetch and says why", async () => {
    timingOutChessdb();
    for (let i = 0; i < BREAKER_THRESHOLD; i++) {
      const p = beginCoachContract(SMALL, { breaker: true });
      await p.within(Infinity);
    }
    const sent = mockQueryChessdb.mock.calls.length;
    expect(sent).toBe(BREAKER_THRESHOLD);

    const fourth = beginCoachContract(SMALL, { breaker: true });
    expect(fourth.launched.chessdb).toBe(0);
    const g = await fourth.within(Infinity);
    expect(mockQueryChessdb.mock.calls.length).toBe(sent);
    expect(g.complete).toBe(true);
    const logged = fetchedLog()!;
    expect(logged.circuitOpen).toEqual({ chessdb: 1, lc0: 0, maia: 0 });
    // Asked for, not answered: the dashboard sees the thinner prompt.
    expect(logged.chessdb).toEqual({ requested: 1, ok: 0 });
    const c = fourth.ground(g);
    expect(c.insights[0].chessdb).toMatchObject({
      status: "unavailable",
      reason: "service_error",
    });
  });

  it("a review where one fetch answered is a success", async () => {
    timingOutChessdb(true);
    const args = argsFor(TEN);
    for (let i = 0; i < BREAKER_THRESHOLD + 1; i++) {
      const p = beginCoachContract(args, { breaker: true });
      expect(p.launched.chessdb).toBeGreaterThan(1);
      await p.within(Infinity);
    }
    const p = beginCoachContract(args, { breaker: true });
    expect(p.launched.chessdb).toBeGreaterThan(1);
    await p.within(Infinity);
    expect(fetchedLog()!.circuitOpen).toEqual({ chessdb: 0, lc0: 0, maia: 0 });
  });

  it("buildCoachContract still fetches while the breaker is open", async () => {
    timingOutChessdb();
    for (let i = 0; i < BREAKER_THRESHOLD; i++) {
      await beginCoachContract(SMALL, { breaker: true }).within(Infinity);
    }
    expect(beginCoachContract(SMALL, { breaker: true }).launched.chessdb).toBe(
      0
    );
    const sent = mockQueryChessdb.mock.calls.length;
    await buildCoachContract(SMALL);
    expect(mockQueryChessdb.mock.calls.length).toBe(sent + 1);
    expect(fetchedLog()!).not.toHaveProperty("circuitOpen");
  });
});

describe("the settle cap", () => {
  it("a fetch that never answers gives a snapshot at the cap, not later", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    mockQueryChessdb.mockImplementation(() => new Promise(() => {}));
    const pending = beginCoachContract(SMALL, { breaker: true });
    let got: Awaited<ReturnType<typeof pending.within>> | null = null;
    void pending.within(TURN1_GROUNDING_SETTLE_CAP_MS).then((g) => {
      got = g;
    });
    await vi.advanceTimersByTimeAsync(TURN1_GROUNDING_SETTLE_CAP_MS - 1);
    expect(got).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(got).not.toBeNull();
    expect(got!.complete).toBe(false);
    expect(got!.chessdb.size).toBe(0);
    // The never-answering fetch is never logged as settled.
    expect(fetchedLog()).toBeUndefined();
  });
});

describe("contract_grounding_fetched", () => {
  it("carries slowestMs in both modes and circuitOpen only with the breaker", async () => {
    await beginCoachContract(SMALL, { breaker: false }).within(Infinity);
    const off = fetchedLog()!;
    expect(off.slowestMs).toEqual({
      chessdb: expect.any(Number),
      lc0: 0,
      maia: 0,
    });
    expect(off).not.toHaveProperty("circuitOpen");
    expect(off.chessdb).toEqual({ requested: 1, ok: 0 });

    mockLog.info.mockClear();
    await beginCoachContract(SMALL, { breaker: true }).within(Infinity);
    const on = fetchedLog()!;
    expect(on.slowestMs).toEqual({
      chessdb: expect.any(Number),
      lc0: 0,
      maia: 0,
    });
    expect(on.circuitOpen).toEqual({ chessdb: 0, lc0: 0, maia: 0 });
  });

  it("is logged before buildCoachContract computes the half", async () => {
    const order: string[] = [];
    mockLog.info.mockImplementation((msg: string) => order.push(msg));
    await buildCoachContract(SMALL);
    expect(order.indexOf("contract_grounding_fetched")).toBe(0);
  });
});

describe("buildGameContextWithContract with an early wait", () => {
  const callEarly = (waitMs: number) =>
    buildGameContextWithContract(
      SMALL.moveHistory,
      SMALL.gameEval,
      SMALL.playerColor,
      undefined,
      SMALL.userRating,
      undefined,
      "u",
      undefined,
      { waitMs }
    );

  it("without it, returns no referee contract and the prompt is the build's", async () => {
    mockQueryChessdb.mockImplementation(async (fen: string) => chessdbOk(fen));
    const built = await buildGameContextWithContract(
      SMALL.moveHistory,
      SMALL.gameEval,
      SMALL.playerColor,
      undefined,
      SMALL.userRating,
      undefined,
      "u"
    );
    expect(built).not.toHaveProperty("refereeContract");
    expect(built.prompt).toContain("ChessDB cloud-eval");
  });

  it("when everything answered in time, the referee's contract is the prompt's own", async () => {
    mockQueryChessdb.mockImplementation(async (fen: string) => chessdbOk(fen));
    const plain = await buildGameContextWithContract(
      SMALL.moveHistory,
      SMALL.gameEval,
      SMALL.playerColor,
      undefined,
      SMALL.userRating,
      undefined,
      "u"
    );
    const early = await callEarly(25);
    expect(early.prompt).toBe(plain.prompt);
    expect(await early.refereeContract).toBe(early.contract);
    const logged = mockLog.info.mock.calls.find(
      (c) => c[0] === "contract_grounding_prompt"
    )?.[1];
    expect(logged).toMatchObject({
      complete: true,
      withheld: { chessdb: 0, lc0: 0, maia: 0 },
    });
    expect(typeof logged.promptWaitMs).toBe("number");
  });

  it("a late answer is left out of the prompt and reaches the referee's contract", async () => {
    const chessdb = deferredChessdb();
    const early = await callEarly(25);
    expect(early.prompt).not.toContain("ChessDB cloud-eval");
    expect(early.contract.insights[0].chessdb.status).toBe("unavailable");
    const logged = mockLog.info.mock.calls.find(
      (c) => c[0] === "contract_grounding_prompt"
    )?.[1];
    expect(logged).toMatchObject({
      complete: false,
      withheld: { chessdb: 1, lc0: 0, maia: 0 },
    });

    chessdb.release();
    const ref = await early.refereeContract!;
    expect(ref).not.toBe(early.contract);
    expect(ref.insights[0].chessdb.status).toBe("ok");
    expect(ref.insights[0].groundingContext).toContain("ChessDB cloud-eval");
    // The prompt's contract is untouched by the late result.
    expect(early.contract.insights[0].chessdb.status).toBe("unavailable");
  });
});
