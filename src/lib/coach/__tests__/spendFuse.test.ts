import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The daily spend fuse. Three properties matter more than the arithmetic:
 *
 *   1. DEFAULT OFF. With no budget configured it must never refuse anything.
 *      This ships dark, so a bug here cannot take the coach down before
 *      anyone has chosen a number.
 *   2. FAILS OPEN. A Firestore outage must not become a coach outage — we
 *      have direct evidence (2026-08-19 → 2026-09-01) that the dark-coach
 *      failure is the more expensive one.
 *   3. A BAD NUMBER DISARMS IT. A typo in an env var must not block every
 *      request; that is the same mistake as failing closed, wearing a hat.
 */

const { mockGet, mockSet, mockDoc, mockCollection } = vi.hoisted(() => {
  const mockGet = vi.fn();
  const mockSet = vi.fn();
  const mockDoc = vi.fn(() => ({ get: mockGet, set: mockSet }));
  const mockCollection = vi.fn(() => ({ doc: mockDoc }));
  return { mockGet, mockSet, mockDoc, mockCollection };
});

vi.mock("@/lib/logging", () => ({
  logger: {
    child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
}));
vi.mock("@/lib/server/firebaseAdmin", () => ({
  getAdminFirestore: async () => ({ collection: mockCollection }),
}));
vi.mock("@/lib/server/withFirestoreTimeout", () => ({
  withFirestoreTimeout: <T,>(p: Promise<T>) => p,
}));
vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { increment: (n: number) => ({ __inc: n }), serverTimestamp: () => "ts" },
}));

import {
  __resetSpendFuseForTests,
  costOfCall,
  dailyBudgetUsd,
  isOverDailyBudget,
  recordSpend,
  spendDayKey,
} from "../spendFuse";

const ORIGINAL = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  __resetSpendFuseForTests();
  delete process.env.DAILY_AI_BUDGET_USD;
  mockGet.mockResolvedValue({ data: () => ({ usd: 0 }) });
  mockSet.mockResolvedValue(undefined);
});
afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("arming", () => {
  it("is disarmed by default", () => {
    expect(dailyBudgetUsd()).toBeNull();
  });

  it("never refuses while disarmed, however much has been spent", async () => {
    mockGet.mockResolvedValue({ data: () => ({ usd: 9_999 }) });
    await expect(isOverDailyBudget()).resolves.toBe(false);
    // And it must not even ask Firestore when there is no ceiling to compare to.
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("treats a non-numeric or non-positive budget as disarmed", () => {
    for (const raw of ["abc", "0", "-5", ""]) {
      process.env.DAILY_AI_BUDGET_USD = raw;
      expect(dailyBudgetUsd()).toBeNull();
    }
  });
});

describe("tripping", () => {
  beforeEach(() => {
    process.env.DAILY_AI_BUDGET_USD = "10";
  });

  it("allows calls below the ceiling", async () => {
    mockGet.mockResolvedValue({ data: () => ({ usd: 9.5 }) });
    await expect(isOverDailyBudget()).resolves.toBe(false);
  });

  it("refuses once the ceiling is reached", async () => {
    mockGet.mockResolvedValue({ data: () => ({ usd: 10 }) });
    await expect(isOverDailyBudget()).resolves.toBe(true);
  });

  it("FAILS OPEN when the store is unreachable", async () => {
    mockGet.mockRejectedValue(new Error("firestore down"));
    await expect(isOverDailyBudget()).resolves.toBe(false);
  });

  it("trips within one refresh window as spend accumulates locally", async () => {
    mockGet.mockResolvedValue({ data: () => ({ usd: 9 }) });
    await expect(isOverDailyBudget()).resolves.toBe(false);
    // A burst inside the cache window must still trip it — otherwise the
    // ceiling is only enforced once a minute.
    recordSpend(2);
    await expect(isOverDailyBudget()).resolves.toBe(true);
  });

  it("reads the day's total once per burst, not once per call", async () => {
    mockGet.mockResolvedValue({ data: () => ({ usd: 1 }) });
    await Promise.all([isOverDailyBudget(), isOverDailyBudget(), isOverDailyBudget()]);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });
});

describe("recording", () => {
  it("writes nothing durable while disarmed", () => {
    recordSpend(1.23);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("increments the day's document when armed", async () => {
    process.env.DAILY_AI_BUDGET_USD = "10";
    recordSpend(0.25, new Date("2026-09-01T12:00:00Z"));
    await new Promise((r) => setTimeout(r, 0));
    expect(mockDoc).toHaveBeenCalledWith("2026-09-01");
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ usd: { __inc: 0.25 } }),
      { merge: true },
    );
  });

  it("ignores a zero or negative charge", () => {
    process.env.DAILY_AI_BUDGET_USD = "10";
    recordSpend(0);
    recordSpend(-1);
    expect(mockSet).not.toHaveBeenCalled();
  });
});

describe("cost", () => {
  it("prices a Sonnet call from the shared pricing table", () => {
    // 1M input + 1M output at $3 / $15.
    const usd = costOfCall({
      model: "claude-sonnet-4-6",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(usd).toBeCloseTo(18, 5);
  });

  it("prices cache reads far below fresh input", () => {
    const fresh = costOfCall({ model: "claude-sonnet-4-6", inputTokens: 1_000_000 });
    const cached = costOfCall({ model: "claude-sonnet-4-6", cacheReadTokens: 1_000_000 });
    expect(cached).toBeLessThan(fresh / 5);
  });

  it("returns 0 for an unknown model rather than inventing a price", () => {
    expect(costOfCall({ model: "some-future-model", inputTokens: 1_000_000 })).toBe(0);
  });
});

describe("day key", () => {
  it("is the UTC date, so the window does not move with the reader", () => {
    expect(spendDayKey(new Date("2026-09-01T23:59:59Z"))).toBe("2026-09-01");
    expect(spendDayKey(new Date("2026-09-02T00:00:01Z"))).toBe("2026-09-02");
  });
});
