/**
 * The early-grounding build's parity (pathway 4.8a): with every fetch
 * settled, `beginCoachContract`, `prepare`, `within(Infinity)` and `ground`
 * (the breaker on, as COACH_TURN1_EARLY_STREAM runs it) give the contract
 * `buildCoachContract` gives, byte for byte in both renderings and deep-equal
 * but for its two timings, on all ten real fixtures. Once with every source
 * answering and once with every source rejecting. The rest of the split is
 * pinned in builderEarlyGrounding.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockQueryChessdb,
  mockQueryLc0,
  mockShouldCallLc0,
  mockQueryMaia,
  mockShouldCallMaia,
} = vi.hoisted(() => ({
  mockQueryChessdb: vi.fn(),
  mockQueryLc0: vi.fn(),
  mockShouldCallLc0: vi.fn(),
  mockQueryMaia: vi.fn(),
  mockShouldCallMaia: vi.fn(),
}));

vi.mock("@/lib/logging", () => ({
  logger: {
    child: () => ({
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    }),
  },
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

import { beginCoachContract, buildCoachContract } from "@/lib/contract/builder";
import {
  renderLegacyPrompt,
  serializeForVerbalizer,
} from "@/lib/contract/serialize";
import { __resetCircuitBreakers } from "@/lib/grounding/circuitBreaker";
import {
  argsFor,
  chessdbOk,
  lc0Ok,
  maiaOk,
  REAL_FIXTURES,
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

function rejectEverything(): void {
  mockShouldCallLc0.mockReturnValue(true);
  mockShouldCallMaia.mockReturnValue(true);
  mockQueryChessdb.mockRejectedValue(new Error("chessdb down"));
  mockQueryLc0.mockRejectedValue(new Error("lc0 down"));
  mockQueryMaia.mockRejectedValue(new Error("maia down"));
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetCircuitBreakers();
});

/** Every real fixture builds twice per mode, a second or two each, and more under load. */
const PARITY_TIMEOUT_MS = 240_000;

describe("parity: begin, prepare and ground with everything settled is buildCoachContract", () => {
  for (const mode of ["answering", "rejecting"] as const) {
    it(
      `on all ten real fixtures, every source ${mode}`,
      async () => {
        expect(REAL_FIXTURES).toHaveLength(10);
        let groundedSomething = false;
        for (const name of REAL_FIXTURES) {
          const args = argsFor(name);
          if (mode === "answering") answerEverything();
          else rejectEverything();

          __resetCircuitBreakers();
          const pending = beginCoachContract(args, { breaker: true });
          await pending.prepare();
          const g = await pending.within(Infinity);
          expect(g.complete).toBe(true);
          const early = pending.ground(g);

          __resetCircuitBreakers();
          const built = await buildCoachContract(args);

          expect(serializeForVerbalizer(early)).toBe(
            serializeForVerbalizer(built)
          );
          expect(renderLegacyPrompt(early)).toBe(renderLegacyPrompt(built));
          expect(withoutTimes(early)).toEqual(withoutTimes(built));
          // Key order is serialized order: the JSON matches, not only the values.
          expect(JSON.stringify(withoutTimes(early))).toBe(
            JSON.stringify(withoutTimes(built))
          );
          if (
            built.insights.some(
              (i) =>
                i.chessdb.status === "ok" &&
                i.lc0.status === "ok" &&
                i.visibility.status === "ok"
            )
          ) {
            groundedSomething = true;
          }
        }
        // The answering run did carry every source into some insight.
        expect(groundedSomething).toBe(mode === "answering");
      },
      PARITY_TIMEOUT_MS
    );
  }
});
