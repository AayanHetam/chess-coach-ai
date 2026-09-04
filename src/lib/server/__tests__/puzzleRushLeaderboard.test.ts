// A leaderboard that publishes a score of 0, or lets a published best go
// DOWN, is worse than no leaderboard: the first fills every board with people
// who never played, the second destroys a real result unrecoverably (the
// per-user copy it was derived from may already have been overwritten too).
// Both shipped live — https://chessmasti.com/api/leaderboards/puzzle-rush
// returned nothing but zeros — so both are pinned here.
//
// The Firestore fake below implements `where`/`orderBy`/`limit`/`count` for
// real rather than recording calls, so deleting a filter from the source
// changes what these tests SEE, not just what they assert.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "__ts__" },
}));

const getAdminFirestore = vi.fn();
vi.mock("../firebaseAdmin", () => ({
  getAdminFirestore: () => getAdminFirestore(),
}));

import {
  getPuzzleRushLeaderboard,
  getPuzzleRushRank,
  getPuzzleRushRanks,
  upsertPuzzleRushLeaderboardEntry,
  type RushMode,
} from "../puzzleRushLeaderboard";

type Row = Record<string, unknown>;
let store: Map<string, Row>;

function matches(row: Row, f: { field: string; op: string; value: number }) {
  const v = row[f.field];
  if (typeof v !== "number") return false;
  return f.op === ">" ? v > f.value : true;
}

function makeQuery(filters: { field: string; op: string; value: number }[]) {
  let order: { field: string; dir: string } | null = null;
  let max = Infinity;
  const rows = () => {
    let out = Array.from(store.entries()).filter(([, r]) =>
      filters.every((f) => matches(r, f))
    );
    if (order) {
      const { field, dir } = order;
      out = out.sort(([, a], [, b]) => {
        const av = typeof a[field] === "number" ? (a[field] as number) : 0;
        const bv = typeof b[field] === "number" ? (b[field] as number) : 0;
        return dir === "desc" ? bv - av : av - bv;
      });
    }
    return out.slice(0, max);
  };
  const q = {
    where: (field: string, op: string, value: number) =>
      makeQuery([...filters, { field, op, value }]),
    orderBy: (field: string, dir: string) => {
      order = { field, dir };
      return q;
    },
    limit: (n: number) => {
      max = n;
      return q;
    },
    get: async () => ({
      docs: rows().map(([id, data]) => ({ id, data: () => data })),
    }),
    count: () => ({
      get: async () => ({ data: () => ({ count: rows().length }) }),
    }),
  };
  return q;
}

const db = {
  collection: () => ({
    doc: (id: string) => ({ id }),
    where: (field: string, op: string, value: number) =>
      makeQuery([{ field, op, value }]),
  }),
  runTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      get: async (ref: { id: string }) => ({
        exists: store.has(ref.id),
        data: () => store.get(ref.id),
      }),
      set: (ref: { id: string }, data: Row) =>
        store.set(ref.id, { ...(store.get(ref.id) ?? {}), ...data }),
    }),
};

const rush = (threeMin = 0, fiveMin = 0, survivalBest = 0) => ({
  threeMin,
  fiveMin,
  survivalBest,
});

beforeEach(() => {
  store = new Map();
  getAdminFirestore.mockResolvedValue(db);
});

describe("upsertPuzzleRushLeaderboardEntry", () => {
  it("never lowers a published best, whatever the client claims", async () => {
    await upsertPuzzleRushLeaderboardEntry("u1", "ana", rush(30, 22, 14));

    // The exact payload a browser sends before it has hydrated: all zeros.
    // Reported as "published nothing" because that is the truth — it is a
    // no-op under max-wins, and short-circuited before Firestore is touched.
    const published = await upsertPuzzleRushLeaderboardEntry(
      "u1",
      "ana",
      rush()
    );

    expect(store.get("u1")).toMatchObject({
      threeMin: 30,
      fiveMin: 22,
      survivalBest: 14,
    });
    expect(published).toBeNull();
  });

  it("raises only the modes that actually improved", async () => {
    await upsertPuzzleRushLeaderboardEntry("u1", "ana", rush(30, 22, 14));
    await upsertPuzzleRushLeaderboardEntry("u1", "ana", rush(31, 5, 14));
    expect(store.get("u1")).toMatchObject({
      threeMin: 31,
      fiveMin: 22,
      survivalBest: 14,
    });
  });

  it("does not enroll an account that has never scored", async () => {
    const published = await upsertPuzzleRushLeaderboardEntry(
      "u2",
      "newbie",
      rush()
    );
    expect(published).toBeNull();
    expect(store.has("u2")).toBe(false);
  });

  it("publishes as soon as one mode is non-zero", async () => {
    const published = await upsertPuzzleRushLeaderboardEntry(
      "u3",
      "bo",
      rush(0, 0, 7)
    );
    expect(published).toEqual({ threeMin: 0, fiveMin: 0, survivalBest: 7 });
    expect(store.get("u3")).toMatchObject({ handle: "bo", survivalBest: 7 });
  });

  it("keeps the handle current when it changes", async () => {
    await upsertPuzzleRushLeaderboardEntry("u1", "old", rush(30));
    await upsertPuzzleRushLeaderboardEntry("u1", "new", rush(30));
    expect(store.get("u1")).toMatchObject({ handle: "new" });
  });
});

describe("getPuzzleRushLeaderboard", () => {
  it("omits players whose score in THIS mode is zero", async () => {
    // Exactly the shape that broke production: real 3-minute players carry
    // fiveMin: 0, and the five-minute board was nothing but those zeros.
    store.set("a", {
      handle: "ana",
      threeMin: 30,
      fiveMin: 0,
      survivalBest: 0,
    });
    store.set("b", { handle: "bo", threeMin: 12, fiveMin: 0, survivalBest: 0 });

    expect(await getPuzzleRushLeaderboard("fiveMin")).toEqual([]);
    expect(await getPuzzleRushLeaderboard("threeMin")).toEqual([
      { handle: "ana", score: 30 },
      { handle: "bo", score: 12 },
    ]);
  });

  it("ranks highest first and honours the limit", async () => {
    store.set("a", { handle: "ana", threeMin: 12 });
    store.set("b", { handle: "bo", threeMin: 30 });
    store.set("c", { handle: "cy", threeMin: 21 });
    expect(await getPuzzleRushLeaderboard("threeMin", 2)).toEqual([
      { handle: "bo", score: 30 },
      { handle: "cy", score: 21 },
    ]);
  });

  it("skips malformed rows rather than rendering them", async () => {
    store.set("a", { handle: "ana", threeMin: 30 });
    store.set("b", { handle: 42, threeMin: 99 });
    expect(await getPuzzleRushLeaderboard("threeMin")).toEqual([
      { handle: "ana", score: 30 },
    ]);
  });
});

describe("getPuzzleRushRank", () => {
  beforeEach(() => {
    store.set("a", { handle: "ana", threeMin: 30 });
    store.set("b", { handle: "bo", threeMin: 21 });
    store.set("c", { handle: "cy", threeMin: 12 });
  });

  it("counts only the scores that beat it", async () => {
    expect(await getPuzzleRushRank("threeMin", 30)).toBe(1);
    expect(await getPuzzleRushRank("threeMin", 12)).toBe(3);
    expect(await getPuzzleRushRank("threeMin", 1)).toBe(4);
  });

  it("gives tied players the same, better rank", async () => {
    store.set("d", { handle: "di", threeMin: 21 });
    expect(await getPuzzleRushRank("threeMin", 21)).toBe(2);
  });

  it("has no rank to report for someone who has not scored", async () => {
    expect(await getPuzzleRushRank("threeMin", 0)).toBeNull();
    expect(await getPuzzleRushRank("threeMin", Number.NaN)).toBeNull();
  });
});

describe("index invariant", () => {
  it("filters and orders on the same field, so no composite index is needed", async () => {
    const seen: { field: string; op: string }[] = [];
    const orders: string[] = [];
    getAdminFirestore.mockResolvedValue({
      ...db,
      collection: () => ({
        doc: (id: string) => ({ id }),
        where: (field: string, op: string, value: number) => {
          seen.push({ field, op });
          const q = makeQuery([{ field, op, value }]);
          const wrapped = {
            ...q,
            orderBy: (f: string, d: string) => {
              orders.push(f);
              q.orderBy(f, d);
              return wrapped;
            },
          };
          return wrapped;
        },
      }),
    });
    const mode: RushMode = "survivalBest";
    await getPuzzleRushLeaderboard(mode);
    expect(seen).toEqual([{ field: mode, op: ">" }]);
    expect(orders).toEqual([mode]);
  });
});

describe("implausible scores", () => {
  // The score is whatever the client says it is, and max-wins makes a
  // published value permanent — so an absurd claim would be an unremovable
  // top entry. These bounds are the only thing standing in front of that.
  it("refuses a claim no human could have produced", async () => {
    const published = await upsertPuzzleRushLeaderboardEntry(
      "cheat",
      "cheat",
      rush(99999, 0, 0)
    );
    expect(published).toBeNull();
    expect(store.has("cheat")).toBe(false);
  });

  it("drops only the implausible mode, keeping the real scores beside it", async () => {
    const published = await upsertPuzzleRushLeaderboardEntry(
      "u1",
      "ana",
      rush(99999, 24, 0)
    );
    expect(published).toEqual({ threeMin: 0, fiveMin: 24, survivalBest: 0 });
    expect(await getPuzzleRushLeaderboard("threeMin")).toEqual([]);
    expect(await getPuzzleRushLeaderboard("fiveMin")).toEqual([
      { handle: "ana", score: 24 },
    ]);
  });

  it("cannot be used to lower a score that is already published", async () => {
    await upsertPuzzleRushLeaderboardEntry("u1", "ana", rush(30));
    await upsertPuzzleRushLeaderboardEntry("u1", "ana", rush(99999));
    expect(store.get("u1")).toMatchObject({ threeMin: 30 });
  });

  it("still accepts a very strong but human result", async () => {
    const published = await upsertPuzzleRushLeaderboardEntry(
      "u1",
      "ana",
      rush(120, 0, 0)
    );
    expect(published).toMatchObject({ threeMin: 120 });
  });

  it("rejects a non-integer claim", async () => {
    const published = await upsertPuzzleRushLeaderboardEntry("u1", "ana", {
      threeMin: 12.5,
      fiveMin: 0,
      survivalBest: 0,
    });
    expect(published).toBeNull();
  });
});

describe("blank handles", () => {
  it("never publishes a row nobody can read", async () => {
    expect(
      await upsertPuzzleRushLeaderboardEntry("u1", "   ", rush(30))
    ).toBeNull();
    expect(store.has("u1")).toBe(false);
  });

  it("stores the handle trimmed", async () => {
    await upsertPuzzleRushLeaderboardEntry("u1", "  ana  ", rush(30));
    expect(store.get("u1")).toMatchObject({ handle: "ana" });
  });

  it("skips a blank stored handle when reading", async () => {
    store.set("a", { handle: "   ", threeMin: 30 });
    store.set("b", { handle: "bo", threeMin: 12 });
    expect(await getPuzzleRushLeaderboard("threeMin")).toEqual([
      { handle: "bo", score: 12 },
    ]);
  });
});

describe("getPuzzleRushRanks", () => {
  it("reports a standing for every mode, so switching modes keeps it", async () => {
    store.set("a", {
      handle: "ana",
      threeMin: 30,
      fiveMin: 40,
      survivalBest: 9,
    });
    store.set("b", {
      handle: "bo",
      threeMin: 12,
      fiveMin: 80,
      survivalBest: 3,
    });
    expect(
      await getPuzzleRushRanks({ threeMin: 12, fiveMin: 40, survivalBest: 0 })
    ).toEqual({ threeMin: 2, fiveMin: 2, survivalBest: null });
  });
});
