// Two tabs both push progress. Each merged the server copy into its own state
// before pushing, but they hydrated at different moments, so each is a superset
// of a DIFFERENT starting point — and the one that lands last wins with
// whatever it happened to know. For a best score that means a personal best
// visibly going down. These pin the fields where that is not allowed.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "__ts__" },
  Timestamp: class {},
}));

const getAdminFirestore = vi.fn();
vi.mock("../firebaseAdmin", () => ({
  getAdminFirestore: () => getAdminFirestore(),
  AdminConfigError: class extends Error {},
}));
vi.mock("../handles", () => ({ getUidByHandle: vi.fn(), HANDLES: "handles" }));
vi.mock("../../auth/handle", () => ({ checkHandle: vi.fn() }));

import { updateUserProgressMonotone } from "../users";

let doc: Record<string, unknown> | undefined;
let updated: Record<string, unknown> | null;

beforeEach(() => {
  updated = null;
  doc = { progress: {} };
  getAdminFirestore.mockResolvedValue({
    collection: () => ({ doc: (id: string) => ({ id }) }),
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        get: async () => ({ exists: doc !== undefined, data: () => doc }),
        update: (_ref: unknown, data: Record<string, unknown>) => {
          if (doc === undefined) throw new Error("NOT_FOUND");
          updated = data;
          doc = { ...doc, ...data };
        },
      }),
  });
});

const progress = (over: Record<string, unknown> = {}) => ({
  streak: { current: 1, best: 1, lastActiveDay: "2026-09-03" },
  updatedAt: 1,
  ...over,
});

describe("updateUserProgressMonotone", () => {
  it("refuses to let a best score go backwards", async () => {
    doc = {
      progress: { rush: { threeMin: 30, fiveMin: 22, survivalBest: 14 } },
    };
    const stored = await updateUserProgressMonotone(
      "u1",
      progress({ rush: { threeMin: 12, fiveMin: 22, survivalBest: 0 } })
    );
    expect(stored.rush).toEqual({
      threeMin: 30,
      fiveMin: 22,
      survivalBest: 14,
    });
  });

  it("still lets a genuine improvement through", async () => {
    doc = { progress: { rush: { threeMin: 30, fiveMin: 0, survivalBest: 0 } } };
    const stored = await updateUserProgressMonotone(
      "u1",
      progress({ rush: { threeMin: 41, fiveMin: 0, survivalBest: 0 } })
    );
    expect(stored.rush).toMatchObject({ threeMin: 41 });
  });

  it("holds the coordinate trainer best to the same rule", async () => {
    doc = { progress: { coordinate: { best: 28 } } };
    const stored = await updateUserProgressMonotone(
      "u1",
      progress({ coordinate: { best: 3 } })
    );
    expect(stored.coordinate).toEqual({ best: 28 });
  });

  it("leaves everything else last-write-wins", async () => {
    doc = {
      progress: {
        streak: { current: 9, best: 9, lastActiveDay: "2026-08-01" },
        srs: { fork: { attempts: 5 } },
      },
    };
    const stored = await updateUserProgressMonotone(
      "u1",
      progress({ srs: {} })
    );
    // A pruned SRS map must STAY pruned — the retention caps depend on it.
    expect(stored.srs).toEqual({});
    expect(stored.streak).toEqual({
      current: 1,
      best: 1,
      lastActiveDay: "2026-09-03",
    });
  });

  it("replaces the progress field wholesale rather than merging into it", async () => {
    doc = { progress: { daily: { "2026-01-01": { puzzles: 3, themes: [] } } } };
    await updateUserProgressMonotone("u1", progress({ daily: {} }));
    // `update` semantics: the written value is the whole field, so Firestore
    // cannot resurrect the pruned day.
    expect((updated as unknown as Record<string, unknown>)?.progress).toEqual(
      progress({ daily: {} })
    );
  });

  it("accepts a first-ever push with nothing stored to compare against", async () => {
    doc = { progress: undefined };
    const stored = await updateUserProgressMonotone(
      "u1",
      progress({ rush: { threeMin: 7, fiveMin: 0, survivalBest: 0 } })
    );
    expect(stored.rush).toEqual({ threeMin: 7, fiveMin: 0, survivalBest: 0 });
  });

  it("does not resurrect an account that no longer exists", async () => {
    doc = undefined;
    await expect(
      updateUserProgressMonotone("gone", progress())
    ).rejects.toThrow();
  });
});
